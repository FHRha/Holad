import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  vfs,
  mockState,
  resetE2EHarness,
  setPlatform,
  registerMockSong,
  registerMockAlbum,
  setSimulatedNetworkFailure,
} from '../e2e/harness';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useLongPress } from '../../hooks/useLongPress';
import ContextMenu from '../../components/common/ContextMenu';
import { useDownloadStore } from '../../store/downloadStore';
import { handleDownload, cancelActiveDownload } from '../../utils/downloadHelper';
import { StorageManager } from '../../utils/StorageManager';

describe('CHALLENGER 1 EMPIRICAL STRESS SUITE: Milestone 1 (Context Menu & Downloads)', () => {
  beforeEach(() => {
    resetE2EHarness();
    useContextMenuStore.setState({
      isOpen: false,
      x: 0,
      y: 0,
      item: null,
      type: 'track',
    });
    useDownloadStore.setState({
      downloads: {},
      isDownloading: false,
      activeDownloadsCount: 0,
    });
  });

  afterEach(() => {
    resetE2EHarness();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. Extreme Coordinates & Position Fuzzing Generator
  // ============================================================================
  describe('1. Extreme Coordinates & Generator Fuzzing', () => {
    it('[STRESS-1.1] Fuzz test: contextMenuStore sanitizes 100 adversarial coordinate inputs', () => {
      const { openMenu } = useContextMenuStore.getState();
      const mockItem = { id: 'fuzz-track', title: 'Fuzz Track', artist: 'Fuzz Artist' };

      const adversarialInputs = [
        // Negatives & zero
        [-1, -1],
        [-999999, -888888],
        [-0.000001, -0.999999],
        [0, 0],
        // Extreme positives & decimals
        [99999999, 88888888],
        [123.456789, 987.654321],
        // Non-finite numbers
        [NaN, NaN],
        [Infinity, Infinity],
        [-Infinity, -Infinity],
        [NaN, 500],
        [500, NaN],
        // Undefined & null & wrong types
        [undefined as any, undefined as any],
        [null as any, null as any],
        ['100' as any, '200' as any],
        [{} as any, [] as any],
        [(() => 42) as any, true as any],
      ];

      // Generate additional random adversarial values
      for (let i = 0; i < 80; i++) {
        const randType = i % 5;
        let xVal: any, yVal: any;
        if (randType === 0) {
          xVal = (Math.random() - 0.5) * 1e8;
          yVal = (Math.random() - 0.5) * 1e8;
        } else if (randType === 1) {
          xVal = Math.random() < 0.5 ? NaN : undefined;
          yVal = Math.random() < 0.5 ? NaN : null;
        } else if (randType === 2) {
          xVal = Math.random() < 0.5 ? Infinity : -Infinity;
          yVal = Math.random() < 0.5 ? Infinity : -Infinity;
        } else if (randType === 3) {
          xVal = `str_${Math.random()}`;
          yVal = { nested: Math.random() };
        } else {
          xVal = Math.floor(Math.random() * 2000);
          yVal = Math.floor(Math.random() * 2000);
        }
        adversarialInputs.push([xVal, yVal]);
      }

      for (const [rawX, rawY] of adversarialInputs) {
        act(() => {
          openMenu(rawX, rawY, mockItem, 'track');
        });

        const state = useContextMenuStore.getState();
        expect(state.isOpen).toBe(true);
        expect(typeof state.x).toBe('number');
        expect(typeof state.y).toBe('number');
        expect(Number.isNaN(state.x)).toBe(false);
        expect(Number.isNaN(state.y)).toBe(false);
      }
    });

    it('[STRESS-1.2] Desktop ContextMenu boundary clamping under extreme viewport coordinates', () => {
      // Simulate Desktop viewport (1920x1080)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1920 });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 1080 });

      const testCases = [
        {
          desc: 'Massive negative coordinates clamped to margin 8',
          inputX: -99999,
          inputY: -99999,
          expectedLeft: 8,
          expectedTop: 8,
          expectedTransform: 'none',
        },
        {
          desc: 'Massive positive coordinates clamped to winWidth - 230 and winHeight - 50',
          inputX: 999999,
          inputY: 999999,
          expectedLeft: 1920 - 230,
          expectedTop: 1080 - 50,
          expectedTransform: 'translateY(-100%)',
        },
        {
          desc: 'Top-Right corner clamped properly',
          inputX: 1915,
          inputY: 10,
          expectedLeft: 1920 - 230,
          expectedTop: 10,
          expectedTransform: 'none',
        },
        {
          desc: 'Bottom-Left corner clamped with upward transform',
          inputX: 5,
          inputY: 1075,
          expectedLeft: 8,
          expectedTop: 1080 - 50,
          expectedTransform: 'translateY(-100%)',
        },
      ];

      for (const tc of testCases) {
        act(() => {
          useContextMenuStore.getState().openMenu(tc.inputX, tc.inputY, { id: 'c-1', title: 'Clamp Track' }, 'track');
        });

        const { unmount } = render(
          <MemoryRouter>
            <ContextMenu />
          </MemoryRouter>
        );

        const menuEl = document.querySelector('.fixed.z-\\[9999\\]') as HTMLElement;
        expect(menuEl).toBeTruthy();
        expect(menuEl.style.left).toBe(`${tc.expectedLeft}px`);
        expect(menuEl.style.top).toBe(`${tc.expectedTop}px`);
        expect(menuEl.style.transform).toBe(tc.expectedTransform);

        unmount();
      }
    });

    it('[STRESS-1.3] Mobile ContextMenu opens as bottom sheet regardless of extreme coordinates', () => {
      // Simulate Mobile viewport (375x667)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 667 });

      act(() => {
        // Dispatch with offscreen coordinates
        useContextMenuStore.getState().openMenu(-9999, 99999, { id: 'mob-1', title: 'Mobile Track', artist: 'Mobile Artist' }, 'track');
      });

      render(
        <MemoryRouter>
          <ContextMenu />
        </MemoryRouter>
      );

      // On mobile, the bottom sheet modal with rounded-t-3xl is rendered
      const bottomSheet = document.querySelector('.rounded-t-3xl');
      expect(bottomSheet).toBeTruthy();
      expect(screen.getByText('Mobile Track')).toBeTruthy();
      expect(screen.getByText('Mobile Artist')).toBeTruthy();
    });
  });

  // ============================================================================
  // 2. Long Press Touch Gestures & Multi-touch Stress
  // ============================================================================
  describe('2. Long Press Touch Gestures & Multi-Touch Stress', () => {
    function LongPressHarness({ onLongPress, onClick }: { onLongPress: (e: any) => void; onClick: (e: any) => void }) {
      const handlers = useLongPress(onLongPress, onClick, { delay: 300, shouldPreventDefault: true });
      return <div data-testid="gesture-box" {...handlers}>Long Press Harness</div>;
    }

    it('[STRESS-2.1] Multi-touch gestures (touches.length > 1) do not trigger long-press or break gestures', () => {
      vi.useFakeTimers();
      const onLongPress = vi.fn();
      const onClick = vi.fn();

      render(<LongPressHarness onLongPress={onLongPress} onClick={onClick} />);
      const box = screen.getByTestId('gesture-box');

      // Simulate multi-touch pinch start (2 fingers)
      const touch1 = { clientX: 100, clientY: 100 };
      const touch2 = { clientX: 250, clientY: 250 };
      fireEvent.touchStart(box, {
        touches: [touch1, touch2],
        target: box,
      });

      // Pinch zoom movement
      fireEvent.touchMove(box, {
        touches: [
          { clientX: 80, clientY: 80 },
          { clientX: 280, clientY: 280 },
        ],
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Long press must NOT trigger during pinch
      expect(onLongPress).not.toHaveBeenCalled();

      // Release touches
      fireEvent.touchEnd(box, {
        touches: [],
        changedTouches: [touch1, touch2],
      });

      // Click must also be suppressed because move occurred
      expect(onClick).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('[STRESS-2.2] Touch cancel immediately terminates timer without triggering long press or click', () => {
      vi.useFakeTimers();
      const onLongPress = vi.fn();
      const onClick = vi.fn();

      render(<LongPressHarness onLongPress={onLongPress} onClick={onClick} />);
      const box = screen.getByTestId('gesture-box');

      fireEvent.touchStart(box, {
        touches: [{ clientX: 200, clientY: 300 }],
        target: box,
      });

      // Advance halfway
      act(() => {
        vi.advanceTimersByTime(150);
      });

      // Touch cancelled (e.g. system notification or gesture takeover)
      fireEvent.touchCancel(box, {
        touches: [],
      });

      // Advance past threshold
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(onLongPress).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('[STRESS-2.3] Fast scrolling gesture aborts long-press timer and prevents accidental clicks', () => {
      vi.useFakeTimers();
      const onLongPress = vi.fn();
      const onClick = vi.fn();

      render(<LongPressHarness onLongPress={onLongPress} onClick={onClick} />);
      const box = screen.getByTestId('gesture-box');

      // Tap start
      fireEvent.touchStart(box, {
        touches: [{ clientX: 150, clientY: 300 }],
        target: box,
      });

      // Rapid scroll down
      fireEvent.touchMove(box, {
        touches: [{ clientX: 150, clientY: 450 }],
      });

      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(onLongPress).not.toHaveBeenCalled();

      fireEvent.touchEnd(box, {
        touches: [],
      });

      expect(onClick).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('[STRESS-2.4] Rapid successive taps trigger onClick without triggering onLongPress', () => {
      vi.useFakeTimers();
      const onLongPress = vi.fn();
      const onClick = vi.fn();

      render(<LongPressHarness onLongPress={onLongPress} onClick={onClick} />);
      const box = screen.getByTestId('gesture-box');

      // 5 rapid taps (50ms each)
      for (let i = 0; i < 5; i++) {
        fireEvent.touchStart(box, {
          touches: [{ clientX: 100 + i, clientY: 100 + i }],
          target: box,
        });

        act(() => {
          vi.advanceTimersByTime(50);
        });

        fireEvent.touchEnd(box, {
          touches: [],
        });
      }

      expect(onLongPress).not.toHaveBeenCalled();
      expect(onClick).toHaveBeenCalledTimes(5);
      vi.useRealTimers();
    });

    it('[STRESS-2.5] Native desktop right-click event triggers onLongPress with exact event coordinates', () => {
      const onLongPress = vi.fn();
      const onClick = vi.fn();

      render(<LongPressHarness onLongPress={onLongPress} onClick={onClick} />);
      const box = screen.getByTestId('gesture-box');

      fireEvent.contextMenu(box, {
        clientX: 450,
        clientY: 320,
      });

      expect(onLongPress).toHaveBeenCalledTimes(1);
      const callArg = onLongPress.mock.calls[0][0];
      expect(callArg.clientX).toBe(450);
      expect(callArg.clientY).toBe(320);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 3. Corrupted Subsonic Responses & Album Download Robustness
  // ============================================================================
  describe('3. Corrupted Subsonic Responses & Album Download Robustness', () => {
    it('[STRESS-3.1] Album with missing "song" field (undefined) completes cleanly with totalTrackCount = 0', async () => {
      setPlatform('tauri');
      const albumId = 'alb-no-song';

      registerMockAlbum({
        id: albumId,
        name: 'Empty Song Album',
        title: 'Empty Song Album',
        artist: 'Test Artist',
        songCount: 0,
        song: [],
      });

      // Corrupt the mock to have undefined song
      const rawAlbum = mockState.albums.get(albumId)!;
      delete (rawAlbum as any).song;

      await handleDownload(albumId, 'Empty Song Album', 'album');

      const downloads = useDownloadStore.getState().downloads;
      expect(downloads[albumId]).toBeDefined();
      expect(downloads[albumId].status).toBe('completed');
      expect(downloads[albumId].totalTrackCount).toBe(0);
      expect(downloads[albumId].completedTrackCount).toBe(0);
    });

    it('[STRESS-3.2] Album with null "song" field completes cleanly without runtime errors', async () => {
      setPlatform('tauri');
      const albumId = 'alb-null-song';

      registerMockAlbum({
        id: albumId,
        name: 'Null Song Album',
        title: 'Null Song Album',
        artist: 'Test Artist',
        songCount: 0,
        song: [],
      });

      // Set song to null
      const rawAlbum = mockState.albums.get(albumId)!;
      (rawAlbum as any).song = null;

      await handleDownload(albumId, 'Null Song Album', 'album');

      const downloads = useDownloadStore.getState().downloads;
      expect(downloads[albumId]).toBeDefined();
      expect(downloads[albumId].status).toBe('completed');
      expect(downloads[albumId].totalTrackCount).toBe(0);
    });

    it('[STRESS-3.3] Album with empty song array [] completes cleanly', async () => {
      setPlatform('tauri');
      const albumId = 'alb-empty-array';

      registerMockAlbum({
        id: albumId,
        name: 'Empty Array Album',
        title: 'Empty Array Album',
        artist: 'Test Artist',
        songCount: 0,
        song: [],
      });

      await handleDownload(albumId, 'Empty Array Album', 'album');

      const downloads = useDownloadStore.getState().downloads;
      expect(downloads[albumId]).toBeDefined();
      expect(downloads[albumId].status).toBe('completed');
      expect(downloads[albumId].totalTrackCount).toBe(0);
    });

    it('[STRESS-3.4] Album with single-song object missing optional metadata fields downloads safely', async () => {
      setPlatform('tauri');
      const albumId = 'alb-sparse-song';
      const songId = 'sparse-track-1';

      registerMockSong({
        id: songId,
        title: 'Sparse Track',
        artist: 'Sparse Artist',
        album: 'Sparse Album',
        albumId: albumId,
        duration: 120,
      });

      registerMockAlbum({
        id: albumId,
        name: 'Sparse Album',
        title: 'Sparse Album',
        artist: 'Sparse Artist',
        songCount: 1,
        song: [],
      });

      // Song object without duration, artist, or coverArt
      const rawAlbum = mockState.albums.get(albumId)!;
      (rawAlbum as any).song = {
        id: songId,
        title: 'Sparse Track',
      };

      await handleDownload(albumId, 'Sparse Album', 'album');

      const downloads = useDownloadStore.getState().downloads;
      expect(downloads[albumId]).toBeDefined();
      expect(downloads[albumId].status).toBe('completed');
      expect(downloads[albumId].totalTrackCount).toBe(1);
      expect(downloads[albumId].completedTrackCount).toBe(1);

      const childTrack = downloads[songId];
      expect(childTrack).toBeDefined();
      expect(childTrack.status).toBe('completed');
    });

    it('[STRESS-3.5] Multi-track album handles individual track failures without crashing the entire batch', async () => {
      setPlatform('tauri');
      const albumId = 'alb-partial-fail';
      const song1Id = 'track-ok-1';
      const song2Id = 'track-fail-2';
      const song3Id = 'track-ok-3';

      registerMockSong({ id: song1Id, title: 'Good Track 1', artist: 'Artist', album: 'Alb', albumId, duration: 100 });
      registerMockSong({ id: song2Id, title: 'Failing Track 2', artist: 'Artist', album: 'Alb', albumId, duration: 100 });
      registerMockSong({ id: song3Id, title: 'Good Track 3', artist: 'Artist', album: 'Alb', albumId, duration: 100 });

      registerMockAlbum({
        id: albumId,
        name: 'Partial Fail Album',
        title: 'Partial Fail Album',
        artist: 'Artist',
        songCount: 3,
        song: [
          { id: song1Id, title: 'Good Track 1', artist: 'Artist', album: 'Alb', albumId, duration: 100 },
          { id: song2Id, title: 'Failing Track 2', artist: 'Artist', album: 'Alb', albumId, duration: 100 },
          { id: song3Id, title: 'Good Track 3', artist: 'Artist', album: 'Alb', albumId, duration: 100 },
        ],
      });

      // Simulate failure on track-fail-2
      setSimulatedNetworkFailure(song2Id, true);

      await handleDownload(albumId, 'Partial Fail Album', 'album');

      const downloads = useDownloadStore.getState().downloads;
      expect(downloads[albumId]).toBeDefined();
      expect(downloads[albumId].status).toBe('completed');
      expect(downloads[albumId].totalTrackCount).toBe(3);
      expect(downloads[albumId].completedTrackCount).toBe(2);

      // Track 1 and Track 3 completed, Track 2 not completed
      expect(downloads[song1Id]?.status).toBe('completed');
      expect(downloads[song3Id]?.status).toBe('completed');
      expect(downloads[song2Id]).toBeUndefined();
    });

    it('[STRESS-3.6] Active album download cancellation properly stops downloads and sets cancelled status', async () => {
      setPlatform('tauri');
      const albumId = 'alb-to-cancel';

      registerMockAlbum({
        id: albumId,
        name: 'Cancelled Album',
        title: 'Cancelled Album',
        artist: 'Artist',
        songCount: 5,
        song: [
          { id: 'c-s1', title: 'Song 1', artist: 'Artist', album: 'Alb', albumId, duration: 100 },
          { id: 'c-s2', title: 'Song 2', artist: 'Artist', album: 'Alb', albumId, duration: 100 },
          { id: 'c-s3', title: 'Song 3', artist: 'Artist', album: 'Alb', albumId, duration: 100 },
        ],
      });

      const downloadPromise = handleDownload(albumId, 'Cancelled Album', 'album');
      cancelActiveDownload(albumId);

      await downloadPromise;

      const downloads = useDownloadStore.getState().downloads;
      expect(downloads[albumId]?.status).toBe('cancelled');
    });
  });

  // ============================================================================
  // 4. Cascade Deletion & Download Store Cleanup
  // ============================================================================
  describe('4. Cascade Deletion with Mixed Track States & Partial Queues', () => {
    it('[STRESS-4.1] Deleting album cascades cleanly across completed, queued, and downloading child tracks', async () => {
      const albumId = 'target-album-100';
      const otherAlbumId = 'unrelated-album-200';

      useDownloadStore.setState({
        downloads: {
          [albumId]: {
            id: albumId,
            type: 'album',
            status: 'completed',
            name: 'Target Album',
            artist: 'Target Artist',
            completedTrackCount: 2,
            totalTrackCount: 4,
            path: 'albums/Target Album',
          },
          'child-completed-1': {
            id: 'child-completed-1',
            albumId: albumId,
            type: 'track',
            status: 'completed',
            name: 'Completed Track 1',
            artist: 'Target Artist',
            path: 'albums/Target Album/Completed Track 1.mp3',
          },
          'child-completed-2': {
            id: 'child-completed-2',
            albumId: albumId,
            type: 'track',
            status: 'completed',
            name: 'Completed Track 2',
            artist: 'Target Artist',
            path: 'albums/Target Album/Completed Track 2.mp3',
          },
          'child-downloading-3': {
            id: 'child-downloading-3',
            albumId: albumId,
            type: 'track',
            status: 'downloading',
            name: 'Downloading Track 3',
            artist: 'Target Artist',
          },
          'child-queued-4': {
            id: 'child-queued-4',
            albumId: albumId,
            type: 'track',
            status: 'queued',
            name: 'Queued Track 4',
            artist: 'Target Artist',
          },
          // Unrelated tracks & album
          [otherAlbumId]: {
            id: otherAlbumId,
            type: 'album',
            status: 'completed',
            name: 'Unrelated Album',
            artist: 'Other Artist',
            completedTrackCount: 1,
            totalTrackCount: 1,
            path: 'albums/Unrelated Album',
          },
          'other-child-1': {
            id: 'other-child-1',
            albumId: otherAlbumId,
            type: 'track',
            status: 'completed',
            name: 'Other Child',
            artist: 'Other Artist',
            path: 'albums/Unrelated Album/Other Child.mp3',
          },
          'standalone-track-1': {
            id: 'standalone-track-1',
            type: 'track',
            status: 'completed',
            name: 'Standalone Track',
            artist: 'Solo Artist',
            path: 'tracks/Standalone Track.mp3',
          },
        },
      });

      const removeDownloadSpy = vi.spyOn(useDownloadStore.getState(), 'removeDownload');

      act(() => {
        useContextMenuStore.getState().openMenu(100, 100, { id: albumId, name: 'Target Album' }, 'album');
      });

      render(
        <MemoryRouter>
          <ContextMenu />
        </MemoryRouter>
      );

      const removeBtn = screen.getByText(/common\.remove_download|views\.delete_download|Удалить из загрузок|Удалить/i);
      expect(removeBtn).toBeTruthy();

      await act(async () => {
        fireEvent.click(removeBtn);
      });

      // Target album and all 4 child tracks deleted
      expect(removeDownloadSpy).toHaveBeenCalledWith(albumId);
      expect(removeDownloadSpy).toHaveBeenCalledWith('child-completed-1');
      expect(removeDownloadSpy).toHaveBeenCalledWith('child-completed-2');
      expect(removeDownloadSpy).toHaveBeenCalledWith('child-downloading-3');
      expect(removeDownloadSpy).toHaveBeenCalledWith('child-queued-4');

      // Unrelated items MUST NOT be deleted
      expect(removeDownloadSpy).not.toHaveBeenCalledWith(otherAlbumId);
      expect(removeDownloadSpy).not.toHaveBeenCalledWith('other-child-1');
      expect(removeDownloadSpy).not.toHaveBeenCalledWith('standalone-track-1');
    });

    it('[STRESS-4.2] Deleting a single track from context menu removes only that specific track', async () => {
      const trackId = 'target-single-track';
      const siblingTrackId = 'sibling-track';

      useDownloadStore.setState({
        downloads: {
          [trackId]: {
            id: trackId,
            type: 'track',
            status: 'completed',
            name: 'Target Track',
            artist: 'Artist',
            path: 'tracks/Target Track.mp3',
          },
          [siblingTrackId]: {
            id: siblingTrackId,
            type: 'track',
            status: 'completed',
            name: 'Sibling Track',
            artist: 'Artist',
            path: 'tracks/Sibling Track.mp3',
          },
        },
      });

      const removeDownloadSpy = vi.spyOn(useDownloadStore.getState(), 'removeDownload');

      act(() => {
        useContextMenuStore.getState().openMenu(100, 100, { id: trackId, name: 'Target Track' }, 'track');
      });

      render(
        <MemoryRouter>
          <ContextMenu />
        </MemoryRouter>
      );

      const removeBtn = screen.getByText(/common\.remove_download|views\.delete_download|Удалить из загрузок|Удалить/i);
      expect(removeBtn).toBeTruthy();

      await act(async () => {
        fireEvent.click(removeBtn);
      });

      expect(removeDownloadSpy).toHaveBeenCalledWith(trackId);
      expect(removeDownloadSpy).not.toHaveBeenCalledWith(siblingTrackId);
    });

    it('[STRESS-4.3] StorageManager disk deletion failure does not prevent downloadStore cleanup', async () => {
      const albumId = 'disk-fail-album';

      useDownloadStore.setState({
        downloads: {
          [albumId]: {
            id: albumId,
            type: 'album',
            status: 'completed',
            name: 'Disk Fail Album',
            artist: 'Artist',
            path: 'albums/Disk Fail Album',
          },
          'child-1': {
            id: 'child-1',
            albumId: albumId,
            type: 'track',
            status: 'completed',
            name: 'Child 1',
            artist: 'Artist',
          },
        },
      });

      // Mock StorageManager.removeDirectory to throw an error
      vi.spyOn(StorageManager, 'removeDirectory').mockRejectedValueOnce(new Error('Permission denied'));

      const removeDownloadSpy = vi.spyOn(useDownloadStore.getState(), 'removeDownload');

      act(() => {
        useContextMenuStore.getState().openMenu(100, 100, { id: albumId, name: 'Disk Fail Album' }, 'album');
      });

      render(
        <MemoryRouter>
          <ContextMenu />
        </MemoryRouter>
      );

      const removeBtn = screen.getByText(/common\.remove_download|views\.delete_download|Удалить из загрузок|Удалить/i);

      await act(async () => {
        fireEvent.click(removeBtn);
      });

      // Store cleanup still succeeds despite disk failure
      expect(removeDownloadSpy).toHaveBeenCalledWith(albumId);
      expect(removeDownloadSpy).toHaveBeenCalledWith('child-1');
    });
  });
});
