import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, 'dist/src/scripts/migrateAccounts.js');
const srcPath = path.resolve(__dirname, 'src/scripts/migrateAccounts.ts');

if (fs.existsSync(distPath)) {
  await import(pathToFileURL(distPath).href);
} else if (fs.existsSync(srcPath)) {
  const { spawnSync } = await import('child_process');
  const res = spawnSync('npx', ['tsx', srcPath], { stdio: 'inherit', shell: true });
  process.exit(res.status ?? 0);
} else {
  console.error('Error: migrateAccounts script not found in dist/ or src/.');
  process.exit(1);
}
