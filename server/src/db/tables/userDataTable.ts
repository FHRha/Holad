import { db } from '../connection.js';

export function deleteUserData(userId: string): void {
  if (!userId) return;
  try {
    db.prepare('DELETE FROM exclusions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM history WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM preferences WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM playback_state WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM integrations WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM playlists WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?').run(userId, userId);
    db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
  } catch (err) {
    console.error(`[DB] Failed to delete user data for ${userId}:`, err);
  }
}
