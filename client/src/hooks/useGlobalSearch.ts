import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAll, getCoverArtUrl } from '../api/subsonic';
import { useUIStore } from '../store/uiStore';
import { usePlayerStore } from '../store/playerStore';

export function useGlobalSearch(
  inputRef: React.RefObject<HTMLInputElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  sessionRef: React.RefObject<HTMLDivElement | null>
) {
  const { 
    isSearchOpen, setSearchOpen, 
    searchQuery: query, setSearchQuery: setQuery,
    searchResults: results, setSearchResults: setResults,
    isSearchLoading: loading, setSearchLoading: setLoading
  } = useUIStore();
  const { setQueueAndPlay, roomId } = usePlayerStore();
  const navigate = useNavigate();
  const [showSession, setShowSession] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (inputRef.current && inputRef.current.getBoundingClientRect().width > 0) {
          inputRef.current.focus();
          setSearchOpen(true);
        }
      }
      if (e.key === 'Escape') {
        if (inputRef.current && inputRef.current.getBoundingClientRect().width > 0) {
          setSearchOpen(false);
          setShowSession(false);
          inputRef.current.blur();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSearchOpen, inputRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Ignore if this instance is attached to a hidden input
      if (inputRef.current && inputRef.current.getBoundingClientRect().width === 0) {
        return;
      }

      const target = e.target as Node;
      // Do not close if clicking inside the mobile search overlay
      if (document.getElementById('mobile-search-overlay')?.contains(target)) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (sessionRef.current && !sessionRef.current.contains(target)) {
        setShowSession(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [setSearchOpen, containerRef, sessionRef]);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      if (inputRef.current.getBoundingClientRect().width > 0) {
        inputRef.current.focus();
      }
    }
  }, [isSearchOpen, inputRef]);

  useEffect(() => {
    // Ignore fetch if this component is hidden or not mounted
    if (!inputRef.current || inputRef.current.getBoundingClientRect().width === 0) {
      return;
    }

    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setLoading(true);
        try {
          const data = await searchAll(query);
          setResults({
            song: data.song || [],
            album: data.album || [],
            artist: data.artist || []
          });
        } catch (e) {
          console.error("Search failed", e);
        } finally {
          setLoading(false);
        }
      } else {
        setResults({ song: [], album: [], artist: [] });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, setResults, setLoading, inputRef]);

  const handlePlaySong = (song: any) => {
    setQueueAndPlay([{
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumId: song.albumId,
      artistId: song.artistId,
      coverArt: getCoverArtUrl(song.coverArt || song.id, 300),
      duration: song.duration
    }], 0);
    setSearchOpen(false);
  };

  const navigateToAlbum = (id: string) => {
    const isJam = window.location.pathname.startsWith('/jam');
    const searchParams = new URLSearchParams(window.location.search);
    const room = searchParams.get('room');
    if (isJam && room) {
      navigate(`/jam/library/album/${id}?room=${room}`);
    } else {
      navigate(`/Holad/album/${id}`);
    }
    setSearchOpen(false);
  };

  const navigateToArtist = (artist: any) => {
    const slug = `${encodeURIComponent(artist.name)}-${artist.id}`;
    const isJam = window.location.pathname.startsWith('/jam');
    const searchParams = new URLSearchParams(window.location.search);
    const room = searchParams.get('room');
    if (isJam && room) {
      navigate(`/jam/library/artist/${slug}?room=${room}`);
    } else {
      navigate(`/Holad/artist/${slug}`);
    }
    setSearchOpen(false);
  };

  return {
    query,
    setQuery,
    results,
    loading,
    isSearchOpen,
    setSearchOpen,
    showSession,
    setShowSession,
    roomId,
    handlePlaySong,
    navigateToAlbum,
    navigateToArtist
  };
}
