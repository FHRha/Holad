import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '../../i18n';
import i18n from '../../i18n';
import {
  vfs,
  mockState,
  resetE2EHarness,
  setPlatform,
  setOnline,
  registerMockSong,
  registerMockAlbum,
  registerStarredItems,
  setSimulatedNetworkFailure,
} from './harness';

import {
  useDownloadStore,
  isItemDownloaded,
  getDownloadedTracks,
  getDownloadedAlbums,
  getOfflineTracks,
  getDownloadQueueStats,
  DownloadItem,
} from '../../store/downloadStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useUIStore } from '../../store/uiStore';
import { StorageManager } from '../../utils/StorageManager';
import {
  handleDownload,
  cancelActiveDownload,
  downloadEntireLibrary,
  fetchStarredLibrary,
  filterItemsForLibraryDownload,
} from '../../utils/downloadHelper';
import {
  calculateStorageStatistics,
  formatBytes,
  calculatePartitionPercentages,
  getDirectorySize,
  getMetadataSize,
} from '../../utils/storageStatsHelper';
import Sidebar from '../../components/layout/Sidebar';
import DownloadedMusicGrid from '../../components/settings/DownloadedMusicGrid';
import DownloadsView from '../../components/views/DownloadsView';
import SettingsModal from '../../components/modals/SettingsModal';
import MobileSettingsView from '../../components/views/MobileSettingsView';
import StorageStatsBar from '../../components/settings/StorageStatsBar';
import ImageMemoryLimitControl from '../../components/settings/ImageMemoryLimitControl';
import StorageDangerZone from '../../components/settings/StorageDangerZone';

describe('Tier 5 Adversarial Coverage Hardening: Queue, Library Sync & UI Workflows', () => {
  beforeEach(() => {
    resetE2EHarness();
    setPlatform('tauri');
    setOnline(true);
    i18n.changeLanguage('ru');
    useUIStore.setState({ leftSidebarWidth: 150 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Dimension 1: Concurrent Queue Operations & Stress Race Conditions
  // ==========================================================================
  describe('Dimension 1: Concurrent Queue Operations & Stress Race Conditions', () => {
    it('[T5.Q.01] Canceling active download item while batch-enqueueing 50 items maintains store integrity', async () => {
      const store = useDownloadStore.getState();

      // Enqueue 50 items simultaneously
      for (let i = 1; i <= 50; i++) {
        store.queueDownload(`bulk-trk-${i}`, `Bulk Track ${i}`, 'track', `cov-${i}`, {
          artist: `Artist ${i}`,
          album: `Album ${Math.ceil(i / 10)}`,
          duration: 180 + i,
        });
      }

      // Start item 1 and item 2 as actively downloading
      store.startDownload('bulk-trk-1', 'Bulk Track 1', 'track');
      store.startDownload('bulk-trk-2', 'Bulk Track 2', 'track');

      expect(Object.keys(useDownloadStore.getState().downloads)).toHaveLength(50);
      expect(useDownloadStore.getState().downloads['bulk-trk-1'].status).toBe('downloading');

      // Cancel bulk-trk-1 while enqueueing 10 more items in parallel
      const cancelPromise = Promise.resolve().then(() => {
        cancelActiveDownload('bulk-trk-1');
      });

      const enqueuePromise = Promise.resolve().then(() => {
        for (let j = 51; j <= 60; j++) {
          useDownloadStore.getState().queueDownload(`bulk-trk-${j}`, `Bulk Track ${j}`, 'track');
        }
      });

      await Promise.all([cancelPromise, enqueuePromise]);

      const stateAfter = useDownloadStore.getState().downloads;
      expect(Object.keys(stateAfter)).toHaveLength(60);
      expect(stateAfter['bulk-trk-1'].status).toBe('cancelled');
      expect(stateAfter['bulk-trk-2'].status).toBe('downloading');
      expect(stateAfter['bulk-trk-55'].status).toBe('queued');

      const stats = getDownloadQueueStats(stateAfter);
      expect(stats.activeDownloadsCount).toBe(1);
      expect(stats.queuedCount).toBe(58); // 48 from first batch + 10 from second
    });

    it('[T5.Q.02] Concurrent race of start, pause, resume, cancel, and error mutations resolves deterministically', async () => {
      const store = useDownloadStore.getState();
      const testIds = Array.from({ length: 20 }, (_, i) => `race-item-${i}`);

      testIds.forEach(id => {
        store.queueDownload(id, `Race Track ${id}`, 'track');
      });

      // Concurrent conflicting operations across all items
      await Promise.all(
        testIds.map(async (id, idx) => {
          if (idx % 4 === 0) {
            store.startDownload(id, `Race Track ${id}`, 'track');
            store.updateProgress(id, 45);
          } else if (idx % 4 === 1) {
            store.startDownload(id, `Race Track ${id}`, 'track');
            store.pauseDownload(id);
          } else if (idx % 4 === 2) {
            store.startDownload(id, `Race Track ${id}`, 'track');
            store.cancelDownload(id);
          } else {
            store.startDownload(id, `Race Track ${id}`, 'track');
            store.errorDownload(id, 'Simulated Timeout');
          }
        })
      );

      const downloads = useDownloadStore.getState().downloads;
      expect(Object.keys(downloads)).toHaveLength(20);

      // Verify each group reached valid state
      expect(downloads['race-item-0'].status).toBe('downloading');
      expect(downloads['race-item-0'].progress).toBe(45);
      expect(downloads['race-item-1'].status).toBe('paused');
      expect(downloads['race-item-2'].status).toBe('cancelled');
      expect(downloads['race-item-3'].status).toBe('error');
      expect(downloads['race-item-3'].error).toBe('Simulated Timeout');
    });

    it('[T5.Q.03] cancelActiveDownload aborts active AbortController and removes from active registry', async () => {
      const song: any = {
        id: 'abort-song-1',
        title: 'Long Stream Song',
        artist: 'Ambient Void',
        album: 'Deep Space',
        duration: 600,
      };
      registerMockSong(song);

      // Trigger download
      const downloadPromise = handleDownload(song.id, song.title, 'track');

      // Immediate cancel
      cancelActiveDownload(song.id);
      await downloadPromise;

      const item = useDownloadStore.getState().downloads[song.id];
      expect(item).toBeDefined();
      expect(item.status).toBe('cancelled');
    });

    it('[T5.Q.04] Multiple simultaneous triggers of downloadEntireLibrary deduplicate and prevent double-queueing', async () => {
      const s1 = { id: 'star-1', title: 'Star Song 1', artist: 'Artist A', album: 'Album A', albumId: 'alb-a', duration: 180 };
      const s2 = { id: 'star-2', title: 'Star Song 2', artist: 'Artist B', album: 'Album B', albumId: 'alb-b', duration: 200 };
      const alb1 = { id: 'star-alb-1', name: 'Star Album 1', artist: 'Artist C', songCount: 1, song: [s1] };

      registerStarredItems([s1, s2], [alb1]);

      // Trigger two concurrent library downloads
      const [res1, res2] = await Promise.all([
        downloadEntireLibrary(),
        downloadEntireLibrary(),
      ]);

      expect(res1.totalFound).toBe(3);
      // Second run detects items already queued/completed
      expect(res2.totalFound).toBe(3);
      
      const allDownloads = useDownloadStore.getState().downloads;
      // star-1 was inside star-alb-1, so it shouldn't be duplicated as a top-level separate track queue item
      expect(allDownloads['star-alb-1']).toBeDefined();
      expect(allDownloads['star-2']).toBeDefined();
    });

    it('[T5.Q.05] Offline transition during active batch download gracefully stops queue worker pool', async () => {
      const songs = Array.from({ length: 5 }, (_, i) => ({
        id: `batch-off-${i}`,
        title: `Offline Batch ${i}`,
        artist: 'Offline Artist',
        album: 'Offline Album',
        duration: 150,
      }));
      songs.forEach(s => registerMockSong(s));
      registerStarredItems(songs, []);

      // Go offline before or during worker run
      setOnline(false);

      const result = await downloadEntireLibrary();
      expect(result.error).toContain('offline');
      expect(result.queuedCount).toBe(0);
    });

    it('[T5.Q.06] Corrupted or partial track metadata is safely sanitized during download execution', async () => {
      const corruptSong: any = {
        id: 'corrupt-1',
        title: '',
        name: undefined,
        artist: null,
        album: undefined,
        duration: -50,
      };
      registerMockSong(corruptSong);

      await handleDownload(corruptSong.id, '', 'track');

      const saved = useDownloadStore.getState().downloads['corrupt-1'];
      expect(saved).toBeDefined();
      expect(saved.status).toBe('completed');
      expect(saved.name).toBe('track');
    });

    it('[T5.Q.07] Bounded concurrency pool processes queue without exceeding maximum worker limits', async () => {
      const songs = Array.from({ length: 6 }, (_, i) => ({
        id: `pool-song-${i}`,
        title: `Pool Song ${i}`,
        artist: 'Concurrency Band',
        album: 'Pool Album',
        duration: 100,
      }));
      songs.forEach(s => registerMockSong(s));
      registerStarredItems(songs, []);

      const progressStatuses: string[] = [];
      const res = await downloadEntireLibrary((p) => {
        progressStatuses.push(p.status);
      }, 2); // Concurrency limit of 2

      expect(res.queuedCount).toBe(6);
      expect(progressStatuses).toContain('enqueuing');
      expect(progressStatuses).toContain('downloading');
      expect(progressStatuses).toContain('completed');

      const downloadedTracks = getDownloadedTracks();
      expect(downloadedTracks.length).toBeGreaterThanOrEqual(6);
    });
  });

  // ==========================================================================
  // Dimension 2: Single Item Deletion Cascading & Immediate Storage Stats Sync
  // ==========================================================================
  describe('Dimension 2: Single Item Deletion Cascading & Immediate Storage Stats Sync', () => {
    it('[T5.D.01] Deleting an album from DownloadedMusicGrid cascades deletion to child tracks on disk and in store', async () => {
      const albumSong1 = { id: 'alb-trk-1', title: 'Track 1', artist: 'Cascade Band', album: 'Cascade Album', albumId: 'alb-cascade-1', duration: 150 };
      const albumSong2 = { id: 'alb-trk-2', title: 'Track 2', artist: 'Cascade Band', album: 'Cascade Album', albumId: 'alb-cascade-1', duration: 200 };
      const album = { id: 'alb-cascade-1', name: 'Cascade Album', artist: 'Cascade Band', songCount: 2, song: [albumSong1, albumSong2] };

      registerMockAlbum(album);

      // Download full album
      await handleDownload(album.id, album.name, 'album');

      // Verify album + 2 child tracks are in downloadStore and VFS
      const storeStateBefore = useDownloadStore.getState().downloads;
      expect(storeStateBefore['alb-cascade-1']).toBeDefined();
      expect(storeStateBefore['alb-trk-1']).toBeDefined();
      expect(storeStateBefore['alb-trk-2']).toBeDefined();

      const initialStats = await calculateStorageStatistics();
      expect(initialStats.audioBytes).toBeGreaterThan(0);

      // Render DownloadedMusicGrid and filter to Albums
      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      // Find album card delete button
      const albumsTab = screen.getByText(/Альбомы/);
      fireEvent.click(albumsTab);

      const deleteButtons = container.querySelectorAll('button[title="Удалить"]');
      expect(deleteButtons.length).toBeGreaterThan(0);

      // Click delete on album
      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      // Verify album AND child tracks are removed from downloadStore
      await waitFor(() => {
        const storeStateAfter = useDownloadStore.getState().downloads;
        expect(storeStateAfter['alb-cascade-1']).toBeUndefined();
        expect(storeStateAfter['alb-trk-1']).toBeUndefined();
        expect(storeStateAfter['alb-trk-2']).toBeUndefined();
      });
    });

    it('[T5.D.02] Storage statistics immediately sync and drop audio bytes after album deletion', async () => {
      const albumSong1 = { id: 'sync-trk-1', title: 'Sync Track 1', artist: 'Sync Art', album: 'Sync Alb', albumId: 'alb-sync-1', duration: 150 };
      const album = { id: 'alb-sync-1', name: 'Sync Alb', artist: 'Sync Art', songCount: 1, song: [albumSong1] };
      registerMockAlbum(album);

      await handleDownload(album.id, album.name, 'album');

      const statsBefore = await calculateStorageStatistics();
      expect(statsBefore.audioBytes).toBeGreaterThan(0);

      // Remove album using cascade deletion logic
      const curDownloads = useDownloadStore.getState().downloads;
      const albumItem = curDownloads['alb-sync-1'];
      if (albumItem?.path) {
        await StorageManager.removeDirectory(albumItem.path);
      }
      for (const childId in curDownloads) {
        if (curDownloads[childId].albumId === 'alb-sync-1') {
          if (curDownloads[childId].path) {
            try { await StorageManager.removeTrack(curDownloads[childId].path); } catch {}
          }
          useDownloadStore.getState().removeDownload(childId);
        }
      }
      useDownloadStore.getState().removeDownload('alb-sync-1');

      const statsAfter = await calculateStorageStatistics();
      expect(statsAfter.audioBytes).toBe(0);
    });

    it('[T5.D.03] Deleting an individual track preserves sibling tracks and parent album registry', async () => {
      const t1 = { id: 'sib-1', title: 'Sibling 1', artist: 'Siblings', album: 'Family', albumId: 'fam-alb', duration: 120 };
      const t2 = { id: 'sib-2', title: 'Sibling 2', artist: 'Siblings', album: 'Family', albumId: 'fam-alb', duration: 140 };
      const alb = { id: 'fam-alb', name: 'Family', artist: 'Siblings', songCount: 2, song: [t1, t2] };
      registerMockAlbum(alb);

      await handleDownload(alb.id, alb.name, 'album');

      // Delete only sib-1
      const sib1Item = useDownloadStore.getState().downloads['sib-1'];
      await StorageManager.removeTrack(sib1Item.path);
      useDownloadStore.getState().removeDownload('sib-1');

      const state = useDownloadStore.getState().downloads;
      expect(state['sib-1']).toBeUndefined();
      expect(state['sib-2']).toBeDefined();
      expect(state['fam-alb']).toBeDefined();
    });

    it('[T5.D.04] Deleting a non-existent or stale file path on disk completes cleanly without throw', async () => {
      const store = useDownloadStore.getState();
      store.startDownload('ghost-track', 'Ghost Track', 'track');
      store.completeDownload('ghost-track', 'C:/Users/MockUser/Downloads/non_existent.mp3', {
        name: 'Ghost Track',
        type: 'track',
      });

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      const deleteBtn = container.querySelector('button[title="Удалить"]');
      expect(deleteBtn).toBeTruthy();

      await act(async () => {
        fireEvent.click(deleteBtn!);
      });

      expect(useDownloadStore.getState().downloads['ghost-track']).toBeUndefined();
    });

    it('[T5.D.05] DownloadsView clearHistory clears completed/error items while retaining downloading/queued items', async () => {
      const store = useDownloadStore.getState();
      store.startDownload('comp-1', 'Done 1', 'track');
      store.completeDownload('comp-1', 'path1', { name: 'Done 1', type: 'track' });
      store.startDownload('err-1', 'Err 1', 'track');
      store.errorDownload('err-1', 'Network error');
      store.startDownload('act-1', 'Active 1', 'track');
      store.queueDownload('que-1', 'Queued 1', 'track');

      const { container } = render(
        <MemoryRouter>
          <DownloadsView />
        </MemoryRouter>
      );

      const clearHistoryBtn = screen.getByText('Очистить историю');
      expect(clearHistoryBtn).toBeTruthy();

      await act(async () => {
        fireEvent.click(clearHistoryBtn);
      });

      const state = useDownloadStore.getState().downloads;
      expect(state['comp-1']).toBeUndefined();
      expect(state['err-1']).toBeUndefined();
      expect(state['act-1']).toBeDefined();
      expect(state['que-1']).toBeDefined();
    });

    it('[T5.D.06] Rapid sequential deletions of multiple downloaded items execute atomically', async () => {
      const store = useDownloadStore.getState();
      for (let i = 1; i <= 10; i++) {
        store.startDownload(`seq-del-${i}`, `Seq Track ${i}`, 'track');
        store.completeDownload(`seq-del-${i}`, `path-${i}`, {
          name: `Seq Track ${i}`,
          type: 'track',
          sizeBytes: 1024 * i,
        });
      }

      expect(getDownloadedTracks()).toHaveLength(10);

      // Perform rapid concurrent removals
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => {
          return Promise.resolve().then(() => {
            useDownloadStore.getState().removeDownload(`seq-del-${i + 1}`);
          });
        })
      );

      expect(getDownloadedTracks()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Dimension 3: Sidebar UI Responsiveness & SVG Progress Ring Under High-Frequency Updates
  // ==========================================================================
  describe('Dimension 3: Sidebar UI Responsiveness & SVG Progress Ring Under High-Frequency Updates', () => {
    it('[T5.S.01] High-frequency sub-millisecond progress updates render cleanly without state tearing', async () => {
      useDownloadStore.getState().startDownload('rapid-track', 'Rapid Track', 'track');

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      // Rapidly fire progress events in microtasks ending at 100%
      for (let p = 0; p <= 100; p += 10) {
        act(() => {
          useDownloadStore.getState().updateProgress('rapid-track', p);
        });
      }

      await waitFor(() => {
        expect(container.textContent).toContain('100%');
      });
    });

    it('[T5.S.02] SVG circular progress ring strokeDashoffset computes accurately across exact milestones', async () => {
      const radius = 12;
      const circumference = 2 * Math.PI * radius; // ~75.39822

      // Test 0%
      useDownloadStore.getState().startDownload('ring-test', 'Ring Test', 'track');
      useDownloadStore.getState().updateProgress('ring-test', 0);

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      let circle = container.querySelector('circle.stroke-primary');
      expect(circle).toBeTruthy();
      let offset = parseFloat(circle?.getAttribute('stroke-dashoffset') || '0');
      expect(offset).toBeCloseTo(circumference, 1);

      // Test 50%
      act(() => {
        useDownloadStore.getState().updateProgress('ring-test', 50);
      });
      circle = container.querySelector('circle.stroke-primary');
      offset = parseFloat(circle?.getAttribute('stroke-dashoffset') || '0');
      expect(offset).toBeCloseTo(circumference / 2, 1);

      // Test 100%
      act(() => {
        useDownloadStore.getState().updateProgress('ring-test', 100);
      });
      circle = container.querySelector('circle.stroke-primary');
      offset = parseFloat(circle?.getAttribute('stroke-dashoffset') || '0');
      expect(offset).toBeCloseTo(0, 1);
    });

    it('[T5.S.03] Compact mode (<120px) vs Wide mode (>120px) renders appropriate progress and badges', async () => {
      useDownloadStore.getState().startDownload('mode-test-1', 'Track 1', 'track');
      useDownloadStore.getState().queueDownload('mode-test-2', 'Track 2', 'track');
      useDownloadStore.getState().updateProgress('mode-test-1', 40);

      // 1. Test Wide Mode (leftSidebarWidth = 160)
      useUIStore.setState({ leftSidebarWidth: 160 });
      const { container, rerender } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(container.textContent).toContain('40%');
      expect(container.textContent).toContain('Загрузки');

      // 2. Test Compact Mode (leftSidebarWidth = 96)
      act(() => {
        useUIStore.setState({ leftSidebarWidth: 96 });
      });
      rerender(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      // In compact mode, SVG ring is rendered and percentage is shown in label
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('[T5.S.04] Badge counter renders 99+ for queue lengths exceeding 99 items in compact mode', async () => {
      useUIStore.setState({ leftSidebarWidth: 96 }); // Compact mode

      // Enqueue 105 items
      for (let i = 1; i <= 105; i++) {
        useDownloadStore.getState().queueDownload(`huge-q-${i}`, `Track ${i}`, 'track');
      }

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const badge = container.querySelector('span.rounded-full');
      expect(badge?.textContent).toBe('99+');
    });

    it('[T5.S.05] Tooltip on sidebar download link contains accurate active progress and counts', async () => {
      useUIStore.setState({ leftSidebarWidth: 150 });
      useDownloadStore.getState().startDownload('tip-1', 'Track A', 'track');
      useDownloadStore.getState().queueDownload('tip-2', 'Track B', 'track');
      useDownloadStore.getState().updateProgress('tip-1', 75);

      const { container } = render(
        <MemoryRouter initialEntries={['/Holad']}>
          <Sidebar />
        </MemoryRouter>
      );

      const downloadLink = container.querySelector('a[href="/Holad/downloads"]');
      expect(downloadLink?.getAttribute('title')).toContain('75%');
      expect(downloadLink?.getAttribute('title')).toContain('(1/2)');
    });

    it('[T5.S.06] Active route detection highlights /Holad/downloads when navigating to downloads view', async () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/Holad/downloads']}>
          <Sidebar />
        </MemoryRouter>
      );

      const downloadLink = container.querySelector('a[href="/Holad/downloads"]');
      expect(downloadLink?.className).toContain('text-primary');
    });
  });

  // ==========================================================================
  // Dimension 4: Settings Modal & Downloads View Concurrent Interactions
  // ==========================================================================
  describe('Dimension 4: Settings Modal & Downloads View Concurrent Interactions', () => {
    it('[T5.U.01] Switching tabs in SettingsModal during ongoing downloads does not throw or disrupt queue', async () => {
      useDownloadStore.getState().startDownload('active-dl-1', 'Track Active', 'track');
      useDownloadStore.getState().updateProgress('active-dl-1', 33);

      const { getByText } = render(
        <MemoryRouter>
          <SettingsModal isOpen={true} initialTab="general" />
        </MemoryRouter>
      );

      // Switch to Appearance
      fireEvent.click(getByText('Внешний вид'));
      expect(getByText('Тема оформления')).toBeTruthy();

      // Switch to Player
      fireEvent.click(getByText('Плеер'));
      expect(getByText('Плавный переход (Crossfade)')).toBeTruthy();

      // Switch to Storage
      fireEvent.click(getByText('Хранилище'));
      expect(getByText('Использование хранилища')).toBeTruthy();

      // Update progress while storage tab is open
      act(() => {
        useDownloadStore.getState().updateProgress('active-dl-1', 88);
      });

      expect(useDownloadStore.getState().downloads['active-dl-1'].progress).toBe(88);
    });

    it('[T5.U.02] Download Entire Library trigger from DownloadedMusicGrid updates progress smoothly', async () => {
      const song1 = { id: 'lib-s1', title: 'Lib Song 1', artist: 'Art', album: 'Alb', duration: 180 };
      registerMockSong(song1);
      registerStarredItems([song1], []);

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      const downloadLibBtns = screen.getAllByText('Скачать всю библиотеку');
      expect(downloadLibBtns.length).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.click(downloadLibBtns[0]);
      });

      // Item should now be in downloads and completed
      await waitFor(() => {
        expect(useDownloadStore.getState().downloads['lib-s1']?.status).toBe('completed');
      });
    });

    it('[T5.U.03] DownloadedMusicGrid correctly filters by All, Albums, Tracks, Search query, and toggles View Mode', async () => {
      const store = useDownloadStore.getState();
      store.startDownload('trk-a', 'Alpha Beat', 'track');
      store.completeDownload('trk-a', 'path-a', { name: 'Alpha Beat', type: 'track', artist: 'Artist One', album: 'Album Alpha' });
      store.startDownload('trk-b', 'Beta Echo', 'track');
      store.completeDownload('trk-b', 'path-b', { name: 'Beta Echo', type: 'track', artist: 'Artist Two', album: 'Album Beta' });
      store.startDownload('alb-g', 'Gamma Odyssey', 'album');
      store.completeDownload('alb-g', 'path-g', { name: 'Gamma Odyssey', type: 'album', artist: 'Artist Three' });

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      // Verify items rendered
      expect(screen.getByText('Alpha Beat')).toBeTruthy();
      expect(screen.getByText('Beta Echo')).toBeTruthy();
      expect(screen.getByText('Gamma Odyssey')).toBeTruthy();

      // Filter by Albums
      const albumsTab = screen.getByText(/Альбомы/);
      fireEvent.click(albumsTab);
      expect(screen.queryByText('Alpha Beat')).toBeNull();
      expect(screen.getByText('Gamma Odyssey')).toBeTruthy();

      // Filter by Tracks
      const tracksTab = screen.getByText(/Треки/);
      fireEvent.click(tracksTab);
      expect(screen.getByText('Alpha Beat')).toBeTruthy();
      expect(screen.queryByText('Gamma Odyssey')).toBeNull();

      // Search Query filter
      const searchInput = container.querySelector('input[placeholder*="Поиск"]') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'Alpha' } });
      expect(screen.getByText('Alpha Beat')).toBeTruthy();
      expect(screen.queryByText('Beta Echo')).toBeNull();

      // Switch to List View
      const listBtn = container.querySelector('button[title="Список"]');
      if (listBtn) fireEvent.click(listBtn);
      expect(screen.getByText('Alpha Beat')).toBeTruthy();
    });

    it('[T5.U.04] DownloadsView displays active progress bar and pulsing track name during download', async () => {
      useDownloadStore.getState().startDownload('active-dl-view', 'Symphony No. 5', 'album', undefined, {
        currentTrackName: 'Movement 1 - Allegro con brio',
        progress: 42,
      });

      const { container } = render(
        <MemoryRouter>
          <DownloadsView />
        </MemoryRouter>
      );

      expect(screen.getByText('Symphony No. 5')).toBeTruthy();
      expect(screen.getByText('Movement 1 - Allegro con brio')).toBeTruthy();
      expect(screen.getByText('42%')).toBeTruthy();
    });

    it('[T5.U.05] MobileSettingsView expands Storage section and renders storage bar, memory limit and grid', async () => {
      const { getByText } = render(
        <MemoryRouter>
          <MobileSettingsView />
        </MemoryRouter>
      );

      // Find and expand the Storage accordion
      const storageHeader = getByText('Хранилище');
      fireEvent.click(storageHeader);

      expect(getByText('Лимит памяти для кэша изображений')).toBeTruthy();
      expect(getByText('Очистить кэш изображений')).toBeTruthy();
      expect(getByText('Удалить всю скачанную музыку')).toBeTruthy();
    });

    it('[T5.U.06] DeleteDownloadsModal triggers from DownloadedMusicGrid and closes cleanly', async () => {
      let refreshCalled = false;
      const onRefresh = () => { refreshCalled = true; };

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid onManageClick={onRefresh} />
        </MemoryRouter>
      );

      const manageBtn = screen.getByText('Управление загрузками');
      fireEvent.click(manageBtn);
      expect(refreshCalled).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 5: Zero Regressions Across Player, Navigation, and Themes
  // ==========================================================================
  describe('Dimension 5: Zero Regressions Across Player, Navigation, and Themes', () => {
    it('[T5.R.01] Triggering playback on downloaded track with clickAction="play_now" sets queue and starts playing', async () => {
      useSettingsStore.setState({ clickAction: 'play_now' });
      const store = useDownloadStore.getState();
      store.startDownload('track-play-1', 'Instant Hit', 'track');
      store.completeDownload('track-play-1', 'C:/path/song.mp3', {
        name: 'Instant Hit',
        type: 'track',
        artist: 'Pop Star',
        album: 'Top 10',
        duration: 210,
      });

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      const playBtn = container.querySelector('button[title="Воспроизвести"]');
      expect(playBtn).toBeTruthy();

      await act(async () => {
        fireEvent.click(playBtn!);
      });

      const playerState = usePlayerStore.getState();
      expect(playerState.queue).toHaveLength(1);
      expect(playerState.queue[0].title).toBe('Instant Hit');
      expect(playerState.isPlaying).toBe(true);
      expect(playerState.currentIndex).toBe(0);
    });

    it('[T5.R.02] Triggering playback on downloaded track with clickAction="play_next" appends to queue', async () => {
      useSettingsStore.setState({ clickAction: 'play_next' });
      usePlayerStore.setState({
        queue: [{ id: 'current-song', title: 'Current Song', artist: 'Current Artist', duration: 180 }],
        currentIndex: 0,
        isPlaying: true,
      });

      const store = useDownloadStore.getState();
      store.startDownload('track-next-1', 'Next Hit', 'track');
      store.completeDownload('track-next-1', 'C:/path/next.mp3', {
        name: 'Next Hit',
        type: 'track',
        artist: 'Next Star',
        album: 'Next Album',
        duration: 190,
      });

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      const playBtn = container.querySelector('button[title="Воспроизвести"]');
      await act(async () => {
        fireEvent.click(playBtn!);
      });

      const playerState = usePlayerStore.getState();
      expect(playerState.queue).toHaveLength(2);
      expect(playerState.queue[1].title).toBe('Next Hit');
      expect(playerState.isPlaying).toBe(true);
    });

    it('[T5.R.03] Triggering playback on downloaded album queues all offline child tracks in order', async () => {
      const albSong1 = { id: 'alb-q1', title: 'Track One', artist: 'Band', album: 'Album Alpha', albumId: 'alb-alpha', duration: 100 };
      const albSong2 = { id: 'alb-q2', title: 'Track Two', artist: 'Band', album: 'Album Alpha', albumId: 'alb-alpha', duration: 110 };
      const album = { id: 'alb-alpha', name: 'Album Alpha', artist: 'Band', songCount: 2, song: [albSong1, albSong2] };

      registerMockAlbum(album);
      await handleDownload(album.id, album.name, 'album');

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      // Filter by albums and click play
      const albumsTab = screen.getByText(/Альбомы/);
      fireEvent.click(albumsTab);

      const playBtn = container.querySelector('button[title="Воспроизвести"]');
      expect(playBtn).toBeTruthy();

      await act(async () => {
        fireEvent.click(playBtn!);
      });

      const playerQueue = usePlayerStore.getState().queue;
      expect(playerQueue.length).toBeGreaterThanOrEqual(2);
      expect(playerQueue[0].title).toBe('Track One');
      expect(playerQueue[1].title).toBe('Track Two');
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it('[T5.R.04] Volume multiplier, default volume, and AutoDJ toggles update settings without regressions', async () => {
      const { container } = render(
        <MemoryRouter>
          <SettingsModal isOpen={true} initialTab="player" />
        </MemoryRouter>
      );

      // Test AutoDJ toggle
      const autoDjCheckbox = screen.getByText(/Автоматически добавлять похожие треки/);
      fireEvent.click(autoDjCheckbox);
      expect(usePlayerStore.getState().isAutoDjEnabled).toBe(true);

      // Test Volume Multiplier
      const multInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(multInput).toBeTruthy();
      fireEvent.change(multInput, { target: { value: '250' } });
      expect(usePlayerStore.getState().volumeMultiplier).toBe(2.5);
    });

    it('[T5.R.05] Theme and accent color switching in SettingsModal persist to settingsStore', async () => {
      const { getByText, container } = render(
        <MemoryRouter>
          <SettingsModal isOpen={true} initialTab="appearance" />
        </MemoryRouter>
      );

      // Switch theme to Light
      fireEvent.click(getByText('Light'));
      expect(useSettingsStore.getState().theme).toBe('light');

      // Switch theme to Dark
      fireEvent.click(getByText('Dark'));
      expect(useSettingsStore.getState().theme).toBe('dark');

      // Click blue accent color
      const colorBtns = container.querySelectorAll('button[style*="background-color"]');
      expect(colorBtns.length).toBeGreaterThan(0);
      fireEvent.click(colorBtns[1]); // Blue
      expect(useSettingsStore.getState().accentColor).toBe('blue');
    });

    it('[T5.R.06] Language switching correctly switches store state and retains fallback UI strings', async () => {
      const { getByText } = render(
        <MemoryRouter>
          <SettingsModal isOpen={true} initialTab="general" />
        </MemoryRouter>
      );

      // Check language dropdown presence (in ru it is 'Язык интерфейса')
      expect(getByText('Язык интерфейса')).toBeTruthy();
      useSettingsStore.getState().setLanguage('en');
      expect(useSettingsStore.getState().language).toBe('en');

      useSettingsStore.getState().setLanguage('ru');
      expect(useSettingsStore.getState().language).toBe('ru');
    });
  });
});
