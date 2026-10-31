import { db } from '../connection.js';
import { ensureUserExists } from './socialTable.js';
import { safeEncrypt, safeDecrypt } from '../crypto.js';
import type { IntegrationItem } from '../types.js';

export function getIntegrations(userId: string): IntegrationItem[] {
  const rows = db.prepare('SELECT integration_name, encrypted_token, enabled, updated_at FROM integrations WHERE user_id = ?').all(userId) as any[];
  return rows.map(r => ({
    integration_name: r.integration_name,
    token: safeDecrypt(r.encrypted_token) || null,
    enabled: Boolean(r.enabled),
    updated_at: r.updated_at
  }));
}

export function saveIntegrations(userId: string, items: { integration_name: string; token?: string | null; enabled?: boolean }[]): void {
  ensureUserExists(userId);
  const now = Date.now();
  const upsertStmt = db.prepare(`
    INSERT INTO integrations (user_id, integration_name, encrypted_token, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, integration_name) DO UPDATE SET
      encrypted_token = excluded.encrypted_token,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM integrations WHERE user_id = ? AND integration_name = ?
  `);

  const tx = db.transaction(() => {
    for (const item of items) {
      if (!item.integration_name) continue;
      if (item.token === null || item.token === '') {
        if (item.enabled === false) {
          deleteStmt.run(userId, item.integration_name);
          continue;
        }
      }
      const encrypted = safeEncrypt(item.token || '') || '';
      upsertStmt.run(userId, item.integration_name, encrypted, item.enabled !== false ? 1 : 0, now);
    }
  });
  tx();
}
