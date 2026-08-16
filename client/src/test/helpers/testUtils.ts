import type { Track } from '../../types';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAudioStore } from '../../store/audioStore';
import { useHoladStore } from '../../store/holadStore';

export function createMockTrack(id: string = 'track-1', title: string = 'Test Track', duration: number = 180, artist: string = 'Test Artist'): Track {
  return {
    id,
    title,
    artist,
    album: 'Test Album',
    duration,
    streamUrl: `http://localhost:4000/stream/${id}`,
    coverArt: 'cover.jpg',
  } as Track;
}

export function createMockAlbumTracks(count: number = 5, duration: number = 180): Track[] {
  return Array.from({ length: count }, (_, i) => createMockTrack(`track-${i + 1}`, `Song ${i + 1}`, duration, 'Album Artist'));
}

export function resetAllStores(): void {
  usePlayerStore.setState({
    queue: [],
    currentIndex: 0,
    isPlaying: false,
    volume: 0.5,
    mobileVolume: 1.0,
    volumeMultiplier: 1.0,
    repeatMode: 'none',
    playbackRate: 1,
    isShuffle: false,
    isAutoDjEnabled: false,
    initialPosition: 0,
    role: undefined,
  });

  useSettingsStore.setState({
    theme: 'dark',
    accentColor: 'green',
    language: 'ru',
    clickAction: 'play_now',
    startPage: '/Holad',
    isCrossfadeEnabled: true,
    crossfadeDuration: 3,
    runOnStartup: true,
    startMinimized: true,
    closeToTray: true,
  });

  useAudioStore.setState({
    audioElement: null,
    progress: 0,
    duration: 0,
    isSeeking: false,
  });

  useHoladStore.setState({
    deviceId: 'device-test-1',
    activeDeviceId: null,
    roomId: null,
    socket: null,
  });
}
