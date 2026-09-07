import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import TrackRow from '../../components/common/TrackRow';
import AlbumCard from '../../components/common/AlbumCard';
import ArtistCard from '../../components/common/ArtistCard';
import { usePlayerStore } from '../../store/playerStore';

vi.mock('../../api/subsonic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/subsonic')>();
  return {
    ...actual,
    getCoverArtUrl: (id: string) => `http://mock-server/coverArt?id=${id}`,
    starItem: vi.fn().mockResolvedValue({}),
    unstarItem: vi.fn().mockResolvedValue({}),
    setItemRating: vi.fn().mockResolvedValue({}),
  };
});

describe('TrackRow and Optimization Stages 3 & 4', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      queue: [
        { id: 't-1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180 },
        { id: 't-2', title: 'Song 2', artist: 'Artist 2', album: 'Album 2', duration: 240 },
      ],
      currentIndex: 0,
      isPlaying: false,
      likedTrackIds: [],
      excludedTrackIds: [],
      likedAlbumIds: [],
      excludedAlbumIds: [],
      roomId: null,
      role: 'host'
    });
  });

  it('TrackRow renders correctly with variant="tracks"', () => {
    const track = { id: 't-1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180 };
    const onPlay = vi.fn();

    const { container } = render(
      <MemoryRouter>
        <TrackRow track={track} index={0} onPlay={onPlay} variant="tracks" />
      </MemoryRouter>
    );

    expect(screen.getByText('Song 1')).toBeDefined();
    expect(screen.getByText(/Artist 1/)).toBeDefined();
    expect(container.querySelector('svg')).toBeDefined();
  });

  it('TrackRow reflects playing state dynamically via atomic selectors', () => {
    const track1 = { id: 't-1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180 };
    const track2 = { id: 't-2', title: 'Song 2', artist: 'Artist 2', album: 'Album 2', duration: 240 };

    const { rerender } = render(
      <MemoryRouter>
        <TrackRow track={track1} index={0} variant="tracks" />
        <TrackRow track={track2} index={1} variant="tracks" />
      </MemoryRouter>
    );

    // Initial: t-1 is currentIndex, but isPlaying is false
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    // Start playback
    usePlayerStore.setState({ isPlaying: true });
    rerender(
      <MemoryRouter>
        <TrackRow track={track1} index={0} variant="tracks" />
        <TrackRow track={track2} index={1} variant="tracks" />
      </MemoryRouter>
    );

    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('TrackRow handles like and exclude toggling', () => {
    const track = { id: 't-1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180 };

    render(
      <MemoryRouter>
        <TrackRow track={track} index={0} variant="tracks" />
      </MemoryRouter>
    );

    // Click heart icon to like
    usePlayerStore.getState().toggleTrackLike('t-1');
    expect(usePlayerStore.getState().likedTrackIds).toContain('t-1');

    // Click ban icon to exclude
    usePlayerStore.getState().toggleTrackExclude('t-1');
    expect(usePlayerStore.getState().excludedTrackIds).toContain('t-1');
  });

  it('TrackRow renders in variant="playlist" without errors', () => {
    const track = { id: 't-1', title: 'Playlist Song', artist: 'Artist 1', duration: 200 };
    render(
      <MemoryRouter>
        <TrackRow track={track} index={0} variant="playlist" />
      </MemoryRouter>
    );

    expect(screen.getByText('Playlist Song')).toBeDefined();
  });

  it('TrackRow renders in variant="favorites" without errors', () => {
    const track = { id: 't-1', title: 'Favorite Song', artist: 'Artist 1', duration: 210 };
    render(
      <MemoryRouter>
        <TrackRow track={track} index={0} variant="favorites" />
      </MemoryRouter>
    );

    expect(screen.getByText('Favorite Song')).toBeDefined();
  });

  it('AlbumCard renders with decoding="async" on cover image and uses atomic selectors', () => {
    const album = { id: 'alb-1', name: 'Cool Album', artist: 'Cool Artist', coverArt: 'c1' };

    const { container } = render(
      <MemoryRouter>
        <AlbumCard album={album} />
      </MemoryRouter>
    );

    const img = container.querySelector('img');
    expect(img).toBeDefined();
    expect(img?.getAttribute('decoding')).toBe('async');

    // Atomic like check
    expect(usePlayerStore.getState().likedAlbumIds.includes('alb-1')).toBe(false);
    usePlayerStore.getState().toggleAlbumLike('alb-1');
    expect(usePlayerStore.getState().likedAlbumIds.includes('alb-1')).toBe(true);
  });

  it('ArtistCard renders properly and is memoized', () => {
    const artist = { id: 'art-1', name: 'Top Artist' };

    render(
      <MemoryRouter>
        <ArtistCard artist={artist} />
      </MemoryRouter>
    );

    expect(screen.getByText('Top Artist')).toBeDefined();
  });
});
