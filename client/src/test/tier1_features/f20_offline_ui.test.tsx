import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import React, { useRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import MobileMainContent from '../../components/layout/MobileMainContent';
import { useUIStore } from '../../store/uiStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import * as trackSourceHook from '../../hooks/useTrackSource';
import { 
  isOnline, 
  isOffline, 
  isForcedOffline, 
  setForcedOffline, 
  toggleOfflineMode, 
  setNetworkStatusForTesting, 
  resetNetworkStatusForTesting,
  addNetworkListener,
  networkManager
} from '../../utils/networkStatus';
import { AudioEngine } from '../../audio/AudioEngine';

vi.mock('../../hooks/useTrackSource', () => ({
  useTrackSource: vi.fn()
}));

// Mock audio engine methods
vi.mock('../../audio/AudioEngine', () => {
  const mockPause = vi.fn();
  const mockPlayTrack = vi.fn().mockResolvedValue(undefined);
  const mockGetInstance = vi.fn().mockReturnValue({
    initialize: vi.fn(),
    updateSettings: vi.fn(),
    setVolume: vi.fn(),
    setVolumeMultiplier: vi.fn(),
    setPlaybackRate: vi.fn(),
    setLoop: vi.fn(),
    getActiveDeckIndex: vi.fn().mockReturnValue(0),
    playTrack: mockPlayTrack,
    pause: mockPause,
    resume: vi.fn().mockResolvedValue(undefined),
    getCurrentTime: vi.fn().mockReturnValue(0),
    getActiveDeck: vi.fn().mockReturnValue({ load: vi.fn().mockResolvedValue(undefined) }),
    getWebAudioPipeline: vi.fn().mockReturnValue({ unlockContext: vi.fn() }),
    on: vi.fn(),
    off: vi.fn(),
  });
  return {
    AudioEngine: {
      getInstance: mockGetInstance,
    }
  };
});

describe('Offline Bugfixes', () => {
  beforeEach(() => {
    act(() => {
      resetNetworkStatusForTesting();
      useUIStore.setState({
        activeFilter: null,
      });
      usePlayerStore.setState({
        isPlaying: false,
        queue: [],
        currentIndex: 0,
      });
    });
  });

  afterEach(() => {
    act(() => {
      resetNetworkStatusForTesting();
    });
    vi.clearAllMocks();
  });

  describe('1. MobileMainContent Offline Auto-Filter', () => {
    it('automatically switches to Downloaded filter when device goes offline', () => {
      render(
        <MemoryRouter>
          <MobileMainContent albums={[]} recentTracks={[]} frequentAlbums={[]} genres={[]} />
        </MemoryRouter>
      );

      // Initially online, filter should be null
      expect(useUIStore.getState().activeFilter).toBeNull();

      // Simulate going offline
      act(() => {
        setNetworkStatusForTesting(false);
      });

      // Filter should automatically update to Downloaded
      expect(useUIStore.getState().activeFilter).toBe('Downloaded');
    });

    it('automatically clears Downloaded/Offline filter when device goes online', () => {
      // Mount component while online first
      render(
        <MemoryRouter>
          <MobileMainContent albums={[]} recentTracks={[]} frequentAlbums={[]} genres={[]} />
        </MemoryRouter>
      );

      // Go offline
      act(() => {
        setNetworkStatusForTesting(false);
      });

      // Filter should automatically update to Downloaded
      expect(useUIStore.getState().activeFilter).toBe('Downloaded');

      // Simulate going online
      act(() => {
        setNetworkStatusForTesting(true);
      });

      // Filter should clear
      expect(useUIStore.getState().activeFilter).toBeNull();
    });
  });

  describe('2. networkStatus.ts Offline/Online Emission', () => {
    it('emits offline events correctly when toggling offline mode', () => {
      const listener = vi.fn();
      const unsubscribe = addNetworkListener(listener);

      // Explicitly start online
      act(() => {
        setNetworkStatusForTesting(true);
      });

      act(() => {
        toggleOfflineMode();
      });

      // Expected to be offline now
      expect(listener).toHaveBeenCalledWith(false);
      expect(isOffline()).toBe(true);

      act(() => {
        toggleOfflineMode();
      });

      // Expected to be online now
      expect(listener).toHaveBeenCalledWith(true);
      expect(isOffline()).toBe(false);

      unsubscribe();
    });

    it('handles native online/offline window events', () => {
      const listener = vi.fn();
      const unsubscribe = addNetworkListener(listener);

      // Enable real events by removing test status
      networkManager.resetTestingStatus();

      // Dispatch offline event
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });
      expect(listener).toHaveBeenCalledWith(false);

      // Dispatch online event
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(listener).toHaveBeenCalledWith(true);

      unsubscribe();
    });
  });

  describe('3. Audio Engine Offline Loop Prevention', () => {
    it('pauses and halts playback instead of looping when track is not available offline', () => {
      // Mock track not available offline
      vi.spyOn(trackSourceHook, 'useTrackSource').mockReturnValue({
        src: '',
        trackId: '123',
        isLocal: false,
        isLoading: false,
        isAvailable: false,
      });

      const track = { id: '123', title: 'Test Track' };

      // Set player state
      act(() => {
        usePlayerStore.setState({
          isPlaying: true,
          queue: [track],
          currentIndex: 0,
        });
      });

      const engineInstance = AudioEngine.getInstance();
      
      const TestComponent = () => {
        const audioRef0 = React.useRef(null);
        const audioRef1 = React.useRef(null);
        const audioRefs = React.useMemo(() => [audioRef0, audioRef1] as [React.RefObject<HTMLAudioElement | null>, React.RefObject<HTMLAudioElement | null>], []);
        useAudioEngine(audioRefs, track);
        return <div />;
      };

      render(<TestComponent />);

      // Engine should pause
      expect(engineInstance.pause).toHaveBeenCalled();
      
      // Store isPlaying should be set to false
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });
  });
});
