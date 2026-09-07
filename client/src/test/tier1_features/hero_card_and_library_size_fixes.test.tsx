import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import HeroAlbumCard from '../../components/common/HeroAlbumCard';
import DownloadedMusicGrid from '../../components/settings/DownloadedMusicGrid';
import { useDownloadStore } from '../../store/downloadStore';
import { usePlayerStore } from '../../store/playerStore';

vi.mock('../../api/subsonic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/subsonic')>();
  return {
    ...actual,
    getCoverArtUrl: (id: string) => `http://mock-server/coverArt?id=${id}`,
    starItem: vi.fn().mockResolvedValue({}),
    unstarItem: vi.fn().mockResolvedValue({}),
    setItemRating: vi.fn().mockResolvedValue({}),
    getAlbum: vi.fn().mockResolvedValue({ song: [] }),
  };
});

describe('HeroAlbumCard hover hiding & DownloadedMusicGrid size deduplication', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      queue: [],
      currentIndex: 0,
      isPlaying: false,
      likedTrackIds: [],
      excludedTrackIds: [],
      likedAlbumIds: [],
      excludedAlbumIds: [],
      roomId: null,
      role: 'host',
    });

    useDownloadStore.setState({
      downloads: {},
      downloadDirectory: null,
    });
  });

  describe('HeroAlbumCard', () => {
    it('applies hover opacity-0 and pointer-events-none to the download badge when album is downloaded', () => {
      const album = {
        id: 'hero-alb-1',
        name: 'Hero Album 1',
        artist: 'Hero Artist',
        coverArt: 'cover-1',
      };

      useDownloadStore.setState({
        downloads: {
          'hero-alb-1': {
            id: 'hero-alb-1',
            name: 'Hero Album 1',
            type: 'album',
            status: 'completed',
            path: 'albums/Hero Album 1',
            timestamp: Date.now(),
            sizeBytes: 50000000,
          },
        },
      });

      const { container } = render(
        <MemoryRouter>
          <HeroAlbumCard album={album} />
        </MemoryRouter>
      );

      const downloadIcon = container.querySelector('svg.lucide-download');
      expect(downloadIcon).toBeTruthy();
      const badgeDiv = downloadIcon?.parentElement;
      expect(badgeDiv?.className).toContain('[@media(hover:hover)]:group-hover:opacity-0');
      expect(badgeDiv?.className).toContain('pointer-events-none');
      expect(badgeDiv?.className).toContain('transition-opacity');

      const hoverOverlay = container.querySelector('div[class*="group-hover:opacity-100"]');
      expect(hoverOverlay).toBeTruthy();
      expect(hoverOverlay?.className).toContain('z-20');
    });

    it('applies hover opacity-0 and pointer-events-none to the downloading spinner when album is downloading', () => {
      const album = {
        id: 'hero-alb-2',
        name: 'Hero Album 2',
        artist: 'Hero Artist',
        coverArt: 'cover-2',
      };

      useDownloadStore.setState({
        downloads: {
          'hero-alb-2': {
            id: 'hero-alb-2',
            name: 'Hero Album 2',
            type: 'album',
            status: 'downloading',
            progress: 45,
            path: '',
            timestamp: Date.now(),
          },
        },
      });

      const { container } = render(
        <MemoryRouter>
          <HeroAlbumCard album={album} />
        </MemoryRouter>
      );

      const spinnerSvg = container.querySelector('svg.animate-spin');
      expect(spinnerSvg).toBeTruthy();
      const spinnerDiv = spinnerSvg?.parentElement;
      expect(spinnerDiv?.className).toContain('[@media(hover:hover)]:group-hover:opacity-0');
      expect(spinnerDiv?.className).toContain('pointer-events-none');
    });
  });

  describe('DownloadedMusicGrid size deduplication', () => {
    it('does not double count album size and its child tracks size', () => {
      const MB = 1024 * 1024;
      // Album is 100 MB, composed of two 50 MB tracks
      useDownloadStore.setState({
        downloads: {
          'alb-100': {
            id: 'alb-100',
            name: 'Super Album',
            type: 'album',
            status: 'completed',
            sizeBytes: 100 * MB,
            timestamp: Date.now() - 2000,
            path: 'albums/Super Album',
          },
          'track-1': {
            id: 'track-1',
            name: 'Track One',
            type: 'track',
            status: 'completed',
            albumId: 'alb-100',
            sizeBytes: 50 * MB,
            timestamp: Date.now() - 1000,
            path: 'tracks/Track One.mp3',
          },
          'track-2': {
            id: 'track-2',
            name: 'Track Two',
            type: 'track',
            status: 'completed',
            albumId: 'alb-100',
            sizeBytes: 50 * MB,
            timestamp: Date.now() - 500,
            path: 'tracks/Track Two.mp3',
          },
        },
      });

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      // Header font-mono line should show (100 MB), NOT (200 MB)
      const headerStats = container.querySelector('.font-mono');
      expect(headerStats).toBeTruthy();
      expect(headerStats?.textContent).toContain('100 MB');
      expect(headerStats?.textContent).not.toContain('200 MB');
    });

    it('correctly includes standalone tracks alongside album tracks without duplication', () => {
      const MB = 1024 * 1024;
      // Album 100 MB (2x 50 MB) + Standalone track 25 MB = 125 MB total (NOT 225 MB)
      useDownloadStore.setState({
        downloads: {
          'alb-100': {
            id: 'alb-100',
            name: 'Super Album',
            type: 'album',
            status: 'completed',
            sizeBytes: 100 * MB,
            timestamp: Date.now() - 2000,
            path: 'albums/Super Album',
          },
          'track-1': {
            id: 'track-1',
            name: 'Track One',
            type: 'track',
            status: 'completed',
            albumId: 'alb-100',
            sizeBytes: 50 * MB,
            timestamp: Date.now() - 1000,
            path: 'tracks/Track One.mp3',
          },
          'track-2': {
            id: 'track-2',
            name: 'Track Two',
            type: 'track',
            status: 'completed',
            albumId: 'alb-100',
            sizeBytes: 50 * MB,
            timestamp: Date.now() - 500,
            path: 'tracks/Track Two.mp3',
          },
          'track-standalone': {
            id: 'track-standalone',
            name: 'Standalone Single',
            type: 'track',
            status: 'completed',
            sizeBytes: 25 * MB,
            timestamp: Date.now() - 100,
            path: 'tracks/Single.mp3',
          },
        },
      });

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      // Total should be 125 MB, NOT 225 MB
      const headerStats = container.querySelector('.font-mono');
      expect(headerStats).toBeTruthy();
      expect(headerStats?.textContent).toContain('125 MB');
      expect(headerStats?.textContent).not.toContain('225 MB');
    });

    it('counts album size when album has no child tracks indexed in store', () => {
      const MB = 1024 * 1024;
      useDownloadStore.setState({
        downloads: {
          'alb-orphan': {
            id: 'alb-orphan',
            name: 'Legacy Album',
            type: 'album',
            status: 'completed',
            sizeBytes: 75 * MB,
            timestamp: Date.now() - 1000,
            path: 'albums/Legacy Album',
          },
        },
      });

      const { container } = render(
        <MemoryRouter>
          <DownloadedMusicGrid />
        </MemoryRouter>
      );

      const headerStats = container.querySelector('.font-mono');
      expect(headerStats).toBeTruthy();
      expect(headerStats?.textContent).toContain('75 MB');
    });
  });
});
