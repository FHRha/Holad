import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Track } from './playerStore';

export interface PlayHistoryEntry extends Track {
  playedAt: number; // timestamp
}

interface HistoryState {
  history: PlayHistoryEntry[];
  addTrackToHistory: (track: Track, customPlayedAt?: number) => void;
  syncHistoryData: (entries: PlayHistoryEntry[]) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      history: [],
      addTrackToHistory: (track, customPlayedAt) => {
        set((state) => {
          const now = customPlayedAt || Date.now();
          
          // Prevent duplicate logging if the same track was added less than 5 minutes ago
          const lastEntry = state.history[0];
          if (lastEntry && lastEntry.id === track.id && (now - lastEntry.playedAt) < 5 * 60 * 1000) {
             return state;
          }

          const newEntry: PlayHistoryEntry = {
            ...track,
            playedAt: now,
          };

          // Keep up to 5000 recent plays
          const newHistory = [newEntry, ...state.history].slice(0, 5000);
          
          return { history: newHistory };
        });
      },
      syncHistoryData: (entries) => {
        set((state) => {
          const merged = [...state.history, ...entries];
          // deduplicate by playedAt + id
          const uniqueMap = new Map<string, PlayHistoryEntry>();
          merged.forEach(e => {
            uniqueMap.set(`${e.id}-${e.playedAt}`, e);
          });
          const newHistory = Array.from(uniqueMap.values())
            .sort((a, b) => b.playedAt - a.playedAt)
            .slice(0, 5000);
          
          return { history: newHistory };
        });
      },
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'streamnavi-history',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// --- Analytical Helper Functions ---

export function getFilteredHistory(history: PlayHistoryEntry[], days: number | null): PlayHistoryEntry[] {
  if (days === null) return history;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter(h => h.playedAt >= cutoff);
}

export function calculateStats(history: PlayHistoryEntry[]) {
  let totalListeningSeconds = 0;
  const artistCounts = new Map<string, number>();
  const trackCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();
  
  // Helper maps for case-insensitive tracking
  const artistCaseMap = new Map<string, string>(); // lowercase -> original case
  const dailyPlays = new Map<string, number>();

  history.forEach(entry => {
    totalListeningSeconds += entry.duration || 0;
    
    // Top Artist
    if (entry.artist) {
      const artistParts = entry.artist.split(/\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s*&\s*|\s+x\s+/i)
        .map(p => p.trim())
        .filter(p => p.length > 0);
        
      artistParts.forEach((part, index) => {
        const lowerPart = part.toLowerCase();
        // Remember original case if not seen
        if (!artistCaseMap.has(lowerPart)) {
          artistCaseMap.set(lowerPart, part);
        }
        
        // Use lowercase for counts to merge them
        const artistKey = (index === 0 && entry.artistId) ? `${entry.artistId}|||${lowerPart}` : lowerPart;
        artistCounts.set(artistKey, (artistCounts.get(artistKey) || 0) + 1);
      });
    }
    
    // Top Track
    const trackKey = `${entry.id}|||${entry.title}|||${entry.artist}|||${entry.coverArt}`;
    trackCounts.set(trackKey, (trackCounts.get(trackKey) || 0) + 1);

    // Top Album
    if (entry.album) {
      let existingKey = '';
      if (entry.albumId) {
         existingKey = Array.from(albumCounts.keys()).find(k => k.startsWith(`${entry.albumId}|||`)) || '';
      }
      if (!existingKey) {
         existingKey = `${entry.albumId}|||${entry.album}|||${entry.artist}|||${entry.coverArt}`;
      }
      albumCounts.set(existingKey, (albumCounts.get(existingKey) || 0) + 1);
    }
    
    // Daily tracking for streaks
    const dateStr = new Date(entry.playedAt).toISOString().split('T')[0];
    dailyPlays.set(dateStr, (dailyPlays.get(dateStr) || 0) + 1);
  });

  const getTop = (map: Map<string, number>, limit = 5) => {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => ({ key, count }));
  };

  const getTopArtists = (limit = 5) => {
    return Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => {
        // Restore original case
        let restoredKey = key;
        if (key.includes('|||')) {
          const [id, name] = key.split('|||');
          restoredKey = `${id}|||${artistCaseMap.get(name) || name}`;
        } else {
          restoredKey = artistCaseMap.get(key) || key;
        }
        return { key: restoredKey, count };
      });
  };

  // Calculate Streak
  let streak = 0;
  let currentDate = new Date();
  
  while (true) {
    const dStr = currentDate.toISOString().split('T')[0];
    if (dailyPlays.has(dStr)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (streak === 0 && dailyPlays.has(new Date(Date.now() - 86400000).toISOString().split('T')[0])) {
      // If no plays today, but played yesterday, streak is still alive from yesterday
      streak++;
      currentDate.setDate(currentDate.getDate() - 2); // go back another day since we already counted yesterday
    } else {
      break;
    }
  }

  return {
    totalPlays: history.length,
    totalListeningSeconds,
    uniqueArtists: artistCounts.size,
    streak,
    topArtists: getTopArtists(50),
    topTracks: getTop(trackCounts, 50),
    topAlbums: getTop(albumCounts, 50)
  };
}
