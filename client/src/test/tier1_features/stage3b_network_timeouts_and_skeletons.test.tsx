import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, waitFor, cleanup } from '@testing-library/react';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import {
  Skeleton,
  CardGridSkeleton,
  TrackListSkeleton,
  DetailHeaderSkeleton,
  HomeSectionSkeleton,
} from '../../components/common/Skeleton';

const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  connected: false,
};

const ioMock = vi.fn(() => mockSocket);

vi.mock('socket.io-client', () => ({
  io: (...args: any[]) => ioMock(...args),
}));

describe('Stage 3B: Network Timeouts, Progressive Loading & Skeletons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('fetchWithTimeout', () => {
    it('aborts and throws TimeoutError when request exceeds timeoutMs', async () => {
      vi.useFakeTimers();

      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = fetchWithTimeout('http://example.com/slow', { timeoutMs: 250 });
      const rejection = expect(promise).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(250);
      await rejection;
    });

    it('forwards caller AbortSignal and preserves AbortError', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted by caller');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const caller = new AbortController();
      const promise = fetchWithTimeout('http://example.com/cancel', {
        signal: caller.signal,
        timeoutMs: 5000,
      });

      caller.abort();
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('passes through method, headers, and keepalive to fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as any);
      await fetchWithTimeout('http://example.com/ping', {
        method: 'POST',
        keepalive: true,
        headers: { 'x-test': '1' },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://example.com/ping',
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
          headers: { 'x-test': '1' },
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe('JamSocketService connection caps', () => {
    it('configures bounded reconnectionAttempts, reconnectionDelayMax, and timeout', async () => {
      const { jamSocket } = await import('../../api/socket');
      jamSocket.disconnect();
      jamSocket.connect();

      expect(ioMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reconnectionAttempts: 8,
          reconnectionDelayMax: 15000,
          timeout: 10000,
        })
      );
      jamSocket.disconnect();
    });
  });

  describe('useArtistData progressive loading', () => {
    it('unblocks loading as soon as artist header resolves without waiting for topSongs', async () => {
      let resolveTopSongs!: (value: any[]) => void;
      const topSongsPromise = new Promise<any[]>(resolve => {
        resolveTopSongs = resolve;
      });

      const subsonic = await import('../../api/subsonic');
      vi.spyOn(subsonic, 'getArtist').mockResolvedValueOnce({
        id: 'art-1',
        name: 'Test Artist',
        albumCount: 1,
        album: [{ id: 'alb-1', name: 'Album 1', artist: 'Test Artist' }],
      });
      vi.spyOn(subsonic, 'getArtistInfo').mockResolvedValueOnce({ biography: 'Bio' });
      vi.spyOn(subsonic, 'getTopSongs').mockReturnValueOnce(topSongsPromise);
      vi.spyOn(subsonic, 'searchAll').mockResolvedValueOnce({ song: [], album: [], artist: [] });

      const externalApi = await import('../../api/externalApi');
      vi.spyOn(externalApi, 'getExternalArtistStats').mockResolvedValueOnce({ source: 'local' });

      const { useArtistData } = await import('../../hooks/useArtistData');
      const { result } = renderHook(() => useArtistData('Test Artist-art-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.artist?.name).toBe('Test Artist');
      expect(result.current.tracksLoading).toBe(true);

      resolveTopSongs([{ id: 's-1', title: 'Hit Song', artist: 'Test Artist', duration: 180 }]);

      await waitFor(() => {
        expect(result.current.tracksLoading).toBe(false);
      });
      expect(result.current.topSongs).toHaveLength(1);
    });
  });

  describe('Skeleton primitives', () => {
    it('renders theme-aware shimmer skeleton components', () => {
      const { container } = render(
        <div>
          <Skeleton className="h-4 w-20" />
          <CardGridSkeleton count={2} />
          <TrackListSkeleton count={2} />
          <DetailHeaderSkeleton avatarShape="circle" />
          <HomeSectionSkeleton />
        </div>
      );

      const pulseBlocks = container.querySelectorAll('.animate-pulse');
      expect(pulseBlocks.length).toBeGreaterThan(10);
    });
  });
});
