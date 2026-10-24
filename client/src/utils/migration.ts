import { useSettingsStore } from '../store/settingsStore';
import { usePlayerStore } from '../store/playerStore';
import { useHistoryStore } from '../store/historyStore';
import { useDownloadStore } from '../store/downloadStore';
import { savePlaybackState } from '../api/playbackState';

export const migrateData = () => {
  const keysToMigrate = [
    { old: 'streamnavi-storage', new: 'holad-storage' },
    { old: 'streamnavi-settings', new: 'holad-settings' },
    { old: 'streamnavi-history', new: 'holad-history' },
    { old: 'streamnavi_track', new: 'holad_track' },
    { old: 'streamnavi_time', new: 'holad_time' },
    { old: 'streamnavi_color_cache', new: 'holad_color_cache' },
  ];

  let migratedAny = false;

  keysToMigrate.forEach(({ old, new: newKey }) => {
    const oldData = localStorage.getItem(old);
    const newData = localStorage.getItem(newKey);
    
    if (oldData && !newData) {
      localStorage.setItem(newKey, oldData);
      migratedAny = true;
    }
  });

  if (migratedAny) {
    // Rehydrate Zustand stores to pick up the newly migrated localStorage data
    useSettingsStore.persist.rehydrate();
    usePlayerStore.persist.rehydrate();
    useHistoryStore.persist.rehydrate();
    useDownloadStore.persist.rehydrate();
    
    // Trigger a sync to the backend
    const state = usePlayerStore.getState();
    const currentTrack = state.queue[state.currentIndex];
    const currentTime = localStorage.getItem('holad_time');
    
    if (currentTrack && state.queue.length > 0) {
      const pos = currentTime ? Math.round(parseFloat(currentTime)) : 0;
      savePlaybackState({
        queue: state.queue.map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: t.duration,
          coverArt: t.coverArt
        })),
        queueVersion: state.queueVersion || '',
        currentIndex: state.currentIndex >= 0 ? state.currentIndex : 0,
        songId: currentTrack.id,
        position: pos,
        isPlaying: false,
        updatedAt: Date.now()
      }).catch(console.error);
    }
  }
};
