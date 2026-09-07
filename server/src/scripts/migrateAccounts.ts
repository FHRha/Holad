import 'dotenv/config';
import { getNavidromeAccounts, migrateAccountsFromEnv } from '../database.js';

console.log('=== Navidrome Accounts Migration Script ===');
console.log('Reading accounts from environment variables...');

const result = migrateAccountsFromEnv();
console.log(`Migration completed. New accounts inserted: ${result.migratedCount}`);

const accounts = getNavidromeAccounts();
console.log(`Total accounts currently in SQLite database: ${accounts.length}`);
accounts.forEach((acc, i) => {
  console.log(`  [${i + 1}] User: "${acc.user}" | URL: "${acc.url}" (Token: ${acc.token ? 'YES' : 'NO'}, Salt: ${acc.salt ? 'YES' : 'NO'}, Pass: ${acc.pass ? 'YES' : 'NO'})`);
});
console.log('=== Done ===');
