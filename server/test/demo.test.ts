import { describe, it, expect, afterEach } from 'vitest';
import { DemoManager } from '../src/demoManager.js';

describe('DemoManager Core Logic', () => {
  let manager: DemoManager | null = null;

  afterEach(() => {
    if (manager) {
      manager.stop();
      manager = null;
    }
  });

  it('should be disabled by default when DEMO_MODE is false or unset', () => {
    manager = new DemoManager({ isDemo: false });
    expect(manager.isEnabled()).toBe(false);

    const stats = manager.getPoolStats();
    expect(stats.enabled).toBe(false);

    const sessionRes = manager.acquireSession();
    expect(sessionRes.available).toBe(false);
  });

  it('should allocate unique sequential slots up to poolSize and reject with 429 capacity limit', () => {
    // Mock base navidrome env variables
    process.env.NAVIDROME_URL = 'http://demo-navidrome.local:4533';
    process.env.NAVIDROME_USER = 'demo_user';
    process.env.NAVIDROME_PASS = 'demo_pass';

    manager = new DemoManager({ isDemo: true, poolSize: 2, sessionMinutes: 10 });
    expect(manager.isEnabled()).toBe(true);

    // Slot 1
    const res1 = manager.acquireSession();
    expect(res1.available).toBe(true);
    expect(res1.session).toBeDefined();
    expect(res1.session?.slotId).toBe(1);
    expect(res1.session?.account.user).toBe('demo_user');
    expect(res1.session?.guestUserId).toMatch(/^demo_guest_/);

    // Slot 2
    const res2 = manager.acquireSession();
    expect(res2.available).toBe(true);
    expect(res2.session?.slotId).toBe(2);

    const statsAfter2 = manager.getPoolStats();
    expect(statsAfter2.activeSessions).toBe(2);
    expect(statsAfter2.availableSlots).toBe(0);

    // Slot 3 should be rejected as pool is exhausted
    const res3 = manager.acquireSession();
    expect(res3.available).toBe(false);
    expect(res3.retryAfter).toBeGreaterThanOrEqual(15);

    // Existing session reuse
    const reconnected = manager.acquireSession(res1.session?.sessionId);
    expect(reconnected.available).toBe(true);
    expect(reconnected.session?.sessionId).toBe(res1.session?.sessionId);

    // Release slot 1
    manager.releaseSession(res1.session!.sessionId);
    const statsAfterRelease = manager.getPoolStats();
    expect(statsAfterRelease.activeSessions).toBe(1);
    expect(statsAfterRelease.availableSlots).toBe(1);

    // Now slot 1 is available again and can be reacquired
    const res4 = manager.acquireSession();
    expect(res4.available).toBe(true);
    expect(res4.session?.slotId).toBe(1);
  });

  it('should extend expiration time on heartbeat', () => {
    process.env.NAVIDROME_URL = 'http://demo-navidrome.local:4533';
    process.env.NAVIDROME_USER = 'demo_user';
    process.env.NAVIDROME_PASS = 'demo_pass';

    manager = new DemoManager({ isDemo: true, poolSize: 5, sessionMinutes: 10 });
    const sessionRes = manager.acquireSession();
    expect(sessionRes.available).toBe(true);

    const initialExpires = sessionRes.session!.expiresAt;
    
    // Nonexistent session returns false
    expect(manager.heartbeat('nonexistent_session_id')).toBe(false);

    // Valid heartbeat
    const refreshed = manager.heartbeat(sessionRes.session!.sessionId);
    expect(refreshed).toBe(true);
    expect(sessionRes.session!.expiresAt).toBeGreaterThanOrEqual(initialExpires);
  });
});

describe('Demo REST Endpoints', () => {
  it('should return demo status for both /api/demo/status and /Holad/api/demo/status', async () => {
    const { app } = await import('../index.js');
    const request = (await import('supertest')).default;

    const res1 = await request(app).get('/api/demo/status');
    expect(res1.status).toBe(200);
    expect(res1.body).toHaveProperty('enabled');
    expect(res1.body).toHaveProperty('poolSize');

    const res2 = await request(app).get('/Holad/api/demo/status');
    expect(res2.status).toBe(200);
    expect(res2.body).toHaveProperty('enabled');
  });
});
