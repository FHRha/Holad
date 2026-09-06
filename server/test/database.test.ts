import { describe, it, expect } from 'vitest';
import * as database from '../src/database.js';

describe('Database Social & Friend Functions', () => {
  const id = Date.now().toString();
  const userA = 'user_alice_' + id;
  const userB = 'user_bob_' + id;
  const userC = 'user_charlie_' + id;
  const nameA = 'Alice_' + id;
  const nameB = 'Bob_' + id;
  const nameC = 'Charlie_' + id;

  let recordA: database.UserRecord;
  let recordB: database.UserRecord;
  let recordC: database.UserRecord;

  it('ensureUserWithTag creates a user with a unique 4-digit tag', () => {
    recordA = database.ensureUserWithTag(userA, nameA);
    expect(recordA.user_id).toBe(userA);
    expect(recordA.username).toBe(nameA);
    expect(recordA.tag).toMatch(/^\d{4}$/);

    // Subsequent call should preserve the tag
    const recordA2 = database.ensureUserWithTag(userA, nameA);
    expect(recordA2.tag).toBe(recordA.tag);
  });

  it('ensureUserWithTag generates unique tags when usernames are identical', () => {
    const userAClone = userA + '_clone';
    const recordClone = database.ensureUserWithTag(userAClone, nameA);
    expect(recordClone.username).toBe(nameA);
    expect(recordClone.tag).toMatch(/^\d{4}$/);
    expect(recordClone.tag).not.toBe(recordA.tag);
  });

  it('searchUsers finds users by name or name#tag and excludes currentUserId', () => {
    recordB = database.ensureUserWithTag(userB, nameB);

    // Search by username
    const resultsName = database.searchUsers(nameB, userA);
    expect(resultsName.some(u => u.user_id === userB)).toBe(true);

    // Search by username#tag
    const resultsTag = database.searchUsers(`${nameB}#${recordB.tag}`, userA);
    expect(resultsTag.some(u => u.user_id === userB)).toBe(true);

    // Excludes current user
    const resultsSelf = database.searchUsers(nameA, userA);
    expect(resultsSelf.some(u => u.user_id === userA)).toBe(false);
  });

  it('sendFriendRequest sends a pending request and prevents invalid requests', () => {
    recordC = database.ensureUserWithTag(userC, nameC);

    // Cannot send to self (via tag)
    expect(() => database.sendFriendRequest(userA, `${nameA}#${recordA.tag}`)).toThrow(/Cannot send friend request to yourself/);

    // Nonexistent target
    expect(() => database.sendFriendRequest(userA, 'NonExistentUser99999')).toThrow(/User not found/);

    // Send valid request
    const target = database.sendFriendRequest(userA, `${nameB}#${recordB.tag}`);
    expect(target.user_id).toBe(userB);

    // Duplicate pending throws
    expect(() => database.sendFriendRequest(userA, `${nameB}#${recordB.tag}`)).toThrow(/Friend request already sent/);
  });

  it('getPendingRequests returns incoming and outgoing requests', () => {
    const pendingB = database.getPendingRequests(userB);
    expect(pendingB.incoming.some(r => r.user_id === userA)).toBe(true);

    const pendingA = database.getPendingRequests(userA);
    expect(pendingA.outgoing.some(r => r.user_id === userB)).toBe(true);
  });

  it('respondFriendRequest accept updates status to accepted and getFriends returns accepted friends', () => {
    // Bob accepts Alice's request
    database.respondFriendRequest(userB, userA, 'accept');

    const friendsOfA = database.getFriends(userA);
    expect(friendsOfA.some(f => f.user_id === userB)).toBe(true);

    const friendsOfB = database.getFriends(userB);
    expect(friendsOfB.some(f => f.user_id === userA)).toBe(true);

    // Pending requests should now be empty for these two
    const pendingB = database.getPendingRequests(userB);
    expect(pendingB.incoming.some(r => r.user_id === userA)).toBe(false);
  });

  it('respondFriendRequest reject removes the pending request', () => {
    // User C sends request to User A
    database.sendFriendRequest(userC, `${nameA}#${recordA.tag}`);
    let pendingA = database.getPendingRequests(userA);
    expect(pendingA.incoming.some(r => r.user_id === userC)).toBe(true);

    // Alice rejects Charlie's request
    database.respondFriendRequest(userA, userC, 'reject');
    pendingA = database.getPendingRequests(userA);
    expect(pendingA.incoming.some(r => r.user_id === userC)).toBe(false);
  });

  it('removeFriend removes accepted friendship', () => {
    // Alice removes Bob
    database.removeFriend(userA, userB);
    const friendsOfA = database.getFriends(userA);
    expect(friendsOfA.some(f => f.user_id === userB)).toBe(false);
    const friendsOfB = database.getFriends(userB);
    expect(friendsOfB.some(f => f.user_id === userA)).toBe(false);
  });
});
