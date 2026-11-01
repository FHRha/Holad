import { useState, useMemo } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useDebounce } from './useDebounce';

const ARTIST_SPLIT_REGEX = /\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s*&\s*|\s+x\s+/i;

export function useTrackFilters(
  tracks: any[],
  globalArtists: any[] = [],
  globalAlbums: any[] = []
) {
  const [filterLiked, setFilterLiked] = useState<'all' | 'yes' | 'no'>('all');
  const [filterRated, setFilterRated] = useState<'all' | 'yes' | 'no'>('all');
  const [artistSearch, setArtistSearch] = useState('');
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
  const { likedTrackIds } = usePlayerStore();

  const [albumSearch, setAlbumSearch] = useState('');
  const [selectedAlbums, setSelectedAlbums] = useState<Set<string>>(new Set());

  const allArtists = useMemo(() => {
    const artistMap = new Map<string, { id: string; name: string }>();
    
    globalArtists.forEach((a: any) => {
      const name = typeof a === 'string' ? a : a?.name;
      if (name) {
        const id = typeof a === 'string' ? '' : (a.id || '');
        artistMap.set(name.toLowerCase(), { id, name });
      }
    });

    tracks.forEach((t: any) => {
      if (t.artist) {
        const parts = t.artist.split(ARTIST_SPLIT_REGEX);
        parts.forEach((p: string) => {
          const name = p.trim();
          if (name) {
            const lower = name.toLowerCase();
            if (!artistMap.has(lower)) {
              artistMap.set(lower, { id: t.artistId || '', name });
            } else {
              const existing = artistMap.get(lower)!;
              if (!existing.id && t.artistId) {
                existing.id = t.artistId;
              }
            }
          }
        });
      }
    });

    return Array.from(artistMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks, globalArtists]);

  const allAlbums = useMemo(() => {
    const albumSet = new Set<string>();

    globalAlbums.forEach((a: any) => {
      const name = typeof a === 'string' ? a : (a?.name || a?.title);
      if (name && typeof name === 'string') {
        albumSet.add(name.trim());
      }
    });

    tracks.forEach((t: any) => {
      if (t.album && typeof t.album === 'string') {
        albumSet.add(t.album.trim());
      }
    });

    return Array.from(albumSet).sort((a, b) => a.localeCompare(b));
  }, [tracks, globalAlbums]);

  const debouncedArtistSearch = useDebounce(artistSearch, 300);
  const debouncedAlbumSearch = useDebounce(albumSearch, 300);

  const filteredArtists = useMemo(() => allArtists.filter(a => a.name.toLowerCase().includes(debouncedArtistSearch.toLowerCase())), [allArtists, debouncedArtistSearch]);
  const filteredAlbums = useMemo(() => allAlbums.filter(a => a.toLowerCase().includes(debouncedAlbumSearch.toLowerCase())), [allAlbums, debouncedAlbumSearch]);

  const filteredTracks = useMemo(() => {
    return tracks.filter((t: any) => {
      const isLiked = likedTrackIds.includes(t.id);
      if (filterLiked === 'yes' && !isLiked) return false;
      if (filterLiked === 'no' && isLiked) return false;
      
      const isRated = (t.userRating || 0) > 0;
      if (filterRated === 'yes' && !isRated) return false;
      if (filterRated === 'no' && isRated) return false;

      if (selectedArtists.size > 0) {
        if (!t.artist) return false;
        const parts = t.artist.split(ARTIST_SPLIT_REGEX).map((p: string) => p.trim().toLowerCase());
        const selectedLower = Array.from(selectedArtists).map(s => s.toLowerCase());
        const hasSelected = parts.some((p: string) => selectedLower.includes(p));
        if (!hasSelected) return false;
      }

      if (selectedAlbums.size > 0) {
        if (!t.album) return false;
        const albumNameTrimmed = t.album.trim();
        const selectedAlbumsLower = Array.from(selectedAlbums).map(s => s.toLowerCase());
        if (
          !selectedAlbums.has(t.album) &&
          !selectedAlbums.has(albumNameTrimmed) &&
          !selectedAlbumsLower.includes(albumNameTrimmed.toLowerCase())
        ) {
          return false;
        }
      }

      return true;
    });
  }, [tracks, filterLiked, filterRated, selectedArtists, selectedAlbums, likedTrackIds]);

  const toggleArtist = (artist: string) => {
    const newSet = new Set(selectedArtists);
    if (newSet.has(artist)) newSet.delete(artist);
    else newSet.add(artist);
    setSelectedArtists(newSet);
  };

  const toggleAlbum = (album: string) => {
    const newSet = new Set(selectedAlbums);
    if (newSet.has(album)) newSet.delete(album);
    else newSet.add(album);
    setSelectedAlbums(newSet);
  };

  return {
    filterLiked,
    setFilterLiked,
    filterRated,
    setFilterRated,
    artistSearch,
    setArtistSearch,
    albumSearch,
    setAlbumSearch,
    selectedArtists,
    setSelectedArtists,
    selectedAlbums,
    setSelectedAlbums,
    allArtists,
    allAlbums,
    filteredArtists,
    filteredAlbums,
    filteredTracks,
    toggleArtist,
    toggleAlbum
  };
}
