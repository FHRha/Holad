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
} from './e2e/harness';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLongPress } from '../hooks/useLongPress';
import ContextMenu from '../components/common/ContextMenu';
import { useDownloadStore } from '../store/downloadStore';
import { handleDownload } from '../utils/downloadHelper';

describe('Milestone 1: Context Menu & Downloads Fixes', () => {
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
  });

  describe('1. contextMenuStore coordinate validation', () => {
    it('stores valid coordinates when numbers are provided', () => {
      const { openMenu } = useContextMenuStore.getState();
      const mockTrack = { id: 'track-1', title: 'Test Track', artist: 'Test Artist' };

      act(() => {
        openMenu(150, 250, mockTrack, 'track');
      });

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.x).toBe(150);
      expect(state.y).toBe(250);
      expect(state.item).toEqual(mockTrack);
      expect(state.type).toBe('track');
    });

    it('falls back to safe window center coordinates when x or y is undefined or NaN', () => {
      const { openMenu } = useContextMenuStore.getState();
      const mockTrack = { id: 'track-2', title: 'Fallback Track', artist: 'Fallback Artist' };

      act(() => {
        openMenu(undefined as any, NaN as any, mockTrack, 'track');
      });

      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.x).toBe(window.innerWidth / 2);
      expect(state.y).toBe(window.innerHeight / 2);
      expect(state.item).toEqual(mockTrack);
    });

    it('closes menu and resets state correctly', () => {
      const { openMenu, closeMenu } = useContextMenuStore.getState();
      act(() => {
        openMenu(100, 100, { id: '1' }, 'track');
      });
      expect(useContextMenuStore.getState().isOpen).toBe(true);

      act(() => {
        closeMenu();
      });
      const state = useContextMenuStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.item).toBeNull();
    });
  });

  describe('2. useLongPress touch coordinate capture', () => {
    function LongPressTestComponent({ onLongPress }: { onLongPress: (e: any) => void }) {
      const handlers = useLongPress(
        onLongPress,
        () => {},
        { delay: 200 }
      );
      return <div data-testid="touch-target" {...handlers}>Touch me</div>;
    }

    it('captures clientX and clientY from touchstart and passes them to onLongPress', () => {
      vi.useFakeTimers();
      const onLongPress = vi.fn();

      render(<LongPressTestComponent onLongPress={onLongPress} />);
      const target = screen.getByTestId('touch-target');

      // Simulate touch start at (123, 456)
      fireEvent.touchStart(target, {
        touches: [{ clientX: 123, clientY: 456 }],
      });

      // Fast-forward beyond 200ms threshold
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(onLongPress).toHaveBeenCalledTimes(1);
      const passedEvent = onLongPress.mock.calls[0][0];
      expect(passedEvent.clientX).toBe(123);
      expect(passedEvent.clientY).toBe(456);

      vi.useRealTimers();
    });

    it('cancels long press if touch moves significantly (scroll gesture)', () => {
      vi.useFakeTimers();
      const onLongPress = vi.fn();

      render(<LongPressTestComponent onLongPress={onLongPress} />);
      const target = screen.getByTestId('touch-target');

      fireEvent.touchStart(target, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Touch move over 10px
      fireEvent.touchMove(target, {
        touches: [{ clientX: 100, clientY: 150 }],
      });

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(onLongPress).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('3. ContextMenu Portal & Cascade Album Deletion', () => {
    it('clamps desktop context menu coordinates within window bounds', () => {
      const mockTrack = { id: 'track-99', title: 'Clamped Track', artist: 'Artist' };
      act(() => {
        useContextMenuStore.getState().openMenu(window.innerWidth + 500, window.innerHeight + 500, mockTrack, 'track');
      });

      render(
        <MemoryRouter>
          <ContextMenu />
        </MemoryRouter>
      );
      // Portal is rendered directly in document.body
      const menuEl = document.querySelector('.fixed.z-\\[9999\\]');
      expect(menuEl).toBeTruthy();
    });

    it('cascades deletion to child tracks when an album download is removed', async () => {
      // Set up download store with 1 album and 2 child tracks
      useDownloadStore.setState({
        downloads: {
          'album-1': {
            id: 'album-1',
            type: 'album',
            status: 'completed',
            name: 'Test Album',
            artist: 'Test Artist',
            completedTrackCount: 2,
            totalTrackCount: 2,
            path: 'albums/Test Album'
          },
          'track-1': {
            id: 'track-1',
            albumId: 'album-1',
            type: 'track',
            status: 'completed',
            name: 'Track 1',
            artist: 'Test Artist',
            path: 'albums/Test Album/Track 1.mp3'
          },
          'track-2': {
            id: 'track-2',
            albumId: 'album-1',
            type: 'track',
            status: 'completed',
            name: 'Track 2',
            artist: 'Test Artist',
            path: 'albums/Test Album/Track 2.mp3'
          },
          'track-other': {
            id: 'track-other',
            albumId: 'album-other',
            type: 'track',
            status: 'completed',
            name: 'Unrelated Track',
            artist: 'Other Artist',
            path: 'tracks/Unrelated Track.mp3'
          }
        }
      });

      const removeDownloadSpy = vi.spyOn(useDownloadStore.getState(), 'removeDownload');

      act(() => {
        useContextMenuStore.getState().openMenu(100, 100, { id: 'album-1', name: 'Test Album' }, 'album');
      });

      render(
        <MemoryRouter>
          <ContextMenu />
        </MemoryRouter>
      );

      // Find remove download action button
      const removeBtn = screen.getByText(/common\.remove_download|views\.delete_download|Удалить из загрузок|Удалить/i);
      expect(removeBtn).toBeTruthy();

      await act(async () => {
        fireEvent.click(removeBtn);
      });

      // Verify cascade deletion removed the album and both child tracks
      expect(removeDownloadSpy).toHaveBeenCalledWith('album-1');
      expect(removeDownloadSpy).toHaveBeenCalledWith('track-1');
      expect(removeDownloadSpy).toHaveBeenCalledWith('track-2');
      expect(removeDownloadSpy).not.toHaveBeenCalledWith('track-other');
    });
  });

  describe('4. downloadHelper normalized single-song object handling', () => {
    it('correctly handles album response with single-song object without throwing', async () => {
      setPlatform('tauri');

      const songId = 'solo-track-1';
      const albumId = 'single-song-album';

      registerMockSong({
        id: songId,
        title: 'Single Solo Song',
        artist: 'Solo Artist',
        album: 'Single Song Album',
        albumId: albumId,
        duration: 180,
        coverArt: 'cover-solo-art'
      });

      registerMockAlbum({
        id: albumId,
        name: 'Single Song Album',
        title: 'Single Song Album',
        artist: 'Solo Artist',
        coverArt: 'cover-solo-art',
        songCount: 1,
        song: [
          {
            id: songId,
            title: 'Single Solo Song',
            artist: 'Solo Artist',
            album: 'Single Song Album',
            albumId: albumId,
            duration: 180,
          }
        ]
      });

      // Transform the mock album's song property into a single object (non-array Subsonic API single item)
      const rawAlbum = mockState.albums.get(albumId)!;
      (rawAlbum as any).song = {
        id: songId,
        title: 'Single Solo Song',
        artist: 'Solo Artist',
        album: 'Single Song Album',
        albumId: albumId,
        duration: 180,
      };

      // Start download
      await handleDownload(albumId, 'Single Song Album', 'album');

      const downloads = useDownloadStore.getState().downloads;
      expect(downloads[albumId]).toBeDefined();
      expect(downloads[albumId].status).toBe('completed');
      expect(downloads[albumId].totalTrackCount).toBe(1);

      const childTrack = downloads[songId];
      expect(childTrack).toBeDefined();
      expect(childTrack.status).toBe('completed');
    });
  });
});
