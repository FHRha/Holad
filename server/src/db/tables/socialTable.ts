import crypto from 'crypto';
import { db } from '../connection.js';
import type { UserRecord, FriendRecord, PendingRequest } from '../types.js';

// Ensure user exists before inserting related data
export function ensureUserExists(userId: string): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)');
  stmt.run(userId);
}

export function ensureUserWithTag(userId: string, username: string, avatarUrl?: string): UserRecord {
  const finalUsername = username || userId;

  db.prepare('INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)').run(userId, finalUsername);

  let user = db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE user_id = ?').get(userId) as UserRecord;

  let currentTag = user.tag;
  if (!currentTag) {
    const existingTags = new Set(
      (db.prepare('SELECT tag FROM users WHERE username = ? AND tag IS NOT NULL AND user_id != ?').all(finalUsername, userId) as { tag: string }[])
        .map(row => row.tag)
    );
    for (let attempts = 0; attempts < 50; attempts++) {
      const candidateTag = crypto.randomInt(0, 10000).toString().padStart(4, '0');
      if (!existingTags.has(candidateTag)) {
        currentTag = candidateTag;
        break;
      }
    }
    if (!currentTag) {
      currentTag = crypto.randomInt(1000, 10000).toString();
    }
  }

  const updatedAvatar = avatarUrl !== undefined ? avatarUrl : user.avatar_url;
  db.prepare(`
    UPDATE users 
    SET username = ?, tag = ?, avatar_url = ?, last_seen = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `).run(finalUsername, currentTag, updatedAvatar, userId);

  return db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE user_id = ?').get(userId) as UserRecord;
}

export function searchUsers(query: string, currentUserId: string): Array<{ user_id: string; username: string; tag: string; avatar_url: string | null }> {
  if (!query || !query.trim()) return [];
  const trimmed = query.trim();
  const pattern = `%${trimmed}%`;
  const cleanTag = trimmed.startsWith('#') ? trimmed.substring(1) : trimmed;
  return db.prepare(`
    SELECT user_id, COALESCE(username, user_id) AS username, tag, avatar_url 
    FROM users 
    WHERE user_id != ? 
      AND (
        LOWER(COALESCE(username, user_id)) LIKE LOWER(?) 
        OR LOWER(COALESCE(username, user_id) || '#' || tag) LIKE LOWER(?)
        OR LOWER(tag) LIKE LOWER(?)
        OR LOWER('#' || tag) LIKE LOWER(?)
        OR tag = ?
      )
    LIMIT 20
  `).all(currentUserId, pattern, pattern, pattern, pattern, cleanTag) as any[];
}

export function getFriends(userId: string): FriendRecord[] {
  return db.prepare(`
    SELECT 
      u.user_id, 
      COALESCE(u.username, u.user_id) AS username, 
      u.tag, 
      u.avatar_url, 
      f.created_at
    FROM friends f
    JOIN users u ON u.user_id = (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END)
    WHERE (f.user_id = ? OR f.friend_id = ?) 
      AND f.status = 'accepted'
    ORDER BY u.username COLLATE NOCASE ASC
  `).all(userId, userId, userId) as FriendRecord[];
}

export function getPendingRequests(userId: string): { incoming: PendingRequest[]; outgoing: PendingRequest[] } {
  const incoming = db.prepare(`
    SELECT 
      f.id,
      u.user_id,
      COALESCE(u.username, u.user_id) AS username,
      u.tag,
      u.avatar_url,
      f.created_at
    FROM friends f
    JOIN users u ON u.user_id = f.user_id
    WHERE f.friend_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId) as PendingRequest[];

  const outgoing = db.prepare(`
    SELECT 
      f.id,
      u.user_id,
      COALESCE(u.username, u.user_id) AS username,
      u.tag,
      u.avatar_url,
      f.created_at
    FROM friends f
    JOIN users u ON u.user_id = f.friend_id
    WHERE f.user_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId) as PendingRequest[];

  return { incoming, outgoing };
}

export function sendFriendRequest(userId: string, targetTagOrName: string): UserRecord {
  if (!targetTagOrName || !targetTagOrName.trim()) {
    throw new Error('User not found');
  }
  const trimmed = targetTagOrName.trim();
  let targetUser: UserRecord | undefined;

  if (trimmed.includes('#')) {
    const hashIndex = trimmed.lastIndexOf('#');
    const uname = trimmed.substring(0, hashIndex).trim();
    const tag = trimmed.substring(hashIndex + 1).trim();
    if (uname) {
      targetUser = db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE username = ? COLLATE NOCASE AND tag = ?').get(uname, tag) as UserRecord | undefined;
    } else {
      targetUser = db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE tag = ?').get(tag) as UserRecord | undefined;
    }
  } else {
    targetUser = db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE username = ? COLLATE NOCASE OR user_id = ? OR tag = ?').get(trimmed, trimmed, trimmed) as UserRecord | undefined;
  }

  if (!targetUser) {
    throw new Error('User not found');
  }

  if (targetUser.user_id === userId) {
    throw new Error('Cannot send friend request to yourself');
  }

  ensureUserExists(userId);

  const existing = db.prepare(`
    SELECT id, user_id, friend_id, status 
    FROM friends 
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).get(userId, targetUser.user_id, targetUser.user_id, userId) as any;

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('Already friends');
    }
    if (existing.status === 'blocked') {
      throw new Error('User is blocked');
    }
    if (existing.status === 'pending') {
      if (existing.user_id === userId) {
        throw new Error('Friend request already sent');
      } else {
        db.prepare("UPDATE friends SET status = 'accepted' WHERE id = ?").run(existing.id);
        return targetUser;
      }
    }
  }

  db.prepare(`
    INSERT INTO friends (user_id, friend_id, status)
    VALUES (?, ?, 'pending')
  `).run(userId, targetUser.user_id);

  return targetUser;
}

export function respondFriendRequest(userId: string, requesterUserId: string, action: 'accept' | 'reject'): void {
  if (action === 'accept') {
    const res = db.prepare(`
      UPDATE friends 
      SET status = 'accepted' 
      WHERE user_id = ? AND friend_id = ? AND status = 'pending'
    `).run(requesterUserId, userId);
    if (res.changes === 0) {
      db.prepare(`
        UPDATE friends 
        SET status = 'accepted' 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `).run(userId, requesterUserId);
    }
  } else if (action === 'reject') {
    db.prepare(`
      DELETE FROM friends 
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) 
        AND status = 'pending'
    `).run(requesterUserId, userId, userId, requesterUserId);
  }
}

export function removeFriend(userId: string, friendId: string): void {
  db.prepare(`
    DELETE FROM friends 
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).run(userId, friendId, friendId, userId);
}
