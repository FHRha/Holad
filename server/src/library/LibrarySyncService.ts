import crypto from 'crypto';
import md5 from 'md5';
import {
  getNavidromeAccounts,
  upsertTracksBatch,
  upsertAlbumsBatch,
  upsertArtistsBatch,
  getSyncState,
  setSyncState,
  getLibraryStats,
  type CachedTrack,
  type CachedAlbum,
  type CachedArtist,
  type NavidromeAccountRecord,
} from '../db/index.js';

export interface SyncResult {
  success: boolean;
  status: number;
  message: string;
  retryAfter?: number;
}

export class LibrarySyncService {
  private isSyncing = false;
  private lastSyncCompletedTime = 0;
  private readonly syncCooldownMs = 30_000; // 30s cooldown
  private syncIntervalTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Background interval: delta sync once every hour (3600s)
    this.startBackgroundSync(60 * 60 * 1000);
  }

  public startBackgroundSync(intervalMs = 3600_000): void {
    if (this.syncIntervalTimer) {
      clearInterval(this.syncIntervalTimer);
    }
    this.syncIntervalTimer = setInterval(() => {
      console.log('[MediaEngine] Scheduled hourly sync triggered');
      this.runSync({ isManual: false }).catch((err) => {
        console.error('[MediaEngine] Scheduled sync error:', err);
      });
    }, intervalMs);
    // Unref so it won't prevent process exit in tests
    if (this.syncIntervalTimer.unref) {
      this.syncIntervalTimer.unref();
    }
  }

  public stopBackgroundSync(): void {
    if (this.syncIntervalTimer) {
      clearInterval(this.syncIntervalTimer);
      this.syncIntervalTimer = null;
    }
  }

  public getIsSyncing(): boolean {
    return this.isSyncing;
  }

  public getStatus(userId?: string) {
    const state = getSyncState(userId);
    const stats = getLibraryStats(userId);

    return {
      is_syncing: this.isSyncing,
      status: this.isSyncing ? 'syncing' : state?.status || 'idle',
      progress: this.isSyncing
        ? state?.progress || 0
        : state?.status === 'completed'
          ? 100
          : state?.progress || 0,
      total_tracks: stats.totalTracks,
      total_albums: stats.totalAlbums,
      total_artists: stats.totalArtists,
      last_sync_time: state?.last_sync_time || 0,
      error: state?.error || null,
    };
  }

  public async triggerManualSync(userId?: string): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        status: 409,
        message: 'Sync already in progress',
      };
    }

    const elapsed = Date.now() - this.lastSyncCompletedTime;
    if (elapsed < this.syncCooldownMs && this.lastSyncCompletedTime > 0) {
      const retryAfter = Math.ceil((this.syncCooldownMs - elapsed) / 1000);
      return {
        success: false,
        status: 429,
        message: `Sync rate limited. Please wait ${retryAfter}s before triggering again.`,
        retryAfter,
      };
    }

    // Trigger sync asynchronously in background
    setImmediate(() => {
      this.runSync({ isManual: true, userId }).catch((err) => {
        console.error('[MediaEngine] Manual sync error:', err);
      });
    });

    return {
      success: true,
      status: 202,
      message: 'Library synchronization started',
    };
  }

  public async runSync(options: { isManual?: boolean; userId?: string } = {}): Promise<void> {
    if (this.isSyncing) {
      console.warn('[MediaEngine] Skipping sync: already in progress');
      return;
    }

    this.isSyncing = true;
    const syncId = options.userId || 'default';

    // Set initial syncing state
    setSyncState({
      id: syncId,
      user_id: options.userId || null,
      status: 'syncing',
      progress: 5,
      total_tracks: 0,
      total_albums: 0,
      total_artists: 0,
      last_sync_time: Date.now(),
      error: null,
    });

    try {
      let accounts = getNavidromeAccounts();
      if (
        accounts.length === 0 &&
        process.env.NAVIDROME_URL &&
        process.env.NAVIDROME_USER
      ) {
        accounts = [
          {
            url: process.env.NAVIDROME_URL,
            user: process.env.NAVIDROME_USER,
            pass: process.env.NAVIDROME_PASS || '',
            token: process.env.NAVIDROME_TOKEN,
            salt: process.env.NAVIDROME_SALT,
          },
        ];
      }

      if (accounts.length === 0) {
        console.warn('[MediaEngine] No Navidrome/Subsonic accounts configured for sync');
        setSyncState({
          id: syncId,
          user_id: options.userId || null,
          status: 'idle',
          progress: 0,
          error: 'No Subsonic accounts configured',
        });
        this.isSyncing = false;
        return;
      }

      // Sync primary account
      const account = accounts[0]!;
      console.log(
        `[MediaEngine] Starting library sync for account user: ${account.user} at ${account.url}`
      );

      // 1. Fetch & cache Artists (progress 5% -> 25%)
      const artists = await this.syncArtists(account);
      setSyncState({
        id: syncId,
        user_id: options.userId || account.user,
        status: 'syncing',
        progress: 25,
        total_artists: artists.length,
        total_albums: 0,
        total_tracks: 0,
        last_sync_time: Date.now(),
        error: null,
      });

      // 2. Fetch & cache Albums (progress 25% -> 50%)
      const albums = await this.syncAlbums(account);
      setSyncState({
        id: syncId,
        user_id: options.userId || account.user,
        status: 'syncing',
        progress: 50,
        total_artists: artists.length,
        total_albums: albums.length,
        total_tracks: 0,
        last_sync_time: Date.now(),
        error: null,
      });

      // 3. Fetch & cache Tracks (progress 50% -> 95%)
      const tracks = await this.syncTracks(account, albums, syncId, artists.length);

      // 4. Finalize completed state
      setSyncState({
        id: syncId,
        user_id: options.userId || account.user,
        status: 'completed',
        progress: 100,
        total_artists: artists.length,
        total_albums: albums.length,
        total_tracks: tracks.length,
        last_sync_time: Date.now(),
        error: null,
      });

      this.lastSyncCompletedTime = Date.now();
      console.log(
        `[MediaEngine] Library sync finished successfully. Cached ${artists.length} artists, ${albums.length} albums, ${tracks.length} tracks.`
      );
    } catch (err: any) {
      console.error('[MediaEngine] Library sync failed:', err);
      setSyncState({
        id: syncId,
        user_id: options.userId || null,
        status: 'error',
        progress: 0,
        error: err?.message || 'Sync failed',
        last_sync_time: Date.now(),
      });
      this.lastSyncCompletedTime = Date.now();
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncArtists(account: NavidromeAccountRecord): Promise<CachedArtist[]> {
    try {
      const data = await this.fetchSubsonic(account, 'getArtists.view');
      const index = data?.artists?.index || [];
      const artists: CachedArtist[] = [];

      for (const group of index) {
        if (Array.isArray(group.artist)) {
          for (const a of group.artist) {
            artists.push({
              id: String(a.id),
              user_id: account.user,
              name: a.name || 'Unknown Artist',
              album_count: typeof a.albumCount === 'number' ? a.albumCount : 0,
              cover_art: a.coverArt || a.id || null,
              starred: a.starred ? 1 : 0,
            });
          }
        }
      }

      if (artists.length > 0) {
        upsertArtistsBatch(artists);
      }
      return artists;
    } catch (err) {
      console.warn('[MediaEngine] Failed to sync artists:', err);
      return [];
    }
  }

  private async syncAlbums(account: NavidromeAccountRecord): Promise<CachedAlbum[]> {
    const allAlbums: CachedAlbum[] = [];
    let offset = 0;
    const batchSize = 500;
    let hasMore = true;

    while (hasMore) {
      try {
        const data = await this.fetchSubsonic(account, 'getAlbumList2.view', {
          type: 'alphabeticalByName',
          size: String(batchSize),
          offset: String(offset),
        });

        const list = data?.albumList2?.album || [];
        const batch = Array.isArray(list) ? list : [list].filter(Boolean);

        if (batch.length === 0) break;

        const mapped: CachedAlbum[] = batch.map((a: any) => ({
          id: String(a.id),
          user_id: account.user,
          name: a.name || a.title || 'Unknown Album',
          artist: a.artist || null,
          artist_id: a.artistId ? String(a.artistId) : null,
          cover_art: a.coverArt || a.id || null,
          song_count: typeof a.songCount === 'number' ? a.songCount : 0,
          duration: typeof a.duration === 'number' ? Math.round(a.duration) : 0,
          year: typeof a.year === 'number' ? a.year : null,
          genre: a.genre || null,
          created_at: a.created ? new Date(a.created).getTime() : Date.now(),
        }));

        upsertAlbumsBatch(mapped);
        allAlbums.push(...mapped);
        offset += batch.length;

        if (batch.length < batchSize) {
          hasMore = false;
        }
      } catch (err) {
        console.warn(`[MediaEngine] Failed to sync album batch at offset ${offset}:`, err);
        break;
      }
    }

    return allAlbums;
  }

  private async syncTracks(
    account: NavidromeAccountRecord,
    albums: CachedAlbum[],
    syncId: string,
    artistCount: number
  ): Promise<CachedTrack[]> {
    const allTracks: CachedTrack[] = [];
    let offset = 0;
    const batchSize = 500;
    let hasMore = true;

    while (hasMore) {
      try {
        const data = await this.fetchSubsonic(account, 'search3.view', {
          query: '',
          songCount: String(batchSize),
          songOffset: String(offset),
        });

        const songList = data?.searchResult3?.song || [];
        const batch = Array.isArray(songList) ? songList : [songList].filter(Boolean);

        if (batch.length === 0) {
          break;
        }

        const mapped: CachedTrack[] = batch.map((s: any) => ({
          id: String(s.id),
          user_id: account.user,
          title: s.title || s.name || 'Unknown Track',
          artist: s.artist || null,
          artist_id: s.artistId ? String(s.artistId) : null,
          album: s.album || null,
          album_id: s.albumId ? String(s.albumId) : null,
          duration: typeof s.duration === 'number' ? Math.round(s.duration) : 0,
          track_number: typeof s.track === 'number' ? s.track : null,
          disc_number: typeof s.discNumber === 'number' ? s.discNumber : 1,
          year: typeof s.year === 'number' ? s.year : null,
          genre: s.genre || null,
          cover_art: s.coverArt || s.albumId || s.id || null,
          bit_rate: typeof s.bitRate === 'number' ? s.bitRate : null,
          suffix: s.suffix || null,
          created_at: s.created ? new Date(s.created).getTime() : Date.now(),
        }));

        upsertTracksBatch(mapped);
        allTracks.push(...mapped);
        offset += batch.length;

        const dynamicProgress = Math.min(
          95,
          50 + Math.round((offset / (offset + 500)) * 45)
        );
        setSyncState({
          id: syncId,
          user_id: account.user,
          status: 'syncing',
          progress: dynamicProgress,
          total_artists: artistCount,
          total_albums: albums.length,
          total_tracks: allTracks.length,
          last_sync_time: Date.now(),
          error: null,
        });

        if (batch.length < batchSize) {
          hasMore = false;
        }
      } catch (err) {
        console.warn(`[MediaEngine] Failed to sync track batch at offset ${offset}:`, err);
        break;
      }
    }

    // Fallback: If search3 returned 0 tracks but we have albums, fetch tracks via getAlbum
    if (allTracks.length === 0 && albums.length > 0) {
      console.log(
        `[MediaEngine] search3 returned 0 tracks; falling back to per-album track fetching for ${albums.length} albums`
      );
      for (let i = 0; i < albums.length; i++) {
        const album = albums[i]!;
        try {
          const data = await this.fetchSubsonic(account, 'getAlbum.view', { id: album.id });
          const songs = data?.album?.song || [];
          const songBatch = Array.isArray(songs) ? songs : [songs].filter(Boolean);

          const mapped: CachedTrack[] = songBatch.map((s: any) => ({
            id: String(s.id),
            user_id: account.user,
            title: s.title || s.name || 'Unknown Track',
            artist: s.artist || album.artist || null,
            artist_id: s.artistId ? String(s.artistId) : album.artist_id,
            album: s.album || album.name || null,
            album_id: album.id,
            duration: typeof s.duration === 'number' ? Math.round(s.duration) : 0,
            track_number: typeof s.track === 'number' ? s.track : null,
            disc_number: typeof s.discNumber === 'number' ? s.discNumber : 1,
            year: typeof s.year === 'number' ? s.year : album.year,
            genre: s.genre || album.genre || null,
            cover_art: s.coverArt || album.cover_art || s.id || null,
            bit_rate: typeof s.bitRate === 'number' ? s.bitRate : null,
            suffix: s.suffix || null,
            created_at: s.created ? new Date(s.created).getTime() : Date.now(),
          }));

          if (mapped.length > 0) {
            upsertTracksBatch(mapped);
            allTracks.push(...mapped);
          }

          if (i % 10 === 0 || i === albums.length - 1) {
            const prog = 50 + Math.round(((i + 1) / albums.length) * 45);
            setSyncState({
              id: syncId,
              user_id: account.user,
              status: 'syncing',
              progress: prog,
              total_artists: artistCount,
              total_albums: albums.length,
              total_tracks: allTracks.length,
              last_sync_time: Date.now(),
              error: null,
            });
          }
        } catch (err) {
          console.warn(`[MediaEngine] Failed to get tracks for album ${album.id}:`, err);
        }
      }
    }

    return allTracks;
  }

  private async fetchSubsonic(
    account: NavidromeAccountRecord,
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<any> {
    const authParams = this.getSubsonicAuthParams(account);
    const query = new URLSearchParams(params).toString();
    const queryPart = query ? `&${query}` : '';
    const fullUrl = `${account.url.replace(/\/$/, '')}/rest/${endpoint}?${authParams}${queryPart}`;

    const maskedUrl = this.maskTokens(fullUrl);

    const response = await fetch(fullUrl, {
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      throw new Error(`Subsonic responded with HTTP ${response.status} for ${maskedUrl}`);
    }

    const data = (await response.json()) as any;
    const subResponse = data?.['subsonic-response'];

    if (!subResponse || subResponse.status === 'failed') {
      const errorMsg = subResponse?.error?.message || 'Subsonic response failure';
      throw new Error(`Subsonic API error: ${errorMsg}`);
    }

    return subResponse;
  }

  private getSubsonicAuthParams(account: NavidromeAccountRecord): string {
    if (account.token && account.salt) {
      return `u=${encodeURIComponent(account.user)}&t=${account.token}&s=${account.salt}&v=1.16.1&c=HoladMediaEngine&f=json`;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const token = md5((account.pass || '') + salt);
    return `u=${encodeURIComponent(account.user)}&t=${token}&s=${salt}&v=1.16.1&c=HoladMediaEngine&f=json`;
  }

  private maskTokens(url: string): string {
    return url
      .replace(/([?&]t=)[^&]+/g, '$1***')
      .replace(/([?&]s=)[^&]+/g, '$1***')
      .replace(/([?&]p=)[^&]+/g, '$1***');
  }
}

export const librarySyncService = new LibrarySyncService();
