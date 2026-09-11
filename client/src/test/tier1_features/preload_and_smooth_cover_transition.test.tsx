import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { preloadTrackAssets, preloadAndDecodeImage, CANONICAL_COVER_SIZES } from '../../utils/assetPreloader';
import TrackImage from '../../components/common/TrackImage';
import { StorageManager } from '../../utils/StorageManager';
import * as subsonicApi from '../../api/subsonic';
import * as imageCacheModule from '../../utils/imageCache';
import MobilePlayerUI from '../../components/player/MobilePlayerUI';
import { usePlayerStore } from '../../store/playerStore';

describe('Preload & Cover Art Smooth Transition Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. assetPreloader.ts', () => {
    it('defines canonical sizes as [120, 300, 800]', () => {
      expect(CANONICAL_COVER_SIZES).toEqual([120, 300, 800]);
    });

    it('preloadAndDecodeImage safely attempts GPU decode and handles success', async () => {
      const origUserAgent = navigator.userAgent;
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HoladApp/1.0',
        configurable: true,
      });

      const origImage = global.Image;
      let decodeCalled = false;

      class MockImage {
        src = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        complete = false;
        async decode() {
          decodeCalled = true;
          return Promise.resolve();
        }
      }
      global.Image = MockImage as any;

      try {
        const result = await preloadAndDecodeImage('http://localhost:4533/rest/getCoverArt.view?id=test_cover_unique_1');
        expect(result).toBe(true);
        expect(decodeCalled).toBe(true);
      } finally {
        global.Image = origImage;
        Object.defineProperty(navigator, 'userAgent', {
          value: origUserAgent,
          configurable: true,
        });
      }
    });

    it('preloadTrackAssets preloads canonical sizes (120, 300, 800) for online tracks', async () => {
      const getCoverArtSpy = vi.spyOn(subsonicApi, 'getCoverArtUrl').mockImplementation((id, size) => `http://mock-art/${id}?size=${size}`);
      const getCachedSpy = vi.spyOn(imageCacheModule, 'getCachedImageUrl').mockImplementation(async (url) => `blob:${url}`);
      vi.spyOn(StorageManager, 'getLocalCoverUri').mockResolvedValue(null);

      const track = {
        id: 'track-101',
        title: 'Cyberpunk Odyssey',
        artist: 'Synthwave Master',
        album: 'Neon Dreams',
        coverArt: 'cover-101',
        duration: 240,
      };

      await preloadTrackAssets(track);

      expect(getCoverArtSpy).toHaveBeenCalledWith('cover-101', 120);
      expect(getCoverArtSpy).toHaveBeenCalledWith('cover-101', 300);
      expect(getCoverArtSpy).toHaveBeenCalledWith('cover-101', 800);
      expect(getCachedSpy).toHaveBeenCalledTimes(3);
    });

    it('preloadTrackAssets integrates with StorageManager.getLocalCoverUri for offline tracks', async () => {
      const localCoverSpy = vi.spyOn(StorageManager, 'getLocalCoverUri').mockResolvedValue('asset://localhost/local_covers/track-offline.jpg');
      const getCoverArtSpy = vi.spyOn(subsonicApi, 'getCoverArtUrl');

      const track = {
        id: 'track-offline-99',
        title: 'Offline Journey',
        artist: 'Local Artist',
        album: 'Offline Album',
        coverArt: 'cov-offline',
        duration: 180,
      };

      await preloadTrackAssets(track);

      expect(localCoverSpy).toHaveBeenCalledWith('track-offline-99');
      // For offline tracks, it should decode local URI directly and NOT query remote Subsonic cover art
      expect(getCoverArtSpy).not.toHaveBeenCalled();
    });

    it('preloadTrackAssets gracefully handles null/undefined track without crashing', async () => {
      await expect(preloadTrackAssets(null)).resolves.not.toThrow();
      await expect(preloadTrackAssets(undefined)).resolves.not.toThrow();
      await expect(preloadTrackAssets({ id: '' })).resolves.not.toThrow();
    });
  });

  describe('2. TrackImage.tsx Display Buffer & Smooth Crossfade', () => {
    beforeEach(() => {
      class MockIntersectionObserver {
        observe(target: Element) {
          this.callback([{ isIntersecting: true, target } as any], this as any);
        }
        disconnect() {}
        unobserve() {}
        constructor(public callback: IntersectionObserverCallback) {}
      }
      global.IntersectionObserver = MockIntersectionObserver as any;
    });

    it('keeps rendering previous image in display buffer while incoming track cover loads', async () => {
      vi.spyOn(StorageManager, 'getLocalCoverUri').mockResolvedValue(null);
      vi.spyOn(subsonicApi, 'getCoverArtUrl').mockImplementation((id) => `http://mock-art/${id}`);

      let resolveImage2: ((val: string) => void) | null = null;
      vi.spyOn(imageCacheModule, 'getCachedImageUrl').mockImplementation(async (url) => {
        if (url.includes('track-1')) return 'blob:http://cached/track-1';
        if (url.includes('track-2')) {
          return new Promise((resolve) => {
            resolveImage2 = resolve;
          });
        }
        return `blob:${url}`;
      });

      const { rerender } = render(<TrackImage src="http://mock-art/track-1" trackId="track-1" alt="Track 1" />);

      // Wait for Track 1 image to load and be displayed
      await waitFor(() => {
        const img = screen.queryByAltText('Track 1');
        expect(img).toBeTruthy();
        expect(img?.getAttribute('src')).toBe('blob:http://cached/track-1');
      });

      // Switch to Track 2 (incoming cover takes time to download)
      await act(async () => {
        rerender(<TrackImage src="http://mock-art/track-2" trackId="track-2" alt="Track 2" />);
      });

      // Crucial test: Music placeholder must NOT be shown while loading Track 2!
      expect(screen.queryByTestId('music-icon')).toBeFalsy();
      const imagesWhileLoading = screen.getAllByRole('img', { hidden: true });
      // The previous image (Track 1) MUST still be rendered in DOM as display buffer
      const prevRendered = imagesWhileLoading.find(img => img.getAttribute('src') === 'blob:http://cached/track-1');
      expect(prevRendered).toBeTruthy();

      // Now resolve Track 2 image
      await act(async () => {
        if (resolveImage2) resolveImage2('blob:http://cached/track-2');
      });

      // Track 2 image should now be displayed
      await waitFor(() => {
        const newImg = screen.queryByAltText('Track 2');
        expect(newImg).toBeTruthy();
        expect(newImg?.getAttribute('src')).toBe('blob:http://cached/track-2');
      });
    });

    it('NEVER shows Music placeholder icon during track transition if a cover is loading or previously displayed', async () => {
      vi.spyOn(subsonicApi, 'getCoverArtUrl').mockImplementation((id) => `http://mock-art/${id}`);
      vi.spyOn(imageCacheModule, 'getCachedImageUrl').mockImplementation(async (url) => `blob:${url}`);
      vi.spyOn(StorageManager, 'getLocalCoverUri').mockResolvedValue(null);

      const { rerender, container } = render(<TrackImage src="http://mock-art/track-alpha" trackId="alpha" alt="Alpha" />);

      await waitFor(() => {
        expect(container.querySelector('svg.lucide-music')).toBeNull();
        expect(screen.getByAltText('Alpha')).toBeTruthy();
      });

      // Rapidly change track to beta
      await act(async () => {
        rerender(<TrackImage src="http://mock-art/track-beta" trackId="beta" alt="Beta" />);
      });

      // Verify svg.lucide-music is NEVER present during transition
      expect(container.querySelector('svg.lucide-music')).toBeNull();
    });
  });

  describe('3. MobilePlayerUI Background Dissolve & Storage Continuity', () => {
    it('renders MobilePlayerUI without crashing and preserves background during transition', async () => {
      vi.spyOn(StorageManager, 'getLocalCoverUri').mockResolvedValue('asset://mock/local-cover-1.jpg');
      vi.spyOn(subsonicApi, 'getCoverArtUrl').mockImplementation((id) => `http://mock-art/${id}`);

      usePlayerStore.setState({
        queue: [
          { id: 'track-mob-1', title: 'Track 1', artist: 'Artist 1', album: 'Album 1', coverArt: 'c1', duration: 180 },
          { id: 'track-mob-2', title: 'Track 2', artist: 'Artist 2', album: 'Album 2', coverArt: 'c2', duration: 200 }
        ],
        currentIndex: 0,
        isPlaying: true,
      });

      const { container, rerender } = render(<MobilePlayerUI onClose={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText('Track 1')).toBeTruthy();
      });

      // Switch to track 2
      await act(async () => {
        usePlayerStore.setState({ currentIndex: 1 });
        rerender(<MobilePlayerUI onClose={() => {}} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Track 2')).toBeTruthy();
      });

      // Background container should be present without black screen
      expect(container.querySelector('.blur-\\[30px\\]')).toBeTruthy();
    });
  });
});
