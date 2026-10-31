import { db, resolveDbPath } from './connection.js';
import { initSchema } from './schema.js';
import { migrateAccountsFromEnv, migrateLegacySecurityData } from './tables/accountsTable.js';

// Automatically migrate environment variables and legacy security data on boot
try {
  migrateAccountsFromEnv();
} catch (err) {
  console.error('[DB Migration] Error during initial environment migration:', err);
}

try {
  migrateLegacySecurityData();
} catch (err) {
  console.error('[DB Migration] Error during legacy security data migration:', err);
}

export { db, resolveDbPath };
export { initSchema };

export * from './types.js';
export * from './crypto.js';
export * from './tables/preferencesTable.js';
export * from './tables/playbackTable.js';
export * from './tables/integrationsTable.js';
export * from './tables/playlistsTable.js';
export * from './tables/exclusionsTable.js';
export * from './tables/socialTable.js';
export * from './tables/accountsTable.js';
export * from './tables/historyTable.js';
export * from './tables/userDataTable.js';
