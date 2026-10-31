import { db } from '../connection.js';
import { ensureUserExists } from './socialTable.js';

export function deleteCustomPlaylist(id: string, userId?: string): boolean {
  const transaction = db.transaction(() => {
    const owner = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(id) as { user_id?: string } | undefined;
    if (!owner) {
      return false;
    }
    // If playlist is owned by a user, only that user can delete it
    if (owner.user_id) {
      if (!userId || owner.user_id !== userId) {
        return false;
      }
    }
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id);
    const res = db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    return res.changes > 0;
  });
  return transaction();
}

export function saveCustomPlaylist(
  id: string,
  name: string,
  description: string,
  trackIds: string[],
  userId?: string,
  tracks?: any[]
): void {
  if (userId) {
    ensureUserExists(userId);
    const owner = db.prepare('SELECT user_id FROM playlists WHERE id = ?').get(id) as { user_id?: string } | undefined;
    if (owner && owner.user_id && owner.user_id !== userId) {
      throw new Error('Forbidden: Playlist belongs to another user');
    }
  }
  const songsJson = tracks !== undefined && tracks !== null
    ? JSON.stringify(tracks)
    : (Array.isArray(trackIds) ? JSON.stringify(trackIds.map(tid => ({ id: tid }))) : null);

  const transaction = db.transaction(() => {
    const upsertStmt = db.prepare(`
      INSERT INTO playlists (id, user_id, name, description, songs) 
      VALUES (?, ?, ?, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET 
        name = excluded.name, 
        description = excluded.description, 
        songs = excluded.songs,
        user_id = COALESCE(excluded.user_id, playlists.user_id)
      WHERE playlists.user_id = excluded.user_id OR playlists.user_id IS NULL
    `);
    upsertStmt.run(id, userId || null, name, description, songsJson);

    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id);

    const trackStmt = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)');
    for (const trackId of trackIds) {
      trackStmt.run(id, trackId);
    }
  });

  transaction();
}

export function getCustomPlaylist(id: string): { id: string; name: string; description: string; trackIds: string[]; tracks: any[] } | null {
  const pl = db.prepare('SELECT id, user_id, name, description, songs FROM playlists WHERE id = ?').get(id) as { id: string; user_id?: string; name: string; description?: string; songs?: string } | undefined;
  if (!pl) {
    return null;
  }
  const trackRows = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY rowid ASC').all(id) as { track_id: string }[];

  let tracks: any[] | null = null;
  if (pl.songs) {
    try {
      const parsed = JSON.parse(pl.songs);
      if (Array.isArray(parsed)) {
        tracks = parsed;
      }
    } catch (e) {
      tracks = null;
    }
  }

  const trackIds = tracks && tracks.length > 0 
    ? tracks.map((t: any) => typeof t === 'string' ? t : t.id).filter(Boolean)
    : trackRows.map(t => t.track_id);

  if (!tracks) {
    tracks = trackIds.map(tId => ({ id: tId }));
  }

  return {
    id: pl.id,
    name: pl.name,
    description: pl.description || '',
    trackIds,
    tracks
  };
}

export function getUserCustomPlaylists(userId: string): Array<{ id: string; name: string; description: string; trackIds: string[]; tracks?: any[]; userId?: string }> {
  if (!userId) return [];
  const rows = db.prepare('SELECT id, user_id, name, description, songs FROM playlists WHERE user_id = ? ORDER BY rowid DESC').all(userId) as any[];
  return rows.map(pl => {
    let tracks: any[] | undefined = undefined;
    if (pl.songs) {
      try {
        const parsed = JSON.parse(pl.songs);
        if (Array.isArray(parsed)) {
          tracks = parsed;
        }
      } catch {
        tracks = undefined;
      }
    }
    const trackRows = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY rowid ASC').all(pl.id) as { track_id: string }[];
    const trackIds = tracks && tracks.length > 0 
      ? tracks.map((t: any) => typeof t === 'string' ? t : t.id).filter(Boolean)
      : trackRows.map(t => t.track_id);

    return {
      id: pl.id,
      name: pl.name,
      description: pl.description || '',
      trackIds,
      tracks: tracks || trackIds.map(tId => ({ id: tId })),
      userId: pl.user_id
    };
  });
}

export function reconcilePlaylistTracks(
  playlistId: string,
  replacements: { oldId: string; newId: string }[],
  userId?: string
): boolean {
  const pl = db.prepare('SELECT id, user_id, songs FROM playlists WHERE id = ?').get(playlistId) as { id: string; user_id?: string; songs?: string } | undefined;
  if (!pl || !Array.isArray(replacements) || replacements.length === 0) {
    return false;
  }
  if (userId && pl.user_id && pl.user_id !== userId) {
    return false;
  }

  const repMap = new Map<string, string>();
  for (const r of replacements) {
    if (r.oldId && r.newId && r.oldId !== r.newId) {
      repMap.set(r.oldId, r.newId);
    }
  }

  if (repMap.size === 0) return false;

  db.transaction(() => {
    const updateTrackStmt = db.prepare('UPDATE playlist_tracks SET track_id = ? WHERE playlist_id = ? AND track_id = ?');
    for (const [oldId, newId] of repMap.entries()) {
      try {
        updateTrackStmt.run(newId, playlistId, oldId);
      } catch (e) {
        db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, oldId);
      }
    }

    if (pl.songs) {
      try {
        const parsed = JSON.parse(pl.songs);
        if (Array.isArray(parsed)) {
          let modified = false;
          for (const item of parsed) {
            if (item && item.id && repMap.has(item.id)) {
              item.id = repMap.get(item.id)!;
              modified = true;
            }
          }
          if (modified) {
            db.prepare('UPDATE playlists SET songs = ? WHERE id = ?').run(JSON.stringify(parsed), playlistId);
          }
        }
      } catch {}
    }
  })();

  return true;
}
