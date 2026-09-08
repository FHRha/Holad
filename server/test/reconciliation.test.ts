import { describe, it, expect } from 'vitest';
import request from 'supertest';
import * as database from '../src/database.js';
import { app } from '../index.js';

describe('Library Reconciliation & Resilient Entities', () => {
  const testUser = 'recon_user_' + Date.now();

  it('toggleExclusion stores composite fingerprint and metadata', () => {
    const isExcluded = database.toggleExclusion(testUser, 'track-orig-1', 'track', {
      title: 'пых-пых',
      artist: 'FHR',
      album: 'пых-пых generational',
      trackNumber: 2,
      duration: 185,
      lyrics: '[00:01.00]Текст мешапа пых пых',
      fileName: '02 - пых-пых (mashup).mp3'
    });

    expect(isExcluded).toBe(true);

    const data = database.getExclusions(testUser);
    expect(data.excludedTrackIds).toContain('track-orig-1');
    expect(data.excludedFingerprints.length).toBeGreaterThan(0);

    const detail = data.details.find(d => d.entityId === 'track-orig-1');
    expect(detail).toBeDefined();
    expect(detail?.title).toBe('пых-пых');
    expect(detail?.trackNumber).toBe(2);
    expect(detail?.duration).toBe(185);
    expect(detail?.fingerprint).toMatch(/^trk_/);
    expect(detail?.lyricsHash).toMatch(/^lyr_/);
  });

  it('reconcileExclusion updates oldEntityId to newEntityId preserving fingerprint', () => {
    const success = database.reconcileExclusion(testUser, 'track-orig-1', 'track-reindexed-999', 'track');
    expect(success).toBe(true);

    const data = database.getExclusions(testUser);
    expect(data.excludedTrackIds).not.toContain('track-orig-1');
    expect(data.excludedTrackIds).toContain('track-reindexed-999');

    const detail = data.details.find(d => d.entityId === 'track-reindexed-999');
    expect(detail).toBeDefined();
    expect(detail?.title).toBe('пых-пых');
    expect(detail?.trackNumber).toBe(2);
    expect(detail?.duration).toBe(185);
  });

  it('reconcilePlaylistTracks updates stale track IDs in custom playlist', () => {
    const plId = 'custom_pl_recon_' + Date.now();
    database.saveCustomPlaylist(
      plId,
      'Test Reconciliation Playlist',
      'Testing auto-heal',
      ['stale-track-1', 'stable-track-2'],
      testUser,
      [
        { id: 'stale-track-1', title: 'Song 1', artist: 'Artist 1' },
        { id: 'stable-track-2', title: 'Song 2', artist: 'Artist 2' }
      ]
    );

    const initial = database.getCustomPlaylist(plId);
    expect(initial?.trackIds).toEqual(['stale-track-1', 'stable-track-2']);

    const reconciled = database.reconcilePlaylistTracks(plId, [
      { oldId: 'stale-track-1', newId: 'fresh-track-1-new' }
    ]);
    expect(reconciled).toBe(true);

    const updated = database.getCustomPlaylist(plId);
    expect(updated?.trackIds).toEqual(['fresh-track-1-new', 'stable-track-2']);
    expect(updated?.tracks[0]?.id).toBe('fresh-track-1-new');
  });

  it('POST /api/custom-playlists/:id/reconcile HTTP endpoint updates track IDs', async () => {
    const plId = 'http_pl_recon_' + Date.now();
    database.saveCustomPlaylist(
      plId,
      'HTTP Playlist',
      '',
      ['old-subsonic-10'],
      testUser
    );

    const res = await request(app)
      .post(`/api/custom-playlists/${plId}/reconcile`)
      .send({
        replacements: [{ oldId: 'old-subsonic-10', newId: 'new-subsonic-20' }]
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const pl = database.getCustomPlaylist(plId);
    expect(pl?.trackIds).toContain('new-subsonic-20');
  });
});
