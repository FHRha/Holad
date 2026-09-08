import crypto from 'crypto';
import md5 from 'md5';
import * as database from './database.js';

export interface DemoSession {
  sessionId: string;
  slotId: number;
  account: {
    url: string;
    user: string;
    token: string;
    salt: string;
  };
  guestUserId: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
}

export interface DemoManagerOptions {
  isDemo?: boolean;
  poolSize?: number;
  sessionMinutes?: number;
}

export class DemoManager {
  private isDemo: boolean;
  private poolSize: number;
  private sessionTtlMs: number;
  private sessions: Map<string, DemoSession> = new Map();
  private occupiedSlots: Set<number> = new Set();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options?: DemoManagerOptions) {
    this.isDemo = options?.isDemo ?? (process.env.DEMO_MODE === 'true');
    this.poolSize = options?.poolSize ?? Math.max(1, parseInt(process.env.DEMO_POOL_SIZE || '25', 10));
    const sessionMinutes = options?.sessionMinutes ?? Math.max(5, parseInt(process.env.DEMO_SESSION_MINUTES || '30', 10));
    this.sessionTtlMs = sessionMinutes * 60 * 1000;

    if (this.isDemo) {
      console.log(`[DEMO] Holad Demo Mode activated. Pool size: ${this.poolSize} slots, Session TTL: ${sessionMinutes}m.`);
      this.startCleanupDaemon();
    }
  }

  public stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  public isEnabled(): boolean {
    return this.isDemo;
  }

  public getPoolStats() {
    return {
      enabled: this.isDemo,
      poolSize: this.poolSize,
      activeSessions: this.sessions.size,
      availableSlots: Math.max(0, this.poolSize - this.sessions.size),
    };
  }

  private getBaseNavidromeAccount(): { url: string; user: string; token: string; salt: string } | null {
    // 1. Try environment variables
    const envUrl = process.env.NAVIDROME_URL;
    const envUser = process.env.NAVIDROME_USER;
    const envPass = process.env.NAVIDROME_PASS;

    if (envUrl && envUser) {
      const cleanUrl = envUrl.replace(/\/$/, '');
      const salt = crypto.randomBytes(16).toString('hex');
      const token = envPass ? md5(envPass + salt) : (process.env.NAVIDROME_TOKEN || '');
      return { url: cleanUrl, user: envUser, token, salt };
    }

    // 2. Try accounts already in SQLite database
    const accounts = database.getNavidromeAccounts();
    if (accounts.length > 0 && accounts[0]) {
      const acc = accounts[0];
      const salt = acc.salt || crypto.randomBytes(16).toString('hex');
      const token = acc.token || (acc.pass ? md5(acc.pass + salt) : '');
      return {
        url: acc.url.replace(/\/$/, ''),
        user: acc.user,
        token,
        salt
      };
    }

    return null;
  }

  private allocateSlot(): number | null {
    for (let i = 1; i <= this.poolSize; i++) {
      if (!this.occupiedSlots.has(i)) {
        this.occupiedSlots.add(i);
        return i;
      }
    }
    return null;
  }

  public acquireSession(existingSessionId?: string): { available: boolean; session?: DemoSession; retryAfter?: number } {
    if (!this.isDemo) {
      return { available: false };
    }

    const now = Date.now();

    // 1. Check if existing valid session exists
    if (existingSessionId && this.sessions.has(existingSessionId)) {
      const existing = this.sessions.get(existingSessionId)!;
      existing.lastActivity = now;
      existing.expiresAt = now + this.sessionTtlMs;
      return { available: true, session: existing };
    }

    // Clean up expired sessions first to free up slots
    this.cleanupExpiredSessions();

    // 2. Check capacity
    if (this.sessions.size >= this.poolSize) {
      // Find the soonest expiration time for retryAfter estimation
      let minExpiresAt = Infinity;
      for (const s of this.sessions.values()) {
        if (s.expiresAt < minExpiresAt) minExpiresAt = s.expiresAt;
      }
      const retryAfter = Math.max(15, Math.ceil((minExpiresAt - now) / 1000));
      return { available: false, retryAfter };
    }

    const baseAccount = this.getBaseNavidromeAccount();
    if (!baseAccount) {
      console.error('[DEMO] Cannot acquire demo session: NAVIDROME_URL and NAVIDROME_USER are not configured.');
      return { available: false, retryAfter: 60 };
    }

    const slotId = this.allocateSlot();
    if (slotId === null) {
      return { available: false, retryAfter: 30 };
    }

    const sessionId = crypto.randomUUID();
    const guestUserId = `demo_guest_${sessionId.substring(0, 8)}`;

    const session: DemoSession = {
      sessionId,
      slotId,
      account: {
        url: baseAccount.url,
        user: baseAccount.user,
        token: baseAccount.token,
        salt: baseAccount.salt
      },
      guestUserId,
      createdAt: now,
      lastActivity: now,
      expiresAt: now + this.sessionTtlMs
    };

    this.sessions.set(sessionId, session);
    console.log(`[DEMO] New guest session acquired: slot #${slotId} (${this.sessions.size}/${this.poolSize} active).`);

    return { available: true, session };
  }

  public heartbeat(sessionId: string): boolean {
    if (!this.isDemo || !sessionId) return false;
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const now = Date.now();
    session.lastActivity = now;
    session.expiresAt = now + this.sessionTtlMs;
    return true;
  }

  public releaseSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.occupiedSlots.delete(session.slotId);
    this.sessions.delete(sessionId);

    // Clean up SQLite records for this temporary guest
    database.deleteUserData(session.guestUserId);
    console.log(`[DEMO] Session released: slot #${session.slotId} (${this.sessions.size}/${this.poolSize} active).`);
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.releaseSession(id);
      }
    }
  }

  private startCleanupDaemon() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    // Periodic check every 30 seconds
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30 * 1000);
    this.cleanupTimer.unref?.();
  }
}

export const demoManager = new DemoManager();
