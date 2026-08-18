import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  vfs,
  resetE2EHarness,
  setPlatform,
  setOnline,
  mockState,
  registerStarredItems,
} from './e2e/harness';
import { useDownloadStore } from '../store/downloadStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { StorageManager } from '../utils/StorageManager';
import DownloadedMusicGrid from '../components/settings/DownloadedMusicGrid';
import DownloadsView from '../components/views/DownloadsView';
import {
  fetchStarredLibrary,
  filterItemsForLibraryDownload,
  downloadEntireLibrary,
} from '../utils/downloadHelper';

describe('Milestone 3 (Feature 11): DownloadedMusicGrid UI & Batch Library Download', () => {
  beforeEach(() => {
    resetE2EHarness();
    setPlatform('tauri');
    setOnline(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. DownloadedMusicGrid Component Rendering & Filters
  // ==========================================================================
  describe('DownloadedMusicGrid Component Rendering', () => {
    it('renders empty state when there are no completed downloads', () => {
      render(<DownloadedMusicGrid />);
      
      expect(screen.getByText('Нет скачанной музыки')).toBeDefined();
      expect(screen.getByText('0 альбомов • 0 треков (0 B)')).toBeDefined();
      expect(screen.getAllByText('Скачать всю библиотеку').length).toBe(2);
    });

    it('renders completed track and album items in grid view', () => {
      const store = useDownloadStore.getState();
      store.startDownload('trk-1', 'Starlight Echo', 'track', undefined, {
        artist: 'Aurora',
        album: 'Cosmic Sky',
        sizeBytes: 1024 * 1024 * 5,
        duration: 210,
      });
      store.completeDownload('trk-1', 'C:/Users/MockUser/Downloads/Holad/tracks/Starlight Echo.mp3', {
        sizeBytes: 1024 * 1024 * 5,
        artist: 'Aurora',
        album: 'Cosmic Sky',
      });

      store.startDownload('alb-1', 'Cosmic Sky', 'album', undefined, {
        artist: 'Aurora',
        sizeBytes: 1024 * 1024 * 30,
        totalTrackCount: 6,
      });
      store.completeDownload('alb-1', 'C:/Users/MockUser/Downloads/Holad/albums/Cosmic Sky', {
        sizeBytes: 1024 * 1024 * 30,
        artist: 'Aurora',
        completedTrackCount: 6,
      });

      render(<DownloadedMusicGrid />);

      expect(screen.getByText('1 альбомов • 1 треков (35 MB)')).toBeDefined();
      expect(screen.getByText('Starlight Echo')).toBeDefined();
      expect(screen.getByText('Cosmic Sky')).toBeDefined();
    });

    it('switches between Grid view and List view', () => {
      const store = useDownloadStore.getState();
      store.startDownload('trk-1', 'Track List Mode', 'track');
      store.completeDownload('trk-1', '/path/trk.mp3', { sizeBytes: 1024 * 500 });

      render(<DownloadedMusicGrid />);

      expect(screen.getByText('Track List Mode')).toBeDefined();
      
      const listBtn = screen.getByTitle('Список');
      fireEvent.click(listBtn);

      expect(screen.getByText('Track List Mode')).toBeDefined();
      
      const gridBtn = screen.getByTitle('Сетка');
      fireEvent.click(gridBtn);

      expect(screen.getByText('Track List Mode')).toBeDefined();
    });

    it('filters items correctly with Tabs (All, Albums, Tracks)', () => {
      const store = useDownloadStore.getState();
      store.startDownload('t-1', 'Solo Track', 'track');
      store.completeDownload('t-1', '/path/t1.mp3');

      store.startDownload('a-1', 'Full Album', 'album');
      store.completeDownload('a-1', '/path/a1');

      render(<DownloadedMusicGrid />);

      // Default: All tab
      expect(screen.getByText('Solo Track')).toBeDefined();
      expect(screen.getByText('Full Album')).toBeDefined();

      // Albums tab
      const albumsTab = screen.getByText(/Альбомы \(1\)/);
      fireEvent.click(albumsTab);
      expect(screen.queryByText('Solo Track')).toBeNull();
      expect(screen.getByText('Full Album')).toBeDefined();

      // Tracks tab
      const tracksTab = screen.getByText(/Треки \(1\)/);
      fireEvent.click(tracksTab);
      expect(screen.getByText('Solo Track')).toBeDefined();
      expect(screen.queryByText('Full Album')).toBeNull();
    });

    it('filters items correctly with Search input', () => {
      const store = useDownloadStore.getState();
      store.startDownload('t-1', 'Midnight City', 'track', undefined, { artist: 'M83' });
      store.completeDownload('t-1', '/path/t1.mp3', { artist: 'M83' });

      store.startDownload('t-2', 'Oblivion', 'track', undefined, { artist: 'Grimes' });
      store.completeDownload('t-2', '/path/t2.mp3', { artist: 'Grimes' });

      render(<DownloadedMusicGrid />);

      const searchInput = screen.getByPlaceholderText('Поиск по скачанным...');
      fireEvent.change(searchInput, { target: { value: 'Grimes' } });

      expect(screen.queryByText('Midnight City')).toBeNull();
      expect(screen.getByText('Oblivion')).toBeDefined();

      fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });
      expect(screen.getByText('Ничего не найдено по вашему запросу')).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. Playback Interactions
  // ==========================================================================
  describe('Playback Interactions', () => {
    it('clicking Play on a downloaded track triggers setQueueAndPlay on playerStore', () => {
      const store = useDownloadStore.getState();
      store.startDownload('play-t1', 'Playable Song', 'track', 'cov.jpg', {
        artist: 'The Artist',
        album: 'The Album',
        duration: 180,
      });
      store.completeDownload('play-t1', '/path/song.mp3', {
        localCoverArtUri: 'http://asset.localhost/covers/play-t1.jpg',
      });

      render(<DownloadedMusicGrid />);

      const playButton = screen.getByTitle('Воспроизвести');
      fireEvent.click(playButton);

      const queue = usePlayerStore.getState().queue;
      expect(queue.length).toBe(1);
      expect(queue[0].title).toBe('Playable Song');
      expect(queue[0].artist).toBe('The Artist');
      expect(usePlayerStore.getState().currentIndex).toBe(0);
    });

    it('clicking Play respects clickAction === play_next in settingsStore', () => {
      useSettingsStore.setState({ clickAction: 'play_next' });
      usePlayerStore.setState({
        queue: [{ id: 'existing', title: 'Existing', artist: 'Art', duration: 100 }],
        currentTrackIndex: 0,
      });

      const store = useDownloadStore.getState();
      store.startDownload('play-next-t', 'Queued Next Song', 'track');
      store.completeDownload('play-next-t', '/path/next.mp3');

      render(<DownloadedMusicGrid />);

      const playButton = screen.getByTitle('Воспроизвести');
      fireEvent.click(playButton);

      const queue = usePlayerStore.getState().queue;
      expect(queue.length).toBe(2);
      expect(queue[1].title).toBe('Queued Next Song');
    });

    it('clicking Play on a downloaded album queues its offline child tracks', () => {
      const store = useDownloadStore.getState();
      store.startDownload('alb-play-1', 'Album Of The Year', 'album');
      store.completeDownload('alb-play-1', '/path/album1');

      // Indexed child tracks
      store.startDownload('child-1', 'Track One', 'track', undefined, {
        albumId: 'alb-play-1',
        album: 'Album Of The Year',
        artist: 'Band',
      });
      store.completeDownload('child-1', '/path/track1.mp3', {
        albumId: 'alb-play-1',
        album: 'Album Of The Year',
        artist: 'Band',
      });

      store.startDownload('child-2', 'Track Two', 'track', undefined, {
        albumId: 'alb-play-1',
        album: 'Album Of The Year',
        artist: 'Band',
      });
      store.completeDownload('child-2', '/path/track2.mp3', {
        albumId: 'alb-play-1',
        album: 'Album Of The Year',
        artist: 'Band',
      });

      render(<DownloadedMusicGrid />);

      const playButtons = screen.getAllByTitle('Воспроизвести');
      fireEvent.click(playButtons[0]);

      const queue = usePlayerStore.getState().queue;
      expect(queue.length).toBeGreaterThanOrEqual(2);
      expect(queue.some(t => t.title === 'Track One')).toBe(true);
      expect(queue.some(t => t.title === 'Track Two')).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Deletion Interactions
  // ==========================================================================
  describe('Single Item Deletion Interactions', () => {
    it('deleting a track physically deletes file and removes entry from store', async () => {
      const filePath = 'C:/Users/MockUser/Downloads/Holad/tracks/DelTrack.mp3';
      await vfs.writeFile(filePath, new Uint8Array(1024));

      const store = useDownloadStore.getState();
      store.startDownload('del-t1', 'Del Track', 'track');
      store.completeDownload('del-t1', filePath);

      const onRefresh = vi.fn();
      render(<DownloadedMusicGrid onRefreshRequested={onRefresh} />);

      expect(screen.getByText('Del Track')).toBeDefined();
      expect(await vfs.exists(filePath)).toBe(true);

      const deleteBtn = screen.getByTitle('Удалить');
      fireEvent.click(deleteBtn);

      await waitFor(async () => {
        expect(store.downloads['del-t1']).toBeUndefined();
        expect(await vfs.exists(filePath)).toBe(false);
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it('deleting an album deletes directory, removes child tracks from store, and triggers refresh', async () => {
      const albumDir = 'C:/Users/MockUser/Downloads/Holad/albums/DelAlbum';
      await vfs.writeFile(`${albumDir}/t1.mp3`, new Uint8Array(500));
      await vfs.writeFile(`${albumDir}/t2.mp3`, new Uint8Array(500));

      const store = useDownloadStore.getState();
      store.startDownload('del-alb-1', 'Del Album', 'album');
      store.completeDownload('del-alb-1', albumDir);

      store.startDownload('del-ch-1', 'Child 1', 'track', undefined, { albumId: 'del-alb-1' });
      store.completeDownload('del-ch-1', `${albumDir}/t1.mp3`, { albumId: 'del-alb-1' });

      const onRefresh = vi.fn();
      render(<DownloadedMusicGrid onRefreshRequested={onRefresh} />);

      const deleteBtns = screen.getAllByTitle('Удалить');
      fireEvent.click(deleteBtns[0]);

      await waitFor(async () => {
        expect(store.downloads['del-alb-1']).toBeUndefined();
        expect(store.downloads['del-ch-1']).toBeUndefined();
        expect(await vfs.exists(`${albumDir}/t1.mp3`)).toBe(false);
        expect(onRefresh).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // 4. Batch Library Download Orchestration
  // ==========================================================================
  describe('Batch Library Download Orchestration', () => {
    it('fetchStarredLibrary returns normalized songs and albums', async () => {
      const s1 = { id: 's-fetch-1', title: 'Song 1', artist: 'A1', duration: 120 };
      const a1 = { id: 'a-fetch-1', title: 'Album 1', artist: 'A1', songCount: 5, song: [] };
      registerStarredItems([s1], [a1]);

      const library = await fetchStarredLibrary();
      expect(library.songs.length).toBe(1);
      expect(library.songs[0].id).toBe('s-fetch-1');
      expect(library.albums.length).toBe(1);
      expect(library.albums[0].id).toBe('a-fetch-1');
    });

    it('filterItemsForLibraryDownload skips items already completed or queued', () => {
      const starredSongs = [
        { id: 's1', title: 'Song 1', albumId: 'alb-1' },
        { id: 's2', title: 'Song 2' },
        { id: 's3', title: 'Song 3', albumId: 'alb-new' },
      ];
      const starredAlbums = [
        { id: 'alb-1', title: 'Album 1' },
        { id: 'alb-new', title: 'Album New' },
      ];

      const downloads = {
        s1: { id: 's1', name: 'Song 1', type: 'track' as const, status: 'completed' as const, progress: 100, path: '/p', timestamp: 1 },
        'alb-1': { id: 'alb-1', name: 'Album 1', type: 'album' as const, status: 'completed' as const, progress: 100, path: '/p2', timestamp: 1 },
      };

      const result = filterItemsForLibraryDownload(starredSongs, starredAlbums, downloads);
      
      // alb-1 is completed, so alb-new is queued
      expect(result.albumsToQueue.length).toBe(1);
      expect(result.albumsToQueue[0].id).toBe('alb-new');

      // s1 is completed, s3 is child of alb-new which is being queued, so only s2 is queued
      expect(result.tracksToQueue.length).toBe(1);
      expect(result.tracksToQueue[0].id).toBe('s2');

      expect(result.skippedCount).toBe(3);
    });

    it('downloadEntireLibrary aborts and reports error if offline', async () => {
      setOnline(false);
      const onProgress = vi.fn();

      const res = await downloadEntireLibrary(onProgress);

      expect(res.error).toBe('Cannot download library while offline');
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', error: 'Cannot download library while offline' })
      );
    });

    it('downloadEntireLibrary downloads pending starred items and notifies onProgress', async () => {
      const s1 = { id: 'batch-s1', title: 'Batch Song 1', artist: 'Art', duration: 150 };
      const s2 = { id: 'batch-s2', title: 'Batch Song 2', artist: 'Art', duration: 160 };
      registerStarredItems([s1, s2]);

      const onProgress = vi.fn();
      const res = await downloadEntireLibrary(onProgress, 2);

      expect(res.queuedCount).toBe(2);
      expect(res.skippedCount).toBe(0);

      const store = useDownloadStore.getState();
      expect(store.downloads['batch-s1']?.status).toBe('completed');
      expect(store.downloads['batch-s2']?.status).toBe('completed');
    });

    it('"Download Entire Library" button triggers batch download and shows completion message', async () => {
      const s1 = { id: 'ui-batch-1', title: 'UI Star Song', artist: 'Star Art', duration: 120 };
      registerStarredItems([s1]);

      const onRefresh = vi.fn();
      render(<DownloadedMusicGrid onRefreshRequested={onRefresh} />);

      const downloadAllBtn = screen.getAllByText('Скачать всю библиотеку')[0];
      fireEvent.click(downloadAllBtn);

      await waitFor(() => {
        expect(screen.getByText('Загрузка библиотеки завершена!')).toBeDefined();
        expect(onRefresh).toHaveBeenCalled();
      });

      const store = useDownloadStore.getState();
      expect(store.downloads['ui-batch-1']?.status).toBe('completed');
    });
  });

  // ==========================================================================
  // 5. DownloadsView Integration & Active Downloads
  // ==========================================================================
  describe('DownloadsView Integration', () => {
    it('renders DownloadsView with active downloads section and DownloadedMusicGrid', () => {
      const store = useDownloadStore.getState();
      store.startDownload('active-dl-1', 'Active Download Track', 'track');
      store.updateProgress('active-dl-1', 40);

      store.startDownload('completed-dl-1', 'Completed Song', 'track');
      store.completeDownload('completed-dl-1', '/path/done.mp3');

      render(<DownloadsView />);

      expect(screen.getByText('Загрузки')).toBeDefined();
      expect(screen.getByText(/Активные загрузки \(1\)/)).toBeDefined();
      expect(screen.getByText('Active Download Track')).toBeDefined();
      expect(screen.getByText('40%')).toBeDefined();
      expect(screen.getByText('Completed Song')).toBeDefined();
    });

    it('clearHistory button in DownloadsView clears completed downloads but preserves active ones', () => {
      const store = useDownloadStore.getState();
      store.startDownload('active-dl-2', 'Active Song', 'track');
      store.startDownload('done-dl-2', 'Done Song', 'track');
      store.completeDownload('done-dl-2', '/path/done2.mp3');

      render(<DownloadsView />);

      const clearBtn = screen.getByText('Очистить историю');
      fireEvent.click(clearBtn);

      expect(useDownloadStore.getState().downloads['active-dl-2']).toBeDefined();
      expect(useDownloadStore.getState().downloads['done-dl-2']).toBeUndefined();
    });
  });
});
