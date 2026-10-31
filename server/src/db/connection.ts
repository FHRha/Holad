import Database from 'better-sqlite3';
import type { Database as DatabaseInstance } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure dotenv is loaded before anything else
dotenv.config();
if (!process.env.NAVIDROME_URL && !process.env.NAVIDROME_ACCOUNTS) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

export function resolveDbPath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  // If running in development (src/db) vs production (dist/src/db)
  // We want the DB to live in server root (e.g. /opt/holad/server/holad.sqlite or E:\Code\Holad\server\holad.sqlite)
  let serverRoot = path.resolve(__dirname, '../..');
  if (serverRoot.endsWith(path.sep + 'dist') || serverRoot.endsWith('/dist')) {
    serverRoot = path.resolve(serverRoot, '..');
  }
  const rootDbPath = path.join(serverRoot, 'holad.sqlite');
  
  // Also check if legacy DB was created in dist/
  const distDbPath = path.resolve(serverRoot, 'dist/holad.sqlite');
  if (!fs.existsSync(rootDbPath) && fs.existsSync(distDbPath)) {
    try {
      fs.copyFileSync(distDbPath, rootDbPath);
    } catch (e) {
      return distDbPath;
    }
  }
  
  return rootDbPath;
}

export type SqliteDatabase = DatabaseInstance;
export const DB_PATH = resolveDbPath();
export const db: SqliteDatabase = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
