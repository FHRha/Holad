import { useState, useEffect } from 'react';
import { getPlaylists, createPlaylist, updatePlaylistTracks } from '../../../api/subsonic/playlists';
import { usePlaylistStore } from '../../../store/playlistStore';
import { networkManager } from '../../../utils/networkStatus';
import type { Track } from '../../../store/playerStore';

export interface UseContextMenuPlaylistsParams {
  isOpen: boolean;
  item: any;
  isAlbum: boolean;
  getTracks: () => Promise<Track[]>;
  closeMenu: () => void;
}

export function useContextMenuPlaylists({
  isOpen,
  item,
  isAlbum,
  getTracks,
  closeMenu
}: UseContextMenuPlaylistsParams) {
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [modalTrackIds, setModalTrackIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && item) {
      setShowPlaylists(false);
      setNewPlaylistName('');
    }
  }, [isOpen, item]);

  const onShowPlaylists = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowPlaylists(true);
    const customPlaylists = usePlaylistStore.getState().playlists;
    const mappedCustomPlaylists = customPlaylists.map(cp => ({
      id: cp.id,
      name: cp.name,
      songCount: cp.trackIds.length,
      coverArt: cp.trackIds.length > 0 ? cp.trackIds[0] : null,
      isCustom: true
    }));
    
    try {
      if (!networkManager.isOnline()) {
        setPlaylists(mappedCustomPlaylists);
        return;
      }
      const list = await getPlaylists();
      setPlaylists([...mappedCustomPlaylists, ...(list || [])]);
    } catch (err) {
      console.error(err);
      setPlaylists(mappedCustomPlaylists);
    }
  };

  const handleCreatePlaylistInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      if (!networkManager.isOnline()) {
        const newId = usePlaylistStore.getState().createPlaylist(newPlaylistName.trim());
        await handleAddToPlaylist(newId, true);
        return;
      }
      
      await createPlaylist(newPlaylistName.trim());
      const updated = await getPlaylists();
      
      const customPlaylists = usePlaylistStore.getState().playlists;
      const mappedCustomPlaylists = customPlaylists.map(cp => ({
        id: cp.id,
        name: cp.name,
        songCount: cp.trackIds.length,
        coverArt: cp.trackIds.length > 0 ? cp.trackIds[0] : null,
        isCustom: true
      }));
      setPlaylists([...mappedCustomPlaylists, ...(updated || [])]);
      
      const created = updated.find(p => p.name === newPlaylistName.trim());
      if (created) {
        await handleAddToPlaylist(created.id, false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddToPlaylist = async (playlistId: string, isCustomOverride?: boolean) => {
    try {
      const tracks = await getTracks();
      const ids = tracks.map(t => t.id);
      
      const playlist = playlists.find(p => p.id === playlistId);
      const isCustom = isCustomOverride ?? playlist?.isCustom;
      
      if (isCustom) {
        ids.forEach(id => {
          usePlaylistStore.getState().addTrack(playlistId, id);
        });
      } else {
        await updatePlaylistTracks(playlistId, ids);
      }
      window.dispatchEvent(new CustomEvent('playlists-updated'));
      closeMenu();
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenPlaylistModal = async () => {
    try {
      if (isAlbum) {
        const tracks = await getTracks();
        setModalTrackIds(tracks.map(t => t.id));
      } else {
        setModalTrackIds([item.id]);
      }
      setIsPlaylistModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClosePlaylistModal = () => {
    setIsPlaylistModalOpen(false);
    closeMenu();
  };

  return {
    showPlaylists,
    setShowPlaylists,
    playlists,
    isPlaylistModalOpen,
    newPlaylistName,
    setNewPlaylistName,
    modalTrackIds,
    onShowPlaylists,
    handleCreatePlaylistInline,
    handleAddToPlaylist,
    handleOpenPlaylistModal,
    handleClosePlaylistModal
  };
}
