import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import BottomSheet from '../../components/common/BottomSheet';
import ContextMenu from '../../components/common/ContextMenu';
import { DesktopContextMenu } from '../../components/common/context-menu/DesktopContextMenu';
import { MobileContextMenuDrawer } from '../../components/common/context-menu/MobileContextMenuDrawer';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { usePlayerStore } from '../../store/playerStore';
import { usePlaylistStore } from '../../store/playlistStore';
import { useDownloadStore } from '../../store/downloadStore';
import * as subsonicApi from '../../api/subsonic';
import * as playlistsApi from '../../api/subsonic/playlists';
import * as downloadHelper from '../../utils/downloadHelper';

// Mock Subsonic API
vi.mock('../../api/subsonic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/subsonic')>();
  return {
    ...actual,
    getCoverArtUrl: (id: string) => `http://mock-server/cover?id=${id}`,
    getAlbum: vi.fn().mockResolvedValue([
      {
        id: 'mock-album-track-1',
        title: 'Mock Track 1',
        artist: 'Mock Artist',
        album: 'Mock Album',
        albumId: 'mock-album-1',
        duration: 180,
        coverArt: 'cover-1'
      }
    ]),
    starItem: vi.fn().mockResolvedValue({ status: 'ok' }),
    unstarItem: vi.fn().mockResolvedValue({ status: 'ok' }),
    setItemRating: vi.fn().mockResolvedValue({ status: 'ok' })
  };
});

// Mock Playlists API
vi.mock('../../api/subsonic/playlists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/subsonic/playlists')>();
  return {
    ...actual,
    getPlaylists: vi.fn().mockResolvedValue([
      { id: 'server-pl-1', name: 'Server Playlist 1', trackCount: 5, coverArt: 'pl-cover-1' }
    ]),
    createPlaylist: vi.fn().mockResolvedValue({ id: 'server-pl-new', name: 'New Server Pl' }),
    updatePlaylistTracks: vi.fn().mockResolvedValue({ status: 'ok' }),
    updatePlaylist: vi.fn().mockResolvedValue({ status: 'ok' }),
    deletePlaylist: vi.fn().mockResolvedValue({ status: 'ok' })
  };
});

// Mock Download Helper
vi.mock('../../utils/downloadHelper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/downloadHelper')>();
  return {
    ...actual,
    handleDownload: vi.fn(),
    deleteDownloadedItem: vi.fn().mockResolvedValue(undefined)
  };
});

describe('Stage 3 Refactoring: ContextMenu Decomposition & BottomSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useContextMenuStore.setState({
      isOpen: false,
      x: 0,
      y: 0,
      item: null,
      type: 'track'
    });
    usePlayerStore.setState({
      queue: [
        { id: 't-1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 200 }
      ],
      currentIndex: 0,
      isPlaying: false,
      likedTrackIds: [],
      likedAlbumIds: [],
      excludedTrackIds: [],
      excludedAlbumIds: [],
      excludedFingerprints: [],
      role: 'host',
      roomId: null
    });
    usePlaylistStore.setState({
      playlists: [
        { id: 'cp-1', name: 'Custom Playlist 1', description: '', trackIds: ['t-1'] }
      ]
    });
    useDownloadStore.setState({
      downloads: {},
      isDownloading: false,
      activeDownloadsCount: 0
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ========================================================
  // SUITE 1: Universal BottomSheet Component
  // ========================================================
  describe('1. BottomSheet Component', () => {
    it('returns null when isOpen is false', () => {
      const { container } = render(
        <BottomSheet isOpen={false} onClose={() => {}}>
          <div>Content Inside</div>
        </BottomSheet>
      );
      expect(container.firstChild).toBeNull();
      expect(screen.queryByText('Content Inside')).toBeNull();
    });

    it('renders header, handle pill, and children when isOpen is true', () => {
      render(
        <BottomSheet isOpen={true} onClose={() => {}} header={<div>Custom Header</div>}>
          <div>Sheet Children Content</div>
        </BottomSheet>
      );

      expect(screen.getByText('Custom Header')).toBeTruthy();
      expect(screen.getByText('Sheet Children Content')).toBeTruthy();
    });

    it('triggers onClose when clicking the backdrop', () => {
      const onCloseSpy = vi.fn();
      render(
        <BottomSheet isOpen={true} onClose={onCloseSpy}>
          <div>Inner Content</div>
        </BottomSheet>
      );

      const backdrop = document.querySelector('.bg-black\\/60');
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('triggers onClose when Escape key is pressed', () => {
      const onCloseSpy = vi.fn();
      render(
        <BottomSheet isOpen={true} onClose={onCloseSpy}>
          <div>Inner Content</div>
        </BottomSheet>
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('handles touch swipe down gesture: closes when swipe exceeds threshold', () => {
      const onCloseSpy = vi.fn();
      render(
        <BottomSheet isOpen={true} onClose={onCloseSpy} dragThreshold={50}>
          <div>Swipeable Content</div>
        </BottomSheet>
      );

      const handleArea = document.querySelector('.touch-none');
      expect(handleArea).toBeTruthy();

      // Start touch at y = 100
      fireEvent.touchStart(handleArea!, {
        touches: [{ clientY: 100 }]
      });

      // Move touch down to y = 180 (delta = 80 > threshold 50)
      fireEvent.touchMove(handleArea!, {
        touches: [{ clientY: 180 }]
      });

      // Release touch at y = 180
      fireEvent.touchEnd(handleArea!, {
        changedTouches: [{ clientY: 180 }]
      });

      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('handles touch swipe down gesture: does not close when swipe is below threshold', () => {
      const onCloseSpy = vi.fn();
      render(
        <BottomSheet isOpen={true} onClose={onCloseSpy} dragThreshold={80}>
          <div>Swipeable Content</div>
        </BottomSheet>
      );

      const handleArea = document.querySelector('.touch-none');
      expect(handleArea).toBeTruthy();

      // Start touch at y = 100
      fireEvent.touchStart(handleArea!, {
        touches: [{ clientY: 100 }]
      });

      // Move touch down to y = 140 (delta = 40 <= threshold 80)
      fireEvent.touchMove(handleArea!, {
        touches: [{ clientY: 140 }]
      });

      // Release touch at y = 140
      fireEvent.touchEnd(handleArea!, {
        changedTouches: [{ clientY: 140 }]
      });

      expect(onCloseSpy).not.toHaveBeenCalled();
    });

    it('handles pointer swipe down gesture for mouse swipe support', () => {
      const onCloseSpy = vi.fn();
      render(
        <BottomSheet isOpen={true} onClose={onCloseSpy} dragThreshold={60}>
          <div>Pointer Swipe Area</div>
        </BottomSheet>
      );

      const handleArea = document.querySelector('.touch-none');
      expect(handleArea).toBeTruthy();

      // Pointer down at y = 200
      fireEvent.pointerDown(handleArea!, {
        clientY: 200,
        button: 0,
        pointerType: 'mouse'
      });

      // Move pointer down to y = 290 (delta = 90 > threshold 60)
      fireEvent.pointerMove(handleArea!, {
        clientY: 290,
        pointerType: 'mouse'
      });

      // Release pointer at y = 290
      fireEvent.pointerUp(handleArea!, {
        clientY: 290,
        pointerType: 'mouse'
      });

      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================
  // SUITE 2: DesktopContextMenu
  // ========================================================
  describe('2. DesktopContextMenu Component', () => {
    it('renders desktop context menu for a track with title, artist and action buttons', async () => {
      useContextMenuStore.setState({
        isOpen: true,
        x: 250,
        y: 300,
        item: { id: 'track-test-1', title: 'Test Track', artist: 'Test Artist', album: 'Test Album' },
        type: 'track'
      });

      render(
        <MemoryRouter>
          <DesktopContextMenu />
        </MemoryRouter>
      );

      expect(screen.getByText('Test Track')).toBeTruthy();
      expect(screen.getByText('Test Artist')).toBeTruthy();

      // Verify core action buttons are present
      expect(screen.getByRole('button', { name: /play now|слушать сейчас/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /add to playlist|добавить в плейлист/i })).toBeTruthy();
    });

    it('calculates safe coordinates and boundary transform properly', () => {
      // Near bottom-right of a 1024x768 screen
      useContextMenuStore.setState({
        isOpen: true,
        x: 950,
        y: 700,
        item: { id: 't-safe', title: 'Safe Bounds Track', artist: 'Artist' },
        type: 'track'
      });

      render(
        <MemoryRouter>
          <DesktopContextMenu />
        </MemoryRouter>
      );

      const menuCard = document.querySelector('div.bg-card.border-border');
      expect(menuCard).toBeTruthy();
      const style = window.getComputedStyle(menuCard!);
      // Safe positioning: safeY > 768 / 2 -> translateY(-100%)
      expect(style.transform).toBe('translateY(-100%)');
    });

    it('handles rating click and fires rating-updated custom event', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      useContextMenuStore.setState({
        isOpen: true,
        x: 100,
        y: 100,
        item: { id: 'rate-track-1', title: 'Rating Song', artist: 'Rater', userRating: 0 },
        type: 'track'
      });

      render(
        <MemoryRouter>
          <DesktopContextMenu />
        </MemoryRouter>
      );

      const ratingStars = document.querySelectorAll('svg.lucide-star');
      // Rating stars: first one is the icon next to label, next 5 are 1-5 stars
      expect(ratingStars.length).toBeGreaterThanOrEqual(6);

      // Click star 4 (index 4)
      fireEvent.click(ratingStars[4]);

      expect(subsonicApi.setItemRating).toHaveBeenCalledWith('rate-track-1', 4);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rating-updated',
          detail: { id: 'rate-track-1', rating: 4 }
        })
      );
    });

    it('interacts with playlist submenu: expands list, inline create form, and back button', async () => {
      useContextMenuStore.setState({
        isOpen: true,
        x: 100,
        y: 100,
        item: { id: 'track-sub', title: 'Submenu Song', artist: 'Artist' },
        type: 'track'
      });

      render(
        <MemoryRouter>
          <DesktopContextMenu />
        </MemoryRouter>
      );

      const addToPlBtn = screen.getByRole('button', { name: /add to playlist|добавить в плейлист/i });
      await act(async () => {
        fireEvent.click(addToPlBtn);
      });

      // Submenu should show the custom playlist
      expect(await screen.findByText('Custom Playlist 1')).toBeTruthy();

      // Test inline playlist input form
      const input = screen.getByPlaceholderText(/new playlist|новый плейлист/i);
      expect(input).toBeTruthy();
      fireEvent.change(input, { target: { value: 'Awesome Mix' } });

      // Click the back button to return to main actions
      const backBtn = screen.getByText(/add to playlist|добавить в плейлист/i).closest('button');
      await act(async () => {
        fireEvent.click(backBtn!);
      });

      // Should be back to main buttons
      expect(screen.getByRole('button', { name: /play now|слушать сейчас/i })).toBeTruthy();
    });

    it('renders playlist context menu actions (open, share, delete)', async () => {
      useContextMenuStore.setState({
        isOpen: true,
        x: 100,
        y: 100,
        item: { id: 'cp-1', name: 'Custom Playlist 1', isCustom: true },
        type: 'playlist'
      });

      render(
        <MemoryRouter>
          <DesktopContextMenu />
        </MemoryRouter>
      );

      expect(screen.getByRole('button', { name: /open|открыть/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /share|поделиться/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /delete|удалить/i })).toBeTruthy();
    });
  });

  // ========================================================
  // SUITE 3: MobileContextMenuDrawer
  // ========================================================
  describe('3. MobileContextMenuDrawer Component', () => {
    it('renders mobile drawer layout with 48x48 cover art and mobile icon buttons', () => {
      useContextMenuStore.setState({
        isOpen: true,
        item: { id: 'm-track-1', title: 'Mobile Track', artist: 'Mobile Artist' },
        type: 'track'
      });

      render(
        <MemoryRouter>
          <MobileContextMenuDrawer />
        </MemoryRouter>
      );

      expect(screen.getByText('Mobile Track')).toBeTruthy();
      expect(screen.getByText('Mobile Artist')).toBeTruthy();

      // Mobile cover art image size 48x48 (w-12 h-12)
      const coverImg = document.querySelector('img.w-12.h-12');
      expect(coverImg).toBeTruthy();

      // Grid of mobile buttons
      const grid = document.querySelector('.grid.grid-cols-4');
      expect(grid).toBeTruthy();
    });

    it('calls onRemoveDownload using deleteDownloadedItem helper', async () => {
      const dlState = {
        'dl-track-1': {
          id: 'dl-track-1',
          type: 'track' as const,
          status: 'completed' as const,
          name: 'Downloaded Track',
          path: 'tracks/dl.mp3',
          sizeBytes: 1024,
          progress: 100,
          timestamp: Date.now()
        }
      };
      useDownloadStore.setState({
        downloads: dlState
      });

      const trackItem = { id: 'dl-track-1', title: 'Downloaded Track', artist: 'Artist' };

      useContextMenuStore.setState({
        isOpen: true,
        item: trackItem,
        type: 'track'
      });

      render(
        <MemoryRouter>
          <MobileContextMenuDrawer />
        </MemoryRouter>
      );

      const removeDlBtn = screen.getByRole('button', { name: /remove download|удалить скачанное|удалить загрузк/i });
      expect(removeDlBtn).toBeTruthy();

      await act(async () => {
        fireEvent.click(removeDlBtn);
      });

      expect(downloadHelper.deleteDownloadedItem).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'dl-track-1' })
      );
      expect(useContextMenuStore.getState().isOpen).toBe(false);
    });

    it('renders playlist actions in mobile grid of 3 columns', () => {
      useContextMenuStore.setState({
        isOpen: true,
        item: { id: 'cp-1', name: 'Custom Playlist 1', isCustom: true },
        type: 'playlist'
      });

      render(
        <MemoryRouter>
          <MobileContextMenuDrawer />
        </MemoryRouter>
      );

      const grid3 = document.querySelector('.grid.grid-cols-3');
      expect(grid3).toBeTruthy();
      expect(screen.getByRole('button', { name: /open|открыть/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /delete|удалить/i })).toBeTruthy();
    });
  });

  // ========================================================
  // SUITE 4: ContextMenu Orchestrator
  // ========================================================
  describe('4. ContextMenu Orchestrator', () => {
    it('returns null when context menu is closed or has no item', () => {
      useContextMenuStore.setState({ isOpen: false, item: null });
      const { container } = render(
        <MemoryRouter>
          <ContextMenu />
        </MemoryRouter>
      );
      expect(container.firstChild).toBeNull();
    });

    it('switches between DesktopContextMenu and MobileContextMenuDrawer on window resize', () => {
      // Mock desktop window width
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });

      useContextMenuStore.setState({
        isOpen: true,
        x: 150,
        y: 200,
        item: { id: 'res-track-1', title: 'Responsive Song', artist: 'Artist' },
        type: 'track'
      });

      render(
        <MemoryRouter>
          <ContextMenu />
        </MemoryRouter>
      );

      // Desktop has 40x40 cover art (w-10 h-10)
      expect(document.querySelector('img.w-10.h-10')).toBeTruthy();
      expect(document.querySelector('img.w-12.h-12')).toBeNull();

      // Trigger resize to mobile (e.g. 500px)
      act(() => {
        window.innerWidth = 500;
        window.dispatchEvent(new Event('resize'));
      });

      // Mobile has 48x48 cover art (w-12 h-12)
      expect(document.querySelector('img.w-12.h-12')).toBeTruthy();
    });
  });
});
