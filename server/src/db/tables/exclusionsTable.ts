import { db } from '../connection.js';
import { ensureUserExists } from './socialTable.js';
import {
  generateTrackFingerprint,
  generateAlbumFingerprint,
  extractFileName,
  parseTrackNumber,
  generateLyricsHash
} from '../../utils/trackFingerprint.js';
import type { ExclusionMeta, DetailedExclusion } from '../types.js';

export function getExclusions(userId: string): { 
  excludedTrackIds: string[]; 
  excludedAlbumIds: string[]; 
  excludedFingerprints: string[];
  details: DetailedExclusion[];
} {
  userId = (userId || '').trim().toLowerCase();
  ensureUserExists(userId);
  const rows = db.prepare('SELECT entity_id, entity_type, fingerprint, title, artist, album, track_number, duration, file_name, lyrics_hash, updated_at FROM exclusions WHERE user_id = ?').all(userId) as any[];
  const excludedTrackIds: string[] = [];
  const excludedAlbumIds: string[] = [];
  const excludedFingerprints: string[] = [];
  const details: DetailedExclusion[] = [];

  for (const row of rows) {
    if (row.entity_type === 'track') {
      excludedTrackIds.push(row.entity_id);
    } else if (row.entity_type === 'album') {
      excludedAlbumIds.push(row.entity_id);
    }
    if (row.fingerprint) {
      excludedFingerprints.push(row.fingerprint);
    }
    details.push({
      entityId: row.entity_id,
      entityType: row.entity_type,
      fingerprint: row.fingerprint || null,
      title: row.title || null,
      artist: row.artist || null,
      album: row.album || null,
      trackNumber: row.track_number || null,
      duration: row.duration || null,
      fileName: row.file_name || null,
      lyricsHash: row.lyrics_hash || null,
      updatedAt: row.updated_at || null,
    });
  }
  return { excludedTrackIds, excludedAlbumIds, excludedFingerprints, details };
}

export function setExclusions(userId: string, excludedTrackIds: string[], excludedAlbumIds: string[]): void {
  userId = (userId || '').trim().toLowerCase();
  ensureUserExists(userId);
  const existingRows = db.prepare('SELECT entity_id, entity_type FROM exclusions WHERE user_id = ?').all(userId) as { entity_id: string; entity_type: string }[];
  
  const targetTracks = new Set((excludedTrackIds || []).map(String));
  const targetAlbums = new Set((excludedAlbumIds || []).map(String));

  const toDelete: { id: string; type: string }[] = [];
  const existingTracks = new Set<string>();
  const existingAlbums = new Set<string>();

  for (const row of existingRows) {
    if (row.entity_type === 'track') {
      if (!targetTracks.has(row.entity_id)) {
        toDelete.push({ id: row.entity_id, type: 'track' });
      } else {
        existingTracks.add(row.entity_id);
      }
    } else if (row.entity_type === 'album') {
      if (!targetAlbums.has(row.entity_id)) {
        toDelete.push({ id: row.entity_id, type: 'album' });
      } else {
        existingAlbums.add(row.entity_id);
      }
    }
  }

  const toInsertTracks = [...targetTracks].filter(id => !existingTracks.has(id));
  const toInsertAlbums = [...targetAlbums].filter(id => !existingAlbums.has(id));

  const transaction = db.transaction(() => {
    const deleteStmt = db.prepare('DELETE FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?');
    for (const item of toDelete) {
      deleteStmt.run(userId, item.id, item.type);
    }
    const insertStmt = db.prepare('INSERT OR IGNORE INTO exclusions (user_id, entity_id, entity_type) VALUES (?, ?, ?)');
    for (const trackId of toInsertTracks) {
      insertStmt.run(userId, trackId, 'track');
    }
    for (const albumId of toInsertAlbums) {
      insertStmt.run(userId, albumId, 'album');
    }
  });
  transaction();
}

export function toggleExclusion(
  userId: string, 
  entityId: string, 
  entityType: 'track' | 'album',
  meta?: ExclusionMeta
): boolean {
  userId = (userId || '').trim().toLowerCase();
  ensureUserExists(userId);

  let fp = meta?.fingerprint;
  if (!fp && meta && (meta.title || meta.artist || meta.album)) {
    if (entityType === 'track') {
      fp = generateTrackFingerprint({
        id: entityId,
        title: meta?.title,
        artist: meta?.artist,
        album: meta?.album,
        track: meta?.trackNumber,
        duration: meta?.duration,
        path: meta?.path || meta?.fileName,
        lyrics: meta?.lyrics,
        lyricsHash: meta?.lyricsHash
      });
    } else {
      fp = generateAlbumFingerprint(meta?.artist, meta?.album || meta?.title);
    }
  }

  let existing: any = null;
  if (entityId) {
    existing = db.prepare('SELECT entity_id, fingerprint FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').get(userId, entityId, entityType);
  }
  const searchFp = meta?.fingerprint || fp;
  if (!existing && searchFp) {
    existing = db.prepare('SELECT entity_id, fingerprint FROM exclusions WHERE user_id = ? AND fingerprint = ? AND entity_type = ?').get(userId, searchFp, entityType);
  }

  if (existing) {
    if (existing.entity_id) {
      db.prepare('DELETE FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').run(userId, existing.entity_id, entityType);
    }
    if (existing.fingerprint) {
      db.prepare('DELETE FROM exclusions WHERE user_id = ? AND fingerprint = ? AND entity_type = ?').run(userId, existing.fingerprint, entityType);
    }
    return false;
  } else {
    if (!fp) {
      if (entityType === 'track') {
        fp = generateTrackFingerprint({
          id: entityId,
          title: meta?.title,
          artist: meta?.artist,
          album: meta?.album,
          track: meta?.trackNumber,
          duration: meta?.duration,
          path: meta?.path || meta?.fileName,
          lyrics: meta?.lyrics,
          lyricsHash: meta?.lyricsHash
        });
      } else {
        fp = generateAlbumFingerprint(meta?.artist, meta?.album || meta?.title);
      }
    }

    const title = meta?.title || null;
    const artist = meta?.artist || null;
    const album = meta?.album || null;
    const trackNumber = parseTrackNumber(meta?.trackNumber) ?? null;
    const duration = meta?.duration !== undefined && meta?.duration !== null ? Math.round(Number(meta.duration)) : null;
    const fileName = extractFileName(meta?.path || meta?.fileName) || null;
    const lyricsHash = meta?.lyricsHash || (meta?.lyrics ? generateLyricsHash(meta.lyrics) : null);

    db.prepare(`
      INSERT OR REPLACE INTO exclusions (
        user_id, entity_id, entity_type, fingerprint, title, artist, album, track_number, duration, file_name, lyrics_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, entityId, entityType, fp || null, title, artist, album, trackNumber, duration, fileName, lyricsHash);
    return true;
  }
}

export function reconcileExclusion(
  userId: string, 
  oldEntityId: string, 
  newEntityId: string, 
  entityType: 'track' | 'album' = 'track',
  fingerprint?: string
): boolean {
  userId = (userId || '').trim().toLowerCase();
  ensureUserExists(userId);
  let existing: any = null;
  if (oldEntityId) {
    existing = db.prepare('SELECT * FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').get(userId, oldEntityId, entityType) as any;
  }
  if (!existing && fingerprint) {
    existing = db.prepare('SELECT * FROM exclusions WHERE user_id = ? AND fingerprint = ? AND entity_type = ?').get(userId, fingerprint, entityType) as any;
  }
  if (!existing) {
    return false;
  }
  const prevId = existing.entity_id;
  db.transaction(() => {
    db.prepare('DELETE FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').run(userId, prevId, entityType);
    db.prepare(`
      INSERT OR REPLACE INTO exclusions (
        user_id, entity_id, entity_type, fingerprint, title, artist, album, track_number, duration, file_name, lyrics_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      userId, 
      newEntityId, 
      entityType, 
      existing.fingerprint, 
      existing.title, 
      existing.artist, 
      existing.album, 
      existing.track_number, 
      existing.duration, 
      existing.file_name, 
      existing.lyrics_hash
    );
  })();
  return true;
}
