import { db } from '../connection.js';
import { ensureUserExists } from './socialTable.js';
import type { UserPreferences } from '../types.js';

export function getPreferences(userId: string): UserPreferences | null {
  const row = db.prepare('SELECT theme, accent_color, custom_colors, language, profiles, updated_at FROM preferences WHERE user_id = ?').get(userId) as UserPreferences | undefined;
  return row || null;
}

export function savePreferences(userId: string, prefs: Partial<UserPreferences>): void {
  ensureUserExists(userId);
  const now = Date.now();
  const existing = getPreferences(userId);
  const theme = prefs.theme !== undefined ? prefs.theme : (existing?.theme ?? null);
  const accent_color = prefs.accent_color !== undefined ? prefs.accent_color : (existing?.accent_color ?? null);
  const custom_colors = prefs.custom_colors !== undefined 
    ? (typeof prefs.custom_colors === 'object' ? JSON.stringify(prefs.custom_colors) : prefs.custom_colors) 
    : (existing?.custom_colors ?? null);
  const language = prefs.language !== undefined ? prefs.language : (existing?.language ?? null);
  const profiles = prefs.profiles !== undefined
    ? (typeof prefs.profiles === 'object' ? JSON.stringify(prefs.profiles) : prefs.profiles)
    : (existing?.profiles ?? null);

  db.prepare(`
    INSERT INTO preferences (user_id, theme, accent_color, custom_colors, language, profiles, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      theme = excluded.theme,
      accent_color = excluded.accent_color,
      custom_colors = excluded.custom_colors,
      language = excluded.language,
      profiles = excluded.profiles,
      updated_at = excluded.updated_at
  `).run(userId, theme, accent_color, custom_colors, language, profiles, now);
}
