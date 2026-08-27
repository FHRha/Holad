import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getPlaylists, createPlaylist, updatePlaylist, getPlaylist, deletePlaylist } from '../api/subsonic';

export function useBookmark(trackId: string | undefined) {
  const { t } = useTranslation();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkPlaylistId, setBookmarkPlaylistId] = useState<string | null>(null);

  useEffect(() => {
    if (!trackId) return;
    const checkBookmark = async () => {
      try {
        const playlists = await getPlaylists();
        const playlistName = t('player.bookmarksPlaylist', 'Отложенное');
        const bookmarkNames = ['Отложенное', 'Bookmarks', playlistName];
        const bookmarkPlaylist = playlists?.find((p: any) => bookmarkNames.includes(p.name));
        if (bookmarkPlaylist) {
          setBookmarkPlaylistId(bookmarkPlaylist.id);
          const fullPlaylist = await getPlaylist(bookmarkPlaylist.id);
          const tracks = fullPlaylist?.entry || [];
          setIsBookmarked(tracks.some((t: any) => t.id === trackId));
        } else {
          setIsBookmarked(false);
          setBookmarkPlaylistId(null);
        }
      } catch (e) {
        console.error("Failed to check bookmarks:", e);
      }
    };
    checkBookmark();
  }, [trackId, t]);

  const toggleBookmark = async () => {
    if (!trackId) return;
    const playlistName = t('player.bookmarksPlaylist', 'Отложенное');
    try {
      if (!bookmarkPlaylistId) {
        const success = await createPlaylist(playlistName, trackId);
        if (success) {
          const playlists = await getPlaylists();
          const p = playlists?.find((x: any) => x.name === playlistName);
          if (p) {
            setBookmarkPlaylistId(p.id);
            setIsBookmarked(true);
          }
        }
      } else {
        if (isBookmarked) {
          const fullPlaylist = await getPlaylist(bookmarkPlaylistId);
          const tracks = fullPlaylist?.entry || [];
          const index = tracks.findIndex((t: any) => t.id === trackId);
          if (index !== -1) {
            await updatePlaylist(bookmarkPlaylistId, undefined, index);
            setIsBookmarked(false);
            if (tracks.length === 1) {
              await deletePlaylist(bookmarkPlaylistId);
              setBookmarkPlaylistId(null);
            }
          }
        } else {
          await updatePlaylist(bookmarkPlaylistId, trackId);
          setIsBookmarked(true);
        }
      }
    } catch (e) {
      console.error("Failed to toggle bookmark:", e);
    }
  };

  return { isBookmarked, toggleBookmark };
}
