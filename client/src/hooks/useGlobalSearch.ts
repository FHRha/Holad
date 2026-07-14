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
  const { isSearchOpen, setSearchOpen } = useUIStore();
  const { setQueueAndPlay, roomId } = usePlayerStore();
  const navigate = useNavigate();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{song: any[], album: any[], artist: any[]}>({ song: [], album: [], artist: [] });
  const [loading, setLoading] = useState(false);
  const [showSession, setShowSession] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setShowSession(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSearchOpen, inputRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (sessionRef.current && !sessionRef.current.contains(e.target as Node)) {
        setShowSession(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [setSearchOpen, containerRef, sessionRef]);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen, inputRef]);

  useEffect(() => {
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
  }, [query]);

  const handlePlaySong = (song: any) => {
    setQueueAndPlay([{
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumId: song.albumId,
      coverArt: getCoverArtUrl(song.coverArt || song.id, 600),
      duration: song.duration
    }], 0);
    setSearchOpen(false);
  };

  const navigateToAlbum = (id: string) => {
    navigate(`/Holad/album/${id}`);
    setSearchOpen(false);
  };

  const navigateToArtist = (artist: any) => {
    const slug = `${encodeURIComponent(artist.name)}-${artist.id}`;
    navigate(`/Holad/artist/${slug}`);
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
