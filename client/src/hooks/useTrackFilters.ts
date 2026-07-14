import { useState, useMemo } from 'react';
import { usePlayerStore } from '../store/playerStore';

export function useTrackFilters(tracks: any[], globalArtists: any[]) {
  const [filterLiked, setFilterLiked] = useState<'all' | 'yes' | 'no'>('all');
  const [filterRated, setFilterRated] = useState<'all' | 'yes' | 'no'>('all');
  const [artistSearch, setArtistSearch] = useState('');
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
  const { likedTrackIds } = usePlayerStore();

  const allArtists = useMemo(() => {
    const artistMap = new Map<string, { id: string, name: string }>();
    
    globalArtists.forEach(a => {
      if (a.name && a.id) {
        artistMap.set(a.name.toLowerCase(), { id: a.id, name: a.name });
      }
    });

    tracks.forEach(t => {
      if (t.artist) {
        const parts = t.artist.split(/\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+/i);
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

  const filteredArtists = allArtists.filter(a => a.name.toLowerCase().includes(artistSearch.toLowerCase()));

  const filteredTracks = useMemo(() => {
    return tracks.filter(t => {
      const isLiked = likedTrackIds.includes(t.id);
      if (filterLiked === 'yes' && !isLiked) return false;
      if (filterLiked === 'no' && isLiked) return false;
      
      const isRated = (t.userRating || 0) > 0;
      if (filterRated === 'yes' && !isRated) return false;
      if (filterRated === 'no' && isRated) return false;

      if (selectedArtists.size > 0) {
        if (!t.artist) return false;
        const parts = t.artist.split(/\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+/i).map((p: string) => p.trim().toLowerCase());
        const selectedLower = Array.from(selectedArtists).map(s => s.toLowerCase());
        const hasSelected = parts.some((p: string) => selectedLower.includes(p));
        if (!hasSelected) return false;
      }

      return true;
    });
  }, [tracks, filterLiked, filterRated, selectedArtists, likedTrackIds]);

  const toggleArtist = (artist: string) => {
    const newSet = new Set(selectedArtists);
    if (newSet.has(artist)) newSet.delete(artist);
    else newSet.add(artist);
    setSelectedArtists(newSet);
  };

  return {
    filterLiked,
    setFilterLiked,
    filterRated,
    setFilterRated,
    artistSearch,
    setArtistSearch,
    selectedArtists,
    setSelectedArtists,
    allArtists,
    filteredArtists,
    filteredTracks,
    toggleArtist
  };
}
