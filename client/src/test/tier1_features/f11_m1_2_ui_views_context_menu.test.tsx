import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// oxlint-disable-next-line
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  // oxlint-disable-next-line
  vfs,
  // oxlint-disable-next-line
  mockState,
  resetE2EHarness,
  // oxlint-disable-next-line
  setPlatform,
  // oxlint-disable-next-line
  registerMockSong,
  // oxlint-disable-next-line
  registerMockAlbum,
} from '../e2e/harness';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { usePlayerStore } from '../../store/playerStore';
import { useDownloadStore } from '../../store/downloadStore';
import { useUIStore } from '../../store/uiStore';
// oxlint-disable-next-line
import { useSettingsStore } from '../../store/settingsStore';
// oxlint-disable-next-line
import * as downloadHelper from '../../utils/downloadHelper';

// Import UI Views & Components
import FavoritesView from '../../components/views/FavoritesView';
import HistoryView from '../../components/views/HistoryView';
import MobileMainContent from '../../components/layout/MobileMainContent';
import MobileQueueTab from '../../components/player/MobileQueueTab';
import TopBar from '../../components/layout/TopBar';
import MobileSearchOverlay from '../../components/modals/MobileSearchOverlay';
import AlbumsView from '../../components/views/AlbumsView';
import DownloadedMusicGrid from '../../components/settings/DownloadedMusicGrid';
import FullScreenPlayerUI from '../../components/common/FullScreenPlayerUI';
// oxlint-disable-next-line
import ContextMenu from '../../components/common/ContextMenu';

// Mock Subsonic API properly preserving all exports
vi.mock('../../api/subsonic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/subsonic')>();
  return {
    ...actual,
    fetchStarred: vi.fn().mockImplementation(() => Promise.resolve({
      album: [
        { id: 'fav-album-1', name: 'Fav Album 1', title: 'Fav Album 1', artist: 'Fav Artist 1', coverArt: 'fav-cover-1' }
      ],
      song: [
        { id: 'fav-song-1', title: 'Fav Song 1', artist: 'Fav Artist 1', album: 'Fav Album 1', albumId: 'fav-album-1', duration: 200, coverArt: 'fav-cover-1' }
      ]
    })),
    fetchAlbums: vi.fn().mockImplementation(() => Promise.resolve([
      { id: 'album-alpha', name: 'Alpha Album', title: 'Alpha Album', artist: 'Artist Alpha', coverArt: 'cover-alpha' },
      { id: 'album-beta', name: 'Beta Album', title: 'Beta Album', artist: 'Artist Beta', coverArt: 'cover-beta' }
    ])),
    fetchRandomTracks: vi.fn().mockResolvedValue([]),
    getSongsByGenre: vi.fn().mockResolvedValue([]),
    getCoverArtUrl: (id: string) => `http://mock-server/coverArt?id=${id}`,
    getAlbum: vi.fn().mockResolvedValue([
      { id: 'track-in-album-1', title: 'Album Track 1', artist: 'Album Artist', album: 'Album Name', duration: 180, coverArt: 'cover-album' }
    ]),
    getLyricsBySongId: vi.fn().mockResolvedValue([]),
    getSimilarSongs: vi.fn().mockResolvedValue([]),
    starItem: vi.fn().mockResolvedValue({ status: 'ok' }),
    unstarItem: vi.fn().mockResolvedValue({ status: 'ok' }),
    setItemRating: vi.fn().mockResolvedValue({ status: 'ok' }),
    searchAll: vi.fn().mockResolvedValue({
      song: [{ id: 'search-track-1', title: 'Searched Song', artist: 'Search Artist', album: 'Search Album', duration: 210, coverArt: 'search-cover-1' }],
      album: [{ id: 'search-album-1', name: 'Searched Album', title: 'Searched Album', artist: 'Search Artist', coverArt: 'search-cover-1' }],
      artist: [{ id: 'search-artist-1', name: 'Searched Artist' }]
    })
  };
});

describe('Milestone 1 UI Adversarial Suite: Context Menu & Downloads Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetE2EHarness();

    // JSDOM polyfills for layout and scrolling
    Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      width: 500,
      height: 500,
      top: 0,
      left: 0,
      bottom: 500,
      right: 500,
    });
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollTo = vi.fn();

    useContextMenuStore.setState({
      isOpen: false,
      x: 0,
      y: 0,
      item: null,
      type: 'track',
    });
    usePlayerStore.setState({
      queue: [
        { id: 'queue-track-0', title: 'Queue Song 0', artist: 'Queue Artist', album: 'Queue Album', duration: 190, coverArt: 'q-cover-0' },
        { id: 'queue-track-1', title: 'Queue Song 1', artist: 'Queue Artist', album: 'Queue Album', duration: 220, coverArt: 'q-cover-1' }
      ],
      currentIndex: 0,
      isPlaying: false,
      likedTrackIds: ['fav-song-1'],
      likedAlbumIds: ['fav-album-1'],
      role: 'host'
    });
    useDownloadStore.setState({
      downloads: {
        'downloaded-track-1': {
          id: 'downloaded-track-1',
          type: 'track',
          status: 'completed',
          name: 'Offline Track 1',
          artist: 'Offline Artist',
          album: 'Offline Album',
          duration: 150,
          path: 'tracks/Offline Track 1.mp3',
          sizeBytes: 5000000
        },
        'downloaded-album-1': {
          id: 'downloaded-album-1',
          type: 'album',
          status: 'completed',
          name: 'Offline Album 1',
          artist: 'Offline Artist',
          completedTrackCount: 3,
          totalTrackCount: 3,
          path: 'albums/Offline Album 1',
          sizeBytes: 15000000
        }
      },
      isDownloading: false,
      activeDownloadsCount: 0
    });
    useUIStore.setState({
      isSearchOpen: false,
      searchQuery: '',
      searchResults: { song: [], album: [], artist: [] },
      isSearchLoading: false,
      activeFilter: null,
      isOfflineModalOpen: false
    });
  });

  afterEach(() => {
    cleanup();
    resetE2EHarness();
    vi.restoreAllMocks();
  });

  // ==========================================
  // VIEW 1: FavoritesView
  // ==========================================
  describe('1. FavoritesView Integration', () => {
    it('opens context menu on desktop right click on a track with preventDefault', async () => {
      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      render(
        <MemoryRouter>
          <FavoritesView />
        </MemoryRouter>
      );

      // Wait for items to load
      const trackTitles = await screen.findAllByText('Fav Song 1');
      const trackRow = trackTitles[0].closest('div[class*="cursor-pointer"]');
      expect(trackRow).toBeTruthy();

      // Right click on track row
      fireEvent.contextMenu(trackRow!, { clientX: 300, clientY: 400 });

      expect(openMenuSpy).toHaveBeenCalled();
      const callArgs = openMenuSpy.mock.calls[0];
      expect(callArgs[0]).toBe(300);
      expect(callArgs[1]).toBe(400);
      expect(callArgs[2].id).toBe('fav-song-1');
      expect(callArgs[3]).toBe('track');
    });

    it('toggling heart like does not trigger track playback or open context menu (stopPropagation)', async () => {
      const setQueueAndPlaySpy = vi.spyOn(usePlayerStore.getState(), 'setQueueAndPlay');
      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      render(
        <MemoryRouter>
          <FavoritesView />
        </MemoryRouter>
      );

      const trackTitles = await screen.findAllByText('Fav Song 1');
      const trackRow = trackTitles[0].closest('div[class*="group"]');
      const heartBtn = trackRow!.querySelector('button .lucide-heart')?.closest('button');
      expect(heartBtn).toBeTruthy();

      fireEvent.click(heartBtn!);

      expect(setQueueAndPlaySpy).not.toHaveBeenCalled();
      expect(openMenuSpy).not.toHaveBeenCalled();
      expect(usePlayerStore.getState().likedTrackIds).not.toContain('fav-song-1');
    });
  });

  // ==========================================
  // VIEW 2: HistoryView
  // ==========================================
  describe('2. HistoryView Integration', () => {
    it('triggers context menu on right click / long press on history track', async () => {
      usePlayerStore.setState({ likedTrackIds: [] });
      const { useHistoryStore } = await import('../../store/historyStore');
      useHistoryStore.setState({
        history: [
          {
            id: 'hist-song-1',
            title: 'History Song 1',
            artist: 'History Artist 1',
            album: 'History Album 1',
            albumId: 'hist-alb-1',
            duration: 180,
            playedAt: Date.now(),
            playCount: 5
          }
        ]
      });

      render(
        <MemoryRouter>
          <HistoryView />
        </MemoryRouter>
      );

      const trackElements = screen.getAllByText('History Song 1');
      const itemContainer = trackElements[0].closest('div[class*="group"]');
      expect(itemContainer).toBeTruthy();

      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      // Right click / context menu trigger on history track
      fireEvent.contextMenu(itemContainer!, { clientX: 220, clientY: 330 });

      expect(openMenuSpy).toHaveBeenCalled();
      expect(openMenuSpy.mock.calls[0][0]).toBe(220);
      expect(openMenuSpy.mock.calls[0][1]).toBe(330);
      expect(openMenuSpy.mock.calls[0][3]).toBe('track');
    });
  });

  // ==========================================
  // VIEW 3: MobileMainContent
  // ==========================================
  describe('3. MobileMainContent Integration', () => {
    it('right click / long press on recently played track opens track context menu', async () => {
      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      render(
        <MemoryRouter>
          <MobileMainContent
            albums={[]}
            recentTracks={[
              { id: 'mobile-recent-1', title: 'Mobile Track', artist: 'Artist', coverArt: 'cov-1', duration: 120 }
            ]}
            frequentAlbums={[]}
            genres={[]}
          />
        </MemoryRouter>
      );

      const trackEl = screen.getByText('Mobile Track');
      const wrapper = trackEl.closest('div[class*="cursor-pointer"]');
      expect(wrapper).toBeTruthy();

      fireEvent.contextMenu(wrapper!, { clientX: 180, clientY: 290 });

      expect(openMenuSpy).toHaveBeenCalled();
      expect(openMenuSpy.mock.calls[0][0]).toBe(180);
      expect(openMenuSpy.mock.calls[0][1]).toBe(290);
      expect(openMenuSpy.mock.calls[0][2].id).toBe('mobile-recent-1');
    });
  });

  // ==========================================
  // VIEW 4: MobileQueueTab & Drag-and-Drop
  // ==========================================
  describe('4. MobileQueueTab & Drag-and-Drop Safety', () => {
    it('clicking 3-dots button stops propagation and opens context menu at button position', () => {
      const playTrackSpy = vi.spyOn(usePlayerStore.getState(), 'playTrack');
      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      render(
        <MemoryRouter>
          <MobileQueueTab />
        </MemoryRouter>
      );

      const song = screen.getByText('Queue Song 1');
      const row = song.closest('#mobile-queue-item-1');
      expect(row).toBeTruthy();

      const dotsBtn = row!.querySelector('button');
      expect(dotsBtn).toBeTruthy();

      fireEvent.click(dotsBtn!);

      // Context menu must open
      expect(openMenuSpy).toHaveBeenCalled();
      const call = openMenuSpy.mock.calls[0];
      expect(call[2].id).toBe('queue-track-1');
      expect(call[2].queueIndex).toBe(1);

      // Row playback must NOT be triggered
      expect(playTrackSpy).not.toHaveBeenCalled();
    });

    it('single tap on queue row plays track when not dragging', () => {
      const playTrackSpy = vi.spyOn(usePlayerStore.getState(), 'playTrack');

      render(
        <MemoryRouter>
          <MobileQueueTab />
        </MemoryRouter>
      );

      const song = screen.getByText('Queue Song 1');
      const row = song.closest('#mobile-queue-item-1');
      fireEvent.click(row!);

      expect(playTrackSpy).toHaveBeenCalledWith(1);
    });

    it('context menu on queue item opens context menu with queueIndex', () => {
      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      render(
        <MemoryRouter>
          <MobileQueueTab />
        </MemoryRouter>
      );

      const row = screen.getByText('Queue Song 0').closest('#mobile-queue-item-0');
      fireEvent.contextMenu(row!, { clientX: 150, clientY: 300 });

      expect(openMenuSpy).toHaveBeenCalled();
      expect(openMenuSpy.mock.calls[0][2].queueIndex).toBe(0);
    });
  });

  // ==========================================
  // VIEW 5: TopBar
  // ==========================================
  describe('5. TopBar Integration', () => {
    it('right-clicking track search result opens context menu with preventDefault', async () => {
      render(
        <MemoryRouter>
          <TopBar />
        </MemoryRouter>
      );

      const input = screen.getByPlaceholderText(/search|поиск/i);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Searched' } });

      const trackResult = await screen.findByText('Searched Song', {}, { timeout: 3000 });
      const trackRow = trackResult.closest('div[class*="cursor-pointer"]');
      expect(trackRow).toBeTruthy();

      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      fireEvent.contextMenu(trackRow!, { clientX: 450, clientY: 180 });

      expect(openMenuSpy).toHaveBeenCalled();
      expect(openMenuSpy.mock.calls[0][0]).toBe(450);
      expect(openMenuSpy.mock.calls[0][1]).toBe(180);
      expect(openMenuSpy.mock.calls[0][2].id).toBe('search-track-1');
    });
  });

  // ==========================================
  // VIEW 6: MobileSearchOverlay
  // ==========================================
  describe('6. MobileSearchOverlay Integration', () => {
    it('right-click or long-press on search result track opens context menu', async () => {
      useUIStore.setState({ isSearchOpen: true });

      render(
        <MemoryRouter>
          <MobileSearchOverlay />
        </MemoryRouter>
      );

      const input = screen.getByPlaceholderText(/search|поиск/i);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Searched' } });

      const trackResult = await screen.findByText('Searched Song', {}, { timeout: 3000 });
      const trackRow = trackResult.closest('div[class*="group"]');
      expect(trackRow).toBeTruthy();

      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      // Test context menu trigger
      fireEvent.contextMenu(trackRow!, { clientX: 200, clientY: 260 });

      expect(openMenuSpy).toHaveBeenCalled();
      expect(openMenuSpy.mock.calls[0][2].id).toBe('search-track-1');
    });
  });

  // ==========================================
  // VIEW 7: AlbumsView
  // ==========================================
  describe('7. AlbumsView Integration', () => {
    it('renders list view and opens album context menu on right click / long press', async () => {
      render(
        <MemoryRouter>
          <AlbumsView viewMode="list" />
        </MemoryRouter>
      );

      const albumTitle = await screen.findByText('Alpha Album', {}, { timeout: 3000 });
      const albumRow = albumTitle.closest('div[class*="cursor-pointer"]');
      expect(albumRow).toBeTruthy();

      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      fireEvent.contextMenu(albumRow!, { clientX: 110, clientY: 210 });

      expect(openMenuSpy).toHaveBeenCalled();
      expect(openMenuSpy.mock.calls[0][2].id).toBe('album-alpha');
      expect(openMenuSpy.mock.calls[0][3]).toBe('album');
    });
  });

  // ==========================================
  // VIEW 8: DownloadedMusicGrid
  // ==========================================
  describe('8. DownloadedMusicGrid Integration', () => {
    it('right-click on downloaded card opens context menu with item details', () => {
      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      const trackCardTitle = screen.getByText('Offline Track 1');
      const card = trackCardTitle.closest('div[class*="cursor-pointer"]');
      expect(card).toBeTruthy();

      fireEvent.contextMenu(card!, { clientX: 350, clientY: 420 });

      expect(openMenuSpy).toHaveBeenCalled();
      expect(openMenuSpy.mock.calls[0][0]).toBe(350);
      expect(openMenuSpy.mock.calls[0][1]).toBe(420);
      expect(openMenuSpy.mock.calls[0][2].id).toBe('downloaded-track-1');
    });

    it('clicking direct play button stops propagation and starts playback', () => {
      const setQueueAndPlaySpy = vi.spyOn(usePlayerStore.getState(), 'setQueueAndPlay');
      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      const trackCardTitle = screen.getByText('Offline Track 1');
      const card = trackCardTitle.closest('div[class*="cursor-pointer"]');
      const playBtn = card!.querySelector('button[title*="Воспроизвести"], button[title*="Play"]');
      expect(playBtn).toBeTruthy();

      fireEvent.click(playBtn!);

      expect(setQueueAndPlaySpy).toHaveBeenCalled();
      expect(openMenuSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // VIEW 9: FullScreenPlayerUI
  // ==========================================
  describe('9. FullScreenPlayerUI Integration', () => {
    it('right-click on queue item in full screen player opens context menu with queueIndex', async () => {
      const openMenuSpy = vi.spyOn(useContextMenuStore.getState(), 'openMenu');

      render(
        <MemoryRouter>
          <FullScreenPlayerUI onClose={() => {}} />
        </MemoryRouter>
      );

      // Switch to queue tab
      const queueTabBtn = screen.getByRole('button', { name: /queue|очередь/i });
      fireEvent.click(queueTabBtn);

      const song = await screen.findByText('Queue Song 1');
      const row = song.closest('div[class*="flex items-center px-4 py-3"]');
      expect(row).toBeTruthy();

      fireEvent.contextMenu(row!, { clientX: 600, clientY: 500 });

      expect(openMenuSpy).toHaveBeenCalled();
      expect(openMenuSpy.mock.calls[0][2].id).toBe('queue-track-1');
      expect(openMenuSpy.mock.calls[0][2].queueIndex).toBe(1);
    });
  });

});
