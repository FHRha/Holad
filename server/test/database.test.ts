import { describe, it, expect } from 'vitest';
import nodeCrypto from 'crypto';
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

describe('Database Navidrome Accounts Storage & Migration', () => {
  it('saves, retrieves, and deletes navidrome accounts', () => {
    const testUrl = 'http://test-navidrome-server.local:4533';
    const testUser = 'db_test_user';

    database.saveNavidromeAccount({
      url: testUrl,
      user: testUser,
      token: 'tok123',
      salt: 'salt123'
    });

    const accounts = database.getNavidromeAccounts();
    const found = accounts.find(a => a.user === testUser && a.url === testUrl);
    expect(found).toBeDefined();
    expect(found?.token).toBe('tok123');
    expect(found?.salt).toBe('salt123');

    // Update account
    database.saveNavidromeAccount({
      url: testUrl,
      user: testUser,
      token: 'newtok',
      salt: 'newsalt'
    });
    const updated = database.getNavidromeAccounts().find(a => a.user === testUser && a.url === testUrl);
    expect(updated?.token).toBe('newtok');
    expect(updated?.salt).toBe('newsalt');

    // Delete account
    database.deleteNavidromeAccount(testUser, testUrl);
    const deleted = database.getNavidromeAccounts().find(a => a.user === testUser && a.url === testUrl);
    expect(deleted).toBeUndefined();
  });

  it('encrypts sensitive fields at rest in SQLite database', () => {
    const testUrl = 'http://encrypted-navidrome.local:4533';
    const testUser = 'enc_user';
    const plainToken = 'secret-token-abc';
    const plainSalt = 'secret-salt-xyz';
    const plainPass = 'super-secret-password';

    database.saveNavidromeAccount({
      url: testUrl,
      user: testUser,
      token: plainToken,
      salt: plainSalt,
      pass: plainPass
    });

    // API retrieves decrypted values transparently
    const accounts = database.getNavidromeAccounts();
    const account = accounts.find(a => a.user === testUser);
    expect(account?.token).toBe(plainToken);
    expect(account?.salt).toBe(plainSalt);
    expect(account?.pass).toBe(plainPass);

    // Verify encryption helper produces ciphertext with IV format and decrypts back
    const encrypted = database.safeEncrypt(plainPass);
    expect(encrypted).not.toBe(plainPass);
    expect(encrypted).toContain(':');
    expect(database.safeDecrypt(encrypted)).toBe(plainPass);

    // Cleanup
    database.deleteNavidromeAccount(testUser, testUrl);
  });

  it('migrates accounts from process.env', () => {
    const origAccounts = process.env.NAVIDROME_ACCOUNTS;
    const origUrl = process.env.NAVIDROME_URL;

    const mockAccounts = [
      { url: 'http://env-navidrome-1.local', user: 'env_user_1', token: 't1', salt: 's1' },
      { url: 'http://env-navidrome-2.local', user: 'env_user_2', token: 't2', salt: 's2' }
    ];
    process.env.NAVIDROME_ACCOUNTS = JSON.stringify(mockAccounts);

    const result = database.migrateAccountsFromEnv();
    expect(result.migratedCount).toBeGreaterThanOrEqual(1);

    const accounts = database.getNavidromeAccounts();
    expect(accounts.some(a => a.user === 'env_user_1')).toBe(true);
    expect(accounts.some(a => a.user === 'env_user_2')).toBe(true);

    // Cleanup
    database.deleteNavidromeAccount('env_user_1', 'http://env-navidrome-1.local');
    database.deleteNavidromeAccount('env_user_2', 'http://env-navidrome-2.local');
    if (origAccounts !== undefined) {
      process.env.NAVIDROME_ACCOUNTS = origAccounts;
    } else {
      delete process.env.NAVIDROME_ACCOUNTS;
    }
    if (origUrl !== undefined) {
      process.env.NAVIDROME_URL = origUrl;
    } else {
      delete process.env.NAVIDROME_URL;
    }
  });
});

describe('Custom Playlists Functions', () => {
  const playlistId = 'custom_pl_' + Date.now();
  const userId = 'pl_user_' + Date.now();

  it('saveCustomPlaylist and getCustomPlaylist without userId', () => {
    database.saveCustomPlaylist(playlistId, 'My Test Playlist', 'A description', ['track1', 'track2', 'track3']);
    const pl = database.getCustomPlaylist(playlistId);
    expect(pl).toEqual({
      id: playlistId,
      name: 'My Test Playlist',
      description: 'A description',
      trackIds: ['track1', 'track2', 'track3'],
      tracks: [{ id: 'track1' }, { id: 'track2' }, { id: 'track3' }]
    });
  });

  it('saveCustomPlaylist updates existing playlist and replaces trackIds', () => {
    database.saveCustomPlaylist(playlistId, 'Updated Playlist', 'New description', ['trackA', 'trackB'], userId);
    const pl = database.getCustomPlaylist(playlistId);
    expect(pl).toEqual({
      id: playlistId,
      name: 'Updated Playlist',
      description: 'New description',
      trackIds: ['trackA', 'trackB'],
      tracks: [{ id: 'trackA' }, { id: 'trackB' }]
    });
  });

  it('saveCustomPlaylist preserves full track metadata in songs JSON and getCustomPlaylist returns it', () => {
    const metaPlaylistId = 'custom_meta_pl_' + Date.now();
    const trackMetadata = [
      { id: 'track1', title: 'Song 1', artist: 'Artist 1' },
      { id: 'track2', title: 'Song 2', artist: 'Artist 2' }
    ];
    database.saveCustomPlaylist(metaPlaylistId, 'Meta Playlist', 'With metadata', ['track1', 'track2'], undefined, trackMetadata);
    const pl = database.getCustomPlaylist(metaPlaylistId);
    expect(pl).toEqual({
      id: metaPlaylistId,
      name: 'Meta Playlist',
      description: 'With metadata',
      trackIds: ['track1', 'track2'],
      tracks: trackMetadata
    });
  });

  it('deleteCustomPlaylist removes playlist and tracks from database and returns true', () => {
    const toDeleteId = 'del_pl_' + Date.now();
    database.saveCustomPlaylist(toDeleteId, 'To Delete', '', ['track1', 'track2']);
    expect(database.getCustomPlaylist(toDeleteId)).not.toBeNull();

    const result = database.deleteCustomPlaylist(toDeleteId);
    expect(result).toBe(true);
    expect(database.getCustomPlaylist(toDeleteId)).toBeNull();

    // Deleting again should return false
    const deleteAgain = database.deleteCustomPlaylist(toDeleteId);
    expect(deleteAgain).toBe(false);
  });

  it('getCustomPlaylist returns null for nonexistent playlist', () => {
    const pl = database.getCustomPlaylist('nonexistent_pl_id_9999');
    expect(pl).toBeNull();
  });
});

describe('Database Legacy Security Data Migration', () => {
  const legacyKey = Buffer.from('default_secret_key_needs_change_');

  function createLegacyCbc(text: string): string {
    const iv = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
    const cipher = nodeCrypto.createCipheriv('aes-256-cbc', legacyKey, iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');
    return `${iv.toString('hex')}:${enc}`;
  }

  it('decrypt can decrypt legacy aes-256-cbc format', () => {
    const secret = 'my_legacy_super_secret_token';
    const legacyCipher = createLegacyCbc(secret);
    const decrypted = database.decrypt(legacyCipher);
    expect(decrypted).toBe(secret);
  });

  it('migrateLegacySecurityData re-encrypts legacy navidrome accounts and integrations to AES-256-GCM', () => {
    const testUser = 'mig_user_' + Date.now();
    const testUrl = 'http://migration-test.local';
    const originalToken = 'token_secret_123';
    const originalSalt = 'salt_secret_456';
    const originalPass = 'pass_secret_789';

    const legacyToken = createLegacyCbc(originalToken);

    // Insert legacy raw account (legacy CBC token, raw plaintext salt and pass)
    database.insertRawAccountForTesting(testUser, testUrl, legacyToken, originalSalt, originalPass);

    // Also seed a legacy integration with CBC token
    database.insertRawIntegrationForTesting(testUser, 'lastfm', createLegacyCbc('lastfm_legacy_token_999'));

    // Run security migration
    const result = database.migrateLegacySecurityData();
    expect(result.migratedAccounts).toBeGreaterThanOrEqual(1);
    expect(result.migratedIntegrations).toBeGreaterThanOrEqual(1);

    // Verify navidrome_accounts are now in GCM format
    const accounts = database.getNavidromeAccounts();
    const acc = accounts.find(a => a.user === testUser && a.url === testUrl);
    expect(acc).toBeDefined();
    expect(acc!.token).toBe(originalToken);
    expect(acc!.salt).toBe(originalSalt);
    expect(acc!.pass).toBe(originalPass);

    // Running migration again must be idempotent and not re-encrypt
    const result2 = database.migrateLegacySecurityData();
    expect(result2.migratedAccounts).toBe(0);
    expect(result2.migratedIntegrations).toBe(0);

    // Clean up
    database.deleteNavidromeAccount(testUser, testUrl);
  });
});

describe('Database History Functions & Delta Sync', () => {
  const testUserId = 'history_test_user_' + Date.now();

  it('addHistoryEntry adds a track and retrieves it', () => {
    const entry = {
      song_id: 'song_1',
      title: 'Test Song 1',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 210,
      played_at: 1000000
    };

    const added = database.addHistoryEntry(testUserId, entry);
    expect(added).toBe(true);

    const history = database.getHistory(testUserId);
    expect(history.length).toBe(1);
    expect(history[0]!.song_id).toBe('song_1');
    expect(history[0]!.title).toBe('Test Song 1');
    expect(history[0]!.artist).toBe('Test Artist');
    expect(history[0]!.album).toBe('Test Album');
    expect(history[0]!.duration).toBe(210);
    expect(history[0]!.played_at).toBe(1000000);
  });

  it('addHistoryEntry deduplicates plays within 5 minutes', () => {
    // Same song 2 minutes later
    const duplicateEntry = {
      song_id: 'song_1',
      title: 'Test Song 1',
      played_at: 1000000 + 2 * 60 * 1000
    };
    const addedDup = database.addHistoryEntry(testUserId, duplicateEntry);
    expect(addedDup).toBe(false);

    // Same song 6 minutes later (should succeed)
    const validEntry = {
      song_id: 'song_1',
      title: 'Test Song 1',
      played_at: 1000000 + 6 * 60 * 1000
    };
    const addedValid = database.addHistoryEntry(testUserId, validEntry);
    expect(addedValid).toBe(true);

    const history = database.getHistory(testUserId);
    expect(history.length).toBe(2);
  });

  it('addHistoryBatch adds multiple entries and respects deduplication', () => {
    const batch = [
      { song_id: 'song_2', title: 'Song 2', played_at: 2000000 },
      { song_id: 'song_3', title: 'Song 3', played_at: 2500000 },
      { song_id: 'song_3', title: 'Song 3', played_at: 2500000 + 60 * 1000 } // duplicate of song_3
    ];

    const inserted = database.addHistoryBatch(testUserId, batch);
    expect(inserted).toBe(2); // Only song_2 and first song_3
  });

  it('getHistory supports delta query via since parameter', () => {
    // Current played_at values: ~1000000, 1360000, 2000000, 2500000
    const delta = database.getHistory(testUserId, 1500000);
    expect(delta.length).toBe(2);
    expect(delta.every(t => t.played_at > 1500000)).toBe(true);
  });

  it('pruneUserHistory limits total entries per user', () => {
    database.pruneUserHistory(testUserId, 2);
    const history = database.getHistory(testUserId);
    expect(history.length).toBe(2);
  });

  it('clearUserHistory wipes all records for user', () => {
    database.clearUserHistory(testUserId);
    const history = database.getHistory(testUserId);
    expect(history.length).toBe(0);
  });
});
