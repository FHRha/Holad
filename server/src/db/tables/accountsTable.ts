import { db } from '../connection.js';
import { safeEncrypt, safeDecrypt, encrypt, decrypt } from '../crypto.js';
import { ensureUserExists } from './socialTable.js';
import type { NavidromeAccountRecord } from '../types.js';

export function getNavidromeAccounts(): NavidromeAccountRecord[] {
  try {
    const rows = db.prepare('SELECT url, user, token, salt, pass FROM navidrome_accounts ORDER BY id ASC').all() as any[];
    return rows.map(r => {
      const token = safeDecrypt(r.token);
      const salt = safeDecrypt(r.salt);
      const pass = safeDecrypt(r.pass);
      return {
        url: r.url,
        user: r.user,
        ...(token ? { token } : {}),
        ...(salt ? { salt } : {}),
        ...(pass ? { pass } : {})
      };
    });
  } catch (err) {
    console.error('Failed to get Navidrome accounts from DB:', err);
    return [];
  }
}

export function saveNavidromeAccount(account: NavidromeAccountRecord): void {
  if (!account.url || !account.user) return;
  const cleanUrl = account.url.trim().replace(/\/$/, '');
  const cleanUser = account.user.trim();
  
  const stmt = db.prepare(`
    INSERT INTO navidrome_accounts (url, user, token, salt, pass, updated_at)
    VALUES (@url, @user, @token, @salt, @pass, CURRENT_TIMESTAMP)
    ON CONFLICT(url, user) DO UPDATE SET
      token = excluded.token,
      salt = excluded.salt,
      pass = excluded.pass,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run({
    url: cleanUrl,
    user: cleanUser,
    token: safeEncrypt(account.token),
    salt: safeEncrypt(account.salt),
    pass: safeEncrypt(account.pass)
  });
}

export function deleteNavidromeAccount(user: string, url: string): void {
  const cleanUrl = url.trim().replace(/\/$/, '');
  const cleanUser = user.trim();
  db.prepare('DELETE FROM navidrome_accounts WHERE user = ? AND url = ?').run(cleanUser, cleanUrl);
}

export function migrateAccountsFromEnv(): { migratedCount: number } {
  let migratedCount = 0;
  const accountsToMigrate: NavidromeAccountRecord[] = [];

  try {
    if (process.env.NAVIDROME_ACCOUNTS) {
      const raw = process.env.NAVIDROME_ACCOUNTS.trim();
      let parsed: any[] = [];
      if (raw.startsWith('[') || raw.startsWith('{')) {
        parsed = JSON.parse(raw);
      } else {
        parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      }
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.url && item.user) {
            accountsToMigrate.push({
              url: item.url,
              user: item.user,
              pass: item.pass,
              token: item.token,
              salt: item.salt
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('[DB Migration] Failed to parse NAVIDROME_ACCOUNTS from env:', e);
  }

  if (process.env.NAVIDROME_URL) {
    accountsToMigrate.push({
      url: process.env.NAVIDROME_URL,
      user: process.env.NAVIDROME_USER || '',
      pass: process.env.NAVIDROME_PASS || ''
    });
  }

  if (accountsToMigrate.length > 0) {
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO navidrome_accounts (url, user, token, salt, pass, updated_at)
      VALUES (@url, @user, @token, @salt, @pass, CURRENT_TIMESTAMP)
    `);
    const transaction = db.transaction(() => {
      for (const acc of accountsToMigrate) {
        if (!acc.url || !acc.user) continue;
        const res = insertStmt.run({
          url: acc.url.trim().replace(/\/$/, ''),
          user: acc.user.trim(),
          token: safeEncrypt(acc.token),
          salt: safeEncrypt(acc.salt),
          pass: safeEncrypt(acc.pass)
        });
        if (res.changes > 0) {
          migratedCount++;
        }
      }
    });
    transaction();
    if (migratedCount > 0) {
      console.log(`[DB Migration] Successfully migrated ${migratedCount} Navidrome account(s) from environment to SQLite.`);
    }
  }

  return { migratedCount };
}

export function migrateLegacySecurityData(): { migratedAccounts: number; migratedIntegrations: number; migratedPlaylists: number } {
  let migratedAccounts = 0;
  let migratedIntegrations = 0;
  let migratedPlaylists = 0;

  // 1. Migrate navidrome_accounts to AES-256-GCM
  try {
    const rows = db.prepare('SELECT id, token, salt, pass FROM navidrome_accounts').all() as any[];
    const updateStmt = db.prepare('UPDATE navidrome_accounts SET token = ?, salt = ?, pass = ? WHERE id = ?');
    const tx = db.transaction(() => {
      for (const row of rows) {
        let changed = false;
        let encToken = row.token;
        let encSalt = row.salt;
        let encPass = row.pass;

        if (row.token && !row.token.startsWith('gcm:')) {
          const plain = safeDecrypt(row.token);
          if (plain) {
            encToken = encrypt(plain);
            changed = true;
          }
        }
        if (row.salt && !row.salt.startsWith('gcm:')) {
          const plain = safeDecrypt(row.salt);
          if (plain) {
            encSalt = encrypt(plain);
            changed = true;
          }
        }
        if (row.pass && !row.pass.startsWith('gcm:')) {
          const plain = safeDecrypt(row.pass);
          if (plain) {
            encPass = encrypt(plain);
            changed = true;
          }
        }

        if (changed) {
          updateStmt.run(encToken, encSalt, encPass, row.id);
          migratedAccounts++;
        }
      }
    });
    tx();
    if (migratedAccounts > 0) {
      console.log(`[DB Migration] Re-encrypted ${migratedAccounts} legacy Navidrome account record(s) to AES-256-GCM.`);
    }
  } catch (err) {
    console.error('[DB Migration] Failed to migrate navidrome_accounts encryption:', err);
  }

  // 2. Migrate integrations (Last.fm, Yandex, etc.) to AES-256-GCM
  try {
    const rows = db.prepare('SELECT user_id, integration_name, encrypted_token FROM integrations').all() as any[];
    const updateStmt = db.prepare('UPDATE integrations SET encrypted_token = ? WHERE user_id = ? AND integration_name = ?');
    const tx = db.transaction(() => {
      for (const row of rows) {
        if (row.encrypted_token && !row.encrypted_token.startsWith('gcm:')) {
          const plain = decrypt(row.encrypted_token);
          if (plain) {
            const newEncrypted = encrypt(plain);
            updateStmt.run(newEncrypted, row.user_id, row.integration_name);
            migratedIntegrations++;
          }
        }
      }
    });
    tx();
    if (migratedIntegrations > 0) {
      console.log(`[DB Migration] Re-encrypted ${migratedIntegrations} legacy integration token(s) to AES-256-GCM.`);
    }
  } catch (err) {
    console.error('[DB Migration] Failed to migrate integrations encryption:', err);
  }

  // 3. Migrate orphan playlists (user_id IS NULL) if a single user exists
  try {
    const users = db.prepare('SELECT user_id FROM users LIMIT 2').all() as { user_id: string }[];
    if (users.length === 1 && users[0]) {
      const singleUserId = users[0].user_id;
      const res = db.prepare('UPDATE playlists SET user_id = ? WHERE user_id IS NULL').run(singleUserId);
      if (res.changes > 0) {
        migratedPlaylists = res.changes;
        console.log(`[DB Migration] Assigned ${res.changes} legacy playlist(s) to user ${singleUserId}`);
      }
    }
  } catch (err) {
    console.error('[DB Migration] Failed to migrate orphan playlists:', err);
  }

  return { migratedAccounts, migratedIntegrations, migratedPlaylists };
}

export function insertRawAccountForTesting(user: string, url: string, token: string, salt: string, pass: string): void {
  db.prepare('INSERT OR REPLACE INTO navidrome_accounts (url, user, token, salt, pass) VALUES (?, ?, ?, ?, ?)').run(url, user, token, salt, pass);
}

export function insertRawIntegrationForTesting(userId: string, integrationName: string, encryptedToken: string): void {
  ensureUserExists(userId);
  db.prepare('INSERT OR REPLACE INTO integrations (user_id, integration_name, encrypted_token) VALUES (?, ?, ?)').run(userId, integrationName, encryptedToken);
}
