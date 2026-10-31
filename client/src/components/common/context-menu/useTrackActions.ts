import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePlayerStore } from '../../../store/playerStore';
import type { Track } from '../../../store/playerStore';
import { useDownloadStore, isItemDownloaded, getOfflineTracks } from '../../../store/downloadStore';
import { usePlaylistStore, syncCustomPlaylistToServer } from '../../../store/playlistStore';
import { getAlbum, getCoverArtUrl, starItem, unstarItem, setItemRating } from '../../../api/subsonic';
import { updatePlaylist } from '../../../api/subsonic/playlists';
import { getShareUrl } from '../../../utils/serverConfig';
import { handleDownload, deleteDownloadedItem } from '../../../utils/downloadHelper';
import { jamSocket } from '../../../api/socket';
import { isTrackExcluded } from '../../../utils/trackFingerprint';
import { isJamPath } from '../../../utils/basePath';

export interface UseTrackActionsParams {
  item: any;
  type: string;
  closeMenu: () => void;
  isOpen: boolean;
}

export function useTrackActions({
  item,
  type,
  closeMenu,
  isOpen
}: UseTrackActionsParams) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    setQueueAndPlay,
    playNext,
    addToQueue,
    queue,
    setQueue,
    likedTrackIds,
    likedAlbumIds,
    toggleTrackLike,
    toggleAlbumLike,
    role,
    toggleTrackExclude,
    toggleAlbumExclude,
    excludedTrackIds,
    excludedAlbumIds,
    excludedFingerprints,
    roomId
  } = usePlayerStore();

  const isJamActive = roomId !== null;
  const isJamRoute = isJamPath();
  const isGuest = isJamRoute && role !== 'host';

  const [rating, setRating] = useState(0);
  const [isCopied, setIsCopied] = useState(false);

  const { downloads } = useDownloadStore();

  useEffect(() => {
    if (isOpen && item) {
      setRating(item.userRating || 0);
    }
  }, [isOpen, item]);

  const isAlbum = type === 'album';
  const isLiked = isAlbum
    ? (likedAlbumIds || []).includes(item?.id)
    : (likedTrackIds || []).includes(item?.id);
  const isInQueue = !isAlbum && (queue || []).some((t: Track) => t?.id === item?.id);
  const isDownloaded = item ? isItemDownloaded(downloads, item.id, item.albumId, item) : false;

  const handleAction = async (action: () => void | Promise<void>, shouldClose = true) => {
    try {
      await action();
    } catch (e) {
      console.error(e);
    }
    if (shouldClose) closeMenu();
  };

  const getTracks = async (): Promise<Track[]> => {
    if (!item) return [];
    if (!isAlbum) return [item as Track];
    const tracks = await getAlbum(item.id);
    return tracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt, 300),
      duration: t.duration,
      bitRate: t.bitRate,
      suffix: t.suffix
    }));
  };

  const onPlayNow = async () => {
    const tracks = await getTracks();
    setQueueAndPlay(tracks, 0);
  };

  const onPlayNext = async () => {
    const tracks = await getTracks();
    playNext(tracks);
    const state = usePlayerStore.getState();
    if (state.roomId) {
      jamSocket.emit('syncQueue', {
        roomId: state.roomId,
        queue: state.queue,
        currentIndex: state.currentIndex
      });
    }
  };

  const onAddToQueue = async () => {
    const tracks = await getTracks();
    addToQueue(tracks);
    const state = usePlayerStore.getState();
    if (state.roomId) {
      jamSocket.emit('syncQueue', {
        roomId: state.roomId,
        queue: state.queue,
        currentIndex: state.currentIndex
      });
    }
  };

  const onRemoveFromQueue = () => {
    if (item && item.queueIndex !== undefined) {
      const newQueue = [...queue];
      newQueue.splice(item.queueIndex, 1);
      setQueue(newQueue);
    }
  };

  const onLike = () => {
    if (!item) return;
    if (isAlbum) {
      toggleAlbumLike(item.id);
      if (isLiked) unstarItem(item.id, true);
      else starItem(item.id, true);
    } else {
      toggleTrackLike(item.id);
      if (isLiked) unstarItem(item.id);
      else starItem(item.id);
    }
  };

  const isExcluded = isAlbum 
    ? (excludedAlbumIds || []).includes(item?.id) 
    : isTrackExcluded(item, excludedTrackIds, excludedAlbumIds, excludedFingerprints);

  const onExclude = () => {
    if (!item) return;
    if (isAlbum) {
      toggleAlbumExclude(item.id, { album: item.name || item.title, artist: item.artist });
      const state = usePlayerStore.getState();
      const currentTrack = state.queue[state.currentIndex];
      if (!isExcluded && currentTrack?.albumId === item.id) {
        state.nextTrack();
      }
    } else {
      toggleTrackExclude(item.id, item);
      const state = usePlayerStore.getState();
      const currentTrack = state.queue[state.currentIndex];
      if (!isExcluded && currentTrack?.id === item.id) {
        state.nextTrack();
      }
    }
  };

  const onRate = (val: number) => {
    if (!item) return;
    const newRating = rating === val ? 0 : val;
    setRating(newRating);
    setItemRating(item.id, newRating);
    window.dispatchEvent(
      new CustomEvent('rating-updated', { detail: { id: item.id, rating: newRating } })
    );
  };

  const onDownload = () => {
    if (!item) return;
    handleDownload(item.id, item.title || item.name || 'download', type === 'album' ? 'album' : 'track');
    closeMenu();
  };

  const onRemoveDownload = async () => {
    if (!item) return;
    let downloadId = item.id;
    let dlItem = downloads[downloadId];
    
    if (!dlItem && item.albumId && downloads[item.albumId]) {
      downloadId = item.albumId;
      dlItem = downloads[downloadId];
    }
    
    if (dlItem) {
      await deleteDownloadedItem(dlItem);
    }
    closeMenu();
  };

  const onShare = () => {
    if (!item) return;
    const shareUrl = type === 'album' 
      ? `${getShareUrl()}/jam/?album=${item.id}` 
      : `${getShareUrl()}/jam/?track=${item.id}`;
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSharePlaylist = async (playlistItem: any) => {
    try {
      const customPl = usePlaylistStore.getState().playlists.find(p => p.id === playlistItem.id);
      if (customPl) {
        const offlineTracks = getOfflineTracks();
        const trackIds = (customPl.trackIds || []).slice(0, 200);
        const tracks = trackIds.map(tid => offlineTracks.find(t => t.id === tid)).filter(Boolean);
        await syncCustomPlaylistToServer({
          id: customPl.id,
          name: customPl.name,
          description: customPl.description || '',
          trackIds,
          tracks: tracks.length > 0 ? tracks : undefined
        });
      } else {
        try {
          const { getPlaylist } = await import('../../../api/subsonic/playlists');
          const plData = await getPlaylist(playlistItem.id);
          if (plData) {
            const songs = Array.isArray(plData.entry) ? plData.entry.slice(0, 200) : (plData.entry ? [plData.entry] : []);
            const trackIds = songs.map((s: any) => s.id).filter(Boolean);
            const mappedTracks = songs.map((s: any) => ({
              id: s.id,
              title: s.title || s.name,
              artist: s.artist,
              album: s.album,
              albumId: s.albumId,
              coverArt: getCoverArtUrl(s.coverArt || s.albumId || s.id, 300),
              duration: s.duration,
              bitRate: s.bitRate,
              suffix: s.suffix
            }));
            await syncCustomPlaylistToServer({
              id: playlistItem.id,
              name: plData.name || playlistItem.name || 'Shared Playlist',
              description: plData.comment || '',
              trackIds,
              tracks: mappedTracks
            });
          }
        } catch (err) {
          console.warn('Could not snapshot Subsonic playlist to server:', err);
        }
      }
    } catch (err) {
      console.warn('Failed to sync shared playlist snapshot:', err);
    }
    const shareUrl = `${getShareUrl()}/jam/?playlist=${playlistItem.id}`;
    await navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDeletePlaylist = async (playlistItem: any) => {
    if (!window.confirm(t('common.delete_playlist_confirm', 'Вы уверены, что хотите удалить плейлист?'))) {
      return;
    }
    try {
      const playlistIdStr = String(playlistItem?.id || '');
      const isCustom = Boolean(
        playlistItem?.isCustom ||
        playlistIdStr.startsWith('custom_') ||
        usePlaylistStore.getState().playlists.some(p => String(p.id) === playlistIdStr)
      );
      if (isCustom) {
        usePlaylistStore.getState().deletePlaylist(playlistItem.id);
      } else {
        const { deletePlaylist } = await import('../../../api/subsonic/playlists');
        await deletePlaylist(playlistItem.id);
      }
      window.dispatchEvent(new CustomEvent('playlists-updated'));
      if (window.location.pathname.includes(playlistItem.id)) {
        navigate('/playlists', { replace: true });
      }
      toast.success(t('common.playlist_deleted', 'Плейлист удален'));
    } catch (e: any) {
      console.error('Failed to delete playlist:', e);
      let errMsg = t('common.error_deleting_playlist', 'Не удалось удалить плейлист');
      if (e && typeof e.message === 'string' && e.message.trim() && e.message !== 'undefined') {
        errMsg = e.message;
      } else if (typeof e === 'string' && e.trim() && e !== 'undefined') {
        errMsg = e;
      }
      toast.error(errMsg);
    } finally {
      closeMenu();
    }
  };

  const handleRemoveFromPlaylist = async () => {
    if (!item) return;
    try {
      if (item.isCustomPlaylist) {
        usePlaylistStore.getState().removeTrack(item.playlistId, item.id);
      } else {
        await updatePlaylist(item.playlistId, undefined, item.playlistIndex);
      }
      window.dispatchEvent(new CustomEvent('playlists-updated'));
      closeMenu();
    } catch (err) {
      console.error(err);
    }
  };

  return {
    rating,
    isCopied,
    isAlbum,
    isLiked,
    isInQueue,
    isDownloaded,
    isExcluded,
    isJamActive,
    isGuest,
    getTracks,
    handleAction,
    onPlayNow,
    onPlayNext,
    onAddToQueue,
    onRemoveFromQueue,
    onLike,
    onExclude,
    onRate,
    onDownload,
    onRemoveDownload,
    onShare,
    handleSharePlaylist,
    handleDeletePlaylist,
    handleRemoveFromPlaylist,
    navigate
  };
}
