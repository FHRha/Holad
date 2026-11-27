import crypto from 'crypto';
import md5 from 'md5';
import type { Server } from 'socket.io';
import {
  getNavidromeAccounts,
  upsertTracksBatch,
  upsertAlbumsBatch,
  upsertArtistsBatch,
  pruneDeletedTracks,
  pruneDeletedAlbums,
  pruneDeletedArtists,
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

export interface SubsonicScanStatus {
  scanning: boolean;
  count?: number;
  folderCount?: number;
  lastScan?: string;
}

const DEFAULT_BACKGROUND_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class LibrarySyncService {
  private isSyncing = false;
  private lastSyncCompletedTime = 0;
  private readonly syncCooldownMs = 30_000; // 30s cooldown
  private syncIntervalTimer: NodeJS.Timeout | null = null;
  private io: Server | null = null;
  private lastScanCountByAccount = new Map<string, number>();

  constructor() {
    // Background interval: check & sync every 10 minutes
    this.startBackgroundSync(DEFAULT_BACKGROUND_SYNC_INTERVAL_MS);
  }

  public setIo(io: Server): void {
    this.io = io;
  }

  public startBackgroundSync(intervalMs = DEFAULT_BACKGROUND_SYNC_INTERVAL_MS): void {
    if (this.syncIntervalTimer) {
      clearInterval(this.syncIntervalTimer);
    }
    this.syncIntervalTimer = setInterval(() => {
      console.log('[MediaEngine] Scheduled library sync check triggered');
      this.checkAndRunBackgroundSync().catch((err) => {
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

  private getConfiguredAccounts(): NavidromeAccountRecord[] {
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
    return accounts;
  }

  private getAccountKey(account: NavidromeAccountRecord): string {
    return `${account.url.replace(/\/$/, '')}::${account.user}`;
  }

  public async getScanStatus(account?: NavidromeAccountRecord): Promise<SubsonicScanStatus | null> {
    const target = account || this.getConfiguredAccounts()[0];
    if (!target) return null;

    try {
      const data = await this.fetchSubsonic(target, 'getScanStatus.view');
      const scanStatus = data?.scanStatus;
      if (!scanStatus) return null;
      return {
        scanning: Boolean(scanStatus.scanning),
        count: typeof scanStatus.count === 'number' ? scanStatus.count : undefined,
        folderCount: typeof scanStatus.folderCount === 'number' ? scanStatus.folderCount : undefined,
        lastScan: typeof scanStatus.lastScan === 'string' ? scanStatus.lastScan : undefined,
      };
    } catch (err) {
      console.warn(`[MediaEngine] Failed to get scan status for ${target.user}:`, err);
      return null;
    }
  }

  public async startScan(account?: NavidromeAccountRecord): Promise<SubsonicScanStatus | null> {
    const target = account || this.getConfiguredAccounts()[0];
    if (!target) return null;

    try {
      const data = await this.fetchSubsonic(target, 'startScan.view');
      const scanStatus = data?.scanStatus;
      if (!scanStatus) return null;
      return {
        scanning: Boolean(scanStatus.scanning),
        count: typeof scanStatus.count === 'number' ? scanStatus.count : undefined,
        folderCount: typeof scanStatus.folderCount === 'number' ? scanStatus.folderCount : undefined,
        lastScan: typeof scanStatus.lastScan === 'string' ? scanStatus.lastScan : undefined,
      };
    } catch (err) {
      console.warn(`[MediaEngine] Failed to start scan for ${target.user}:`, err);
      return null;
    }
  }

  private async checkAndRunBackgroundSync(): Promise<void> {
    if (this.isSyncing) return;

    const accounts = this.getConfiguredAccounts();
    if (accounts.length === 0) return;

    // Lightweight check via getScanStatus before running full sync when a baseline exists
    let shouldSync = false;
    for (const account of accounts) {
      const stats = getLibraryStats(account.user);
      const key = this.getAccountKey(account);
      const prevCount = this.lastScanCountByAccount.get(key);

      if (stats.totalTracks === 0 || prevCount === undefined) {
        shouldSync = true;
        break;
      }

      const scanStatus = await this.getScanStatus(account);
      if (
        !scanStatus ||
        scanStatus.scanning ||
        scanStatus.count === undefined ||
        scanStatus.count !== prevCount
      ) {
        shouldSync = true;
        break;
      }
    }

    if (!shouldSync) {
      return;
    }

    await this.runSync({ isManual: false });
  }

  public triggerSync(userId?: string): boolean {
    if (this.isSyncing) {
      return false;
    }
    setImmediate(() => {
      this.runSync({ isManual: false, userId }).catch((err) => {
        console.error('[MediaEngine] Background sync trigger error:', err);
      });
    });
    return true;
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

  public async runSync(options: { isManual?: boolean | undefined; userId?: string | undefined } = {}): Promise<void> {
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
      const accounts = this.getConfiguredAccounts();

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

      let totalTracksAll = 0;
      let totalAlbumsAll = 0;
      let totalArtistsAll = 0;
      let anySucceeded = false;
      let anyChanges = false;
      let lastError: any = null;

      for (let accountIdx = 0; accountIdx < accounts.length; accountIdx++) {
        const account = accounts[accountIdx]!;
        const progressBase = Math.round((accountIdx / accounts.length) * 90);
        const progressSpan = Math.max(10, Math.round(90 / accounts.length));

        try {
          console.log(
            `[MediaEngine] Starting library sync (${accountIdx + 1}/${accounts.length}) for account user: ${account.user} at ${account.url}`
          );

          const prevStats = getLibraryStats(account.user);

          // 1. Fetch & cache Artists
          const artistsResult = await this.syncArtists(account);
          const artists = artistsResult.artists;
          setSyncState({
            id: syncId,
            user_id: options.userId || account.user,
            status: 'syncing',
            progress: Math.min(95, 5 + progressBase + Math.round(progressSpan * 0.25)),
            total_artists: totalArtistsAll + artists.length,
            total_albums: totalAlbumsAll,
            total_tracks: totalTracksAll,
            last_sync_time: Date.now(),
            error: null,
          });

          // 2. Fetch & cache Albums
          const albumsResult = await this.syncAlbums(account);
          const albums = albumsResult.albums;
          setSyncState({
            id: syncId,
            user_id: options.userId || account.user,
            status: 'syncing',
            progress: Math.min(95, 5 + progressBase + Math.round(progressSpan * 0.5)),
            total_artists: totalArtistsAll + artists.length,
            total_albums: totalAlbumsAll + albums.length,
            total_tracks: totalTracksAll,
            last_sync_time: Date.now(),
            error: null,
          });

          // 3. Fetch & cache Tracks
          const tracksResult = await this.syncTracks(account, albums, syncId, artists);
          const { tracks, totalArtists, activeArtistIds } = tracksResult;

          // 4. Prune deleted items after a full successful sync for that entity type
          let prunedCount = 0;
          if (tracksResult.complete) {
            prunedCount += pruneDeletedTracks(
              account.user,
              tracks.map((t) => t.id)
            );
          }
          if (albumsResult.complete) {
            prunedCount += pruneDeletedAlbums(
              account.user,
              albums.map((a) => a.id)
            );
          }
          if (artistsResult.complete && tracksResult.complete) {
            prunedCount += pruneDeletedArtists(
              account.user,
              Array.from(activeArtistIds)
            );
          }

          if (prunedCount > 0) {
            console.log(`[MediaEngine] Pruned ${prunedCount} deleted items for ${account.user}`);
          }

          const afterStats = getLibraryStats(account.user);
          if (
            prunedCount > 0 ||
            afterStats.totalTracks !== prevStats.totalTracks ||
            afterStats.totalAlbums !== prevStats.totalAlbums ||
            afterStats.totalArtists !== prevStats.totalArtists ||
            (tracks.length > 0 && prevStats.totalTracks === 0)
          ) {
            anyChanges = true;
          }

          // Record scan count baseline if available
          const scanStatus = await this.getScanStatus(account);
          if (scanStatus && typeof scanStatus.count === 'number') {
            this.lastScanCountByAccount.set(this.getAccountKey(account), scanStatus.count);
          }

          totalTracksAll += tracks.length;
          totalAlbumsAll += albums.length;
          totalArtistsAll += totalArtists;
          anySucceeded = true;

          if (account.user && account.user !== syncId) {
            setSyncState({
              id: account.user,
              user_id: account.user,
              status: 'completed',
              progress: 100,
              total_artists: totalArtists,
              total_albums: albums.length,
              total_tracks: tracks.length,
              last_sync_time: Date.now(),
              error: null,
            });
          }
        } catch (accountErr) {
          lastError = accountErr;
          console.error(`[MediaEngine] Sync failed for account ${account.user}:`, accountErr);
        }
      }

      if (!anySucceeded && lastError) {
        throw lastError;
      }

      // Finalize completed state
      setSyncState({
        id: syncId,
        user_id: options.userId || accounts[0]!.user,
        status: 'completed',
        progress: 100,
        total_artists: totalArtistsAll,
        total_albums: totalAlbumsAll,
        total_tracks: totalTracksAll,
        last_sync_time: Date.now(),
        error: null,
      });

      this.lastSyncCompletedTime = Date.now();
      console.log(
        `[MediaEngine] Library sync finished successfully. Cached ${totalArtistsAll} artists, ${totalAlbumsAll} albums, ${totalTracksAll} tracks across ${accounts.length} account(s).`
      );

      if ((anyChanges || options.isManual) && this.io) {
        this.io.emit('holad_libraryUpdated', {
          timestamp: Date.now(),
          totalTracks: totalTracksAll,
          totalAlbums: totalAlbumsAll,
          totalArtists: totalArtistsAll,
        });
      }
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

  private async syncArtists(
    account: NavidromeAccountRecord
  ): Promise<{ artists: CachedArtist[]; complete: boolean }> {
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
      return { artists, complete: true };
    } catch (err) {
      console.warn('[MediaEngine] Failed to sync artists:', err);
      return { artists: [], complete: false };
    }
  }

  private async syncAlbums(
    account: NavidromeAccountRecord
  ): Promise<{ albums: CachedAlbum[]; complete: boolean }> {
    const allAlbums: CachedAlbum[] = [];
    let offset = 0;
    const batchSize = 500;
    let hasMore = true;
    let complete = true;

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
        complete = false;
        break;
      }
    }

    return { albums: allAlbums, complete };
  }

  private async syncTracks(
    account: NavidromeAccountRecord,
    albums: CachedAlbum[],
    syncId: string,
    initialArtists: CachedArtist[]
  ): Promise<{
    tracks: CachedTrack[];
    totalArtists: number;
    activeArtistIds: Set<string>;
    complete: boolean;
  }> {
    const allTracks: CachedTrack[] = [];
    let offset = 0;
    const batchSize = 500;
    let hasMore = true;
    let complete = true;

    const artistSplitRegex = /\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s*&\s*|\s+x\s+/i;
    const knownArtists = new Set<string>(
      initialArtists.map((a) => a.name.trim().toLowerCase()).filter(Boolean)
    );
    const activeArtistIds = new Set<string>(initialArtists.map((a) => a.id));
    const newArtistsBatch: CachedArtist[] = [];

    const processArtistsFromTracks = (tracksBatch: CachedTrack[]) => {
      for (const t of tracksBatch) {
        if (!t.artist) continue;
        const parts = t.artist.split(artistSplitRegex);
        for (const rawPart of parts) {
          const artistName = rawPart.trim();
          if (!artistName) continue;
          const lower = artistName.toLowerCase();
          if (!knownArtists.has(lower)) {
            knownArtists.add(lower);
            const isOnlyArtist = parts.length === 1 || t.artist.trim().toLowerCase() === lower;
            const artistId = (isOnlyArtist && t.artist_id)
              ? t.artist_id
              : `artist_${md5(lower)}`;

            activeArtistIds.add(artistId);
            newArtistsBatch.push({
              id: artistId,
              name: artistName,
              user_id: account.user,
              album_count: 0,
              cover_art: t.cover_art || null,
              starred: 0,
            });
          }
        }
      }

      if (newArtistsBatch.length >= 200) {
        upsertArtistsBatch(newArtistsBatch.splice(0, newArtistsBatch.length));
      }
    };

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
        processArtistsFromTracks(mapped);
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
          total_artists: knownArtists.size,
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
        complete = false;
        break;
      }
    }

    // Fallback: If search3 returned 0 tracks without failing, and we have albums, fetch tracks via getAlbum
    if (complete && allTracks.length === 0 && albums.length > 0) {
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
            artist_id: s.artistId ? String(s.artistId) : (album.artist_id ?? null),
            album: s.album || album.name || null,
            album_id: album.id,
            duration: typeof s.duration === 'number' ? Math.round(s.duration) : 0,
            track_number: typeof s.track === 'number' ? s.track : null,
            disc_number: typeof s.discNumber === 'number' ? s.discNumber : 1,
            year: typeof s.year === 'number' ? s.year : (album.year ?? null),
            genre: s.genre || album.genre || null,
            cover_art: s.coverArt || album.cover_art || s.id || null,
            bit_rate: typeof s.bitRate === 'number' ? s.bitRate : null,
            suffix: s.suffix || null,
            created_at: s.created ? new Date(s.created).getTime() : Date.now(),
          }));

          if (mapped.length > 0) {
            upsertTracksBatch(mapped);
            processArtistsFromTracks(mapped);
            allTracks.push(...mapped);
          }

          if (i % 10 === 0 || i === albums.length - 1) {
            const prog = 50 + Math.round(((i + 1) / albums.length) * 45);
            setSyncState({
              id: syncId,
              user_id: account.user,
              status: 'syncing',
              progress: prog,
              total_artists: knownArtists.size,
              total_albums: albums.length,
              total_tracks: allTracks.length,
              last_sync_time: Date.now(),
              error: null,
            });
          }
        } catch (err) {
          console.warn(`[MediaEngine] Failed to get tracks for album ${album.id}:`, err);
          complete = false;
        }
      }
    }

    if (newArtistsBatch.length > 0) {
      upsertArtistsBatch(newArtistsBatch.splice(0, newArtistsBatch.length));
    }

    return { tracks: allTracks, totalArtists: knownArtists.size, activeArtistIds, complete };
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
