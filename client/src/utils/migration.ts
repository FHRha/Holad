import { useSettingsStore } from '../store/settingsStore';
import { usePlayerStore } from '../store/playerStore';
import { useHistoryStore } from '../store/historyStore';
import { useDownloadStore } from '../store/downloadStore';
import { savePlayQueue } from '../api/subsonic';

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
    const trackIds = state.queue.map(t => t.id);
    const currentTrack = state.queue[state.currentIndex];
    const currentTime = localStorage.getItem('holad_time');
    
    if (currentTrack && trackIds.length > 0) {
      const pos = currentTime ? Math.floor(parseFloat(currentTime) * 1000) : 0;
      savePlayQueue(trackIds, currentTrack.id, pos).catch(console.error);
    }
  }
};
