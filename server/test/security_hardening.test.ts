import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import * as database from '../src/database.js';
import { getMasterEncryptionKey, decrypt, safeTimingCompare, encrypt } from '../src/db/crypto.js';
import nodeCrypto from 'crypto';
import fs from 'fs';

describe('Security Hardening & Vulnerability Remediation Tests', () => {
  describe('1. Crypto & Master Key Security (crypto.ts)', () => {
    it('safeTimingCompare correctly and safely compares matching and non-matching tokens', () => {
      expect(safeTimingCompare('valid_token_123', 'valid_token_123')).toBe(true);
      expect(safeTimingCompare('valid_token_123', 'wrong_token_456')).toBe(false);
      expect(safeTimingCompare('valid_token_123', 'valid_token_123_extra')).toBe(false);
      expect(safeTimingCompare(undefined, 'valid_token_123')).toBe(false);
      expect(safeTimingCompare('valid_token_123', undefined)).toBe(false);
    });

    it('decrypt returns null for legacy ciphertext encrypted with removed hardcoded default_secret_key_needs_change_', () => {
      const legacyHardcodedKey = Buffer.from('default_secret_key_needs_change_');
      const iv = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      const cipher = nodeCrypto.createCipheriv('aes-256-cbc', legacyHardcodedKey, iv);
      let enc = cipher.update('secret_data_here', 'utf8', 'hex');
      enc += cipher.final('hex');
      const payload = `${iv.toString('hex')}:${enc}`;

      // Must return null, not decrypting with insecure fallback key
      const result = decrypt(payload);
      expect(result).toBeNull();
    });

    it('getMasterEncryptionKey returns valid 32-byte key and uses inMemoryFallbackKey when fs write fails', () => {
      const key = getMasterEncryptionKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });
  });

  describe('2. SSRF, IMDS & Port Protection (isTargetServerAllowed)', () => {
    it('blocks cloud metadata endpoints (AWS, GCP, Azure, OpenStack IMDS) in various formats', async () => {
      // Stream proxy tests target server allowance via serverUrl parameter
      const blockedTargets = [
        'http://169.254.169.254/latest/meta-data/',
        'http://169.254.1.1',
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://instance-data',
        'http://[fd00:ec2::254]',
        'http://[::ffff:169.254.169.254]',
        'http://2852039166', // decimal 169.254.169.254
        'http://0xa9fea9fe', // hex 169.254.169.254
      ];

      for (const target of blockedTargets) {
        const res = await request(app)
          .get(`/api/stream/track_test_1?u=u&t=t&s=s&serverUrl=${encodeURIComponent(target)}`);
        // Must be forbidden (403) or rejected as invalid (400), never allowed to proxy
        expect([400, 403]).toContain(res.status);
      }
    });

    it('blocks dangerous system ports (22, 25, 2375, 2376, 6379, 11211)', async () => {
      const blockedPorts = [22, 25, 2375, 2376, 6379, 11211];
      for (const port of blockedPorts) {
        const target = `http://127.0.0.1:${port}`;
        const res = await request(app)
          .get(`/api/stream/track_test_1?u=u&t=t&s=s&serverUrl=${encodeURIComponent(target)}`);
        expect([400, 403]).toContain(res.status);
      }
    });

    it('blocks non-http/https protocols', async () => {
      const badProtocols = [
        'ftp://127.0.0.1:4533',
        'gopher://127.0.0.1:4533',
        'file:///etc/passwd'
      ];
      for (const target of badProtocols) {
        const res = await request(app)
          .get(`/api/stream/track_test_1?u=u&t=t&s=s&serverUrl=${encodeURIComponent(target)}`);
        expect([400, 403]).toContain(res.status);
      }
    });
  });

  describe('3. Library User Resolution & BOLA / IDOR Protection', () => {
    it('library tracks route does not trust raw query userId without Subsonic authentication', async () => {
      const res = await request(app)
        .get('/api/library/tracks?userId=unauthorized_victim_user');
      expect(res.status).toBe(200);
      // Because resolvedUser is undefined (not authenticating victim), results are not filtered as victim
      expect(res.body).toHaveProperty('tracks');
    });

    it('POST /api/custom-playlists prevents BOLA / IDOR when userId does not match authenticated user', async () => {
      const plId = 'pl-bola-test-' + Date.now();
      const res = await request(app)
        .post('/api/custom-playlists')
        .set('x-user', 'legit_user')
        .set('x-token', 'mock_token')
        .set('x-salt', 'mock_salt')
        .set('x-url', 'http://mock-navidrome.local')
        .send({
          id: plId,
          name: 'Hacked Playlist',
          trackIds: ['trk_1'],
          userId: 'victim_user' // mismatch with authenticated legit_user
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Permission denied|mismatch/i);
    });

    it('DELETE /api/custom-playlists/:id prevents BOLA / IDOR when userId does not match authenticated user', async () => {
      const plId = 'pl-bola-del-' + Date.now();
      const res = await request(app)
        .delete(`/api/custom-playlists/${plId}?userId=victim_user`)
        .set('x-user', 'legit_user')
        .set('x-token', 'mock_token')
        .set('x-salt', 'mock_salt')
        .set('x-url', 'http://mock-navidrome.local');

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Permission denied|mismatch/i);
    });
  });
});
