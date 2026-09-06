import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';

process.env.PORT = '0';
process.env.NAVIDROME_URL = 'http://mock-navidrome.local';
process.env.NAVIDROME_USER = 'testuser';
process.env.NAVIDROME_PASS = 'testpass';

import { httpServer } from '../index.js';

let port: number;

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/rest/ping.view')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          'subsonic-response': { status: 'ok' }
        })
      } as any;
    }
    return { ok: false, status: 500 } as any;
  });

  await new Promise<void>((resolve) => {
    const checkAddress = () => {
      const address = httpServer.address();
      if (address && typeof address !== 'string') {
        port = address.port;
        resolve();
      } else {
        setTimeout(checkAddress, 100);
      }
    };
    if (httpServer.listening) {
      checkAddress();
    } else {
      httpServer.on('listening', checkAddress);
    }
  });
});

describe('Social WebSocket Events', () => {
  let socketA: ClientSocket;
  let socketB: ClientSocket;
  const userA = 'social_user_alice_' + Date.now();
  const userB = 'social_user_bob_' + Date.now();

  beforeAll(async () => {
    socketA = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
    socketB = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });

    await Promise.all([
      new Promise<void>((res) => socketA.on('connect', res)),
      new Promise<void>((res) => socketB.on('connect', res))
    ]);
  });

  afterAll(() => {
    if (socketA?.connected) socketA.disconnect();
    if (socketB?.connected) socketB.disconnect();
  });

  it('social_init should authenticate and return user info', async () => {
    const initResA = await new Promise<any>((resolve) => {
      socketA.emit('social_init', {
        user: userA,
        token: 'tokenA',
        salt: 'saltA',
        url: 'http://mock-navidrome.local'
      });
      socketA.once('social_init_success', resolve);
    });

    expect(initResA.username).toBe(userA);
    expect(initResA.tag).toMatch(/^\d{4}$/);
    expect(initResA.friends).toEqual([]);

    const initResB = await new Promise<any>((resolve) => {
      socketB.emit('social_init', {
        user: userB,
        token: 'tokenB',
        salt: 'saltB',
        url: 'http://mock-navidrome.local'
      });
      socketB.once('social_init_success', resolve);
    });

    expect(initResB.username).toBe(userB);
    expect(initResB.tag).toMatch(/^\d{4}$/);
  });

  it('social_searchUsers should find users', async () => {
    const results = await new Promise<any[]>((resolve) => {
      socketA.emit('social_searchUsers', { query: userB });
      socketA.once('social_searchResults', resolve);
    });

    expect(results.some(u => u.user_id === userB)).toBe(true);
  });

  it('social_sendFriendRequest should deliver notification to online target', async () => {
    const requestPromise = new Promise<any>((resolve) => {
      socketB.once('social_friendRequestReceived', resolve);
    });

    socketA.emit('social_sendFriendRequest', { target: userB });

    const received = await requestPromise;
    expect(received.fromUserId).toBe(userA);
    expect(received.fromUsername).toBe(userA);
  });

  it('social_respondFriendRequest accept should notify requester and update friends', async () => {
    const acceptedPromise = new Promise<any>((resolve) => {
      socketA.once('social_friendAccepted', resolve);
    });

    socketB.emit('social_respondFriendRequest', { requesterId: userA, action: 'accept' });

    const accepted = await acceptedPromise;
    expect(accepted.friend.user_id).toBe(userB);
  });

  it('social_presenceUpdate should broadcast track info to friends', async () => {
    const presencePromise = new Promise<any>((resolve) => {
      socketB.once('social_friendPresence', resolve);
    });

    socketA.emit('social_presenceUpdate', {
      track: {
        id: 'track-42',
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera'
      }
    });

    const presence = await presencePromise;
    expect(presence.userId).toBe(userA);
    expect(presence.isOnline).toBe(true);
    expect(presence.nowPlaying.title).toBe('Bohemian Rhapsody');
    expect(presence.nowPlaying.artist).toBe('Queen');
  });

  it('jam_inviteFriend should deliver jam invite to active friend sockets', async () => {
    const invitePromise = new Promise<any>((resolve) => {
      socketB.once('jam_inviteReceived', resolve);
    });

    socketA.emit('jam_inviteFriend', {
      friendId: userB,
      roomId: 'JAM123',
      track: { title: 'Bohemian Rhapsody', artist: 'Queen' }
    });

    const invite = await invitePromise;
    expect(invite.fromUser).toBe(userA);
    expect(invite.roomId).toBe('JAM123');
    expect(invite.track.title).toBe('Bohemian Rhapsody');
  });

  it('social_removeFriend should remove friendship', async () => {
    const removePromise = new Promise<any>((resolve) => {
      socketB.once('social_friendRemoved', resolve);
    });

    socketA.emit('social_removeFriend', { friendId: userB });

    const removed = await removePromise;
    expect(removed.friendId).toBe(userA);
  });
});
