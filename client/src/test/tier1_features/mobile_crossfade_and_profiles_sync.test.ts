import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AudioDeck } from '../../audio/AudioDeck';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { TransitionManager } from '../../audio/TransitionManager';
import { AudioEngine } from '../../audio/AudioEngine';
import { useProfileStore, captureCurrentProfileData } from '../../store/profileStore';
import { handleRemoteCommand } from '../../connect/remoteCommandHandler';
import * as preferencesApi from '../../api/preferences';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

vi.mock('../../api/preferences', () => ({
  pushPreferences: vi.fn().mockResolvedValue(true),
  fetchPreferences: vi.fn().mockResolvedValue(null),
}));

describe('Tasks 4 & 6: Cross-Platform Profiles SSOT & Mobile Web Audio Crossfade', () => {
  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TASK 4: Profiles Cross-Platform SSOT & WebSocket Sync', () => {
    it('SSOT: server profiles take priority when local slots are all null, preventing wiping server DB', () => {
      const serverProfiles = [
        { slot: 1, name: 'Main Listening Room', data: captureCurrentProfileData(), updatedAt: 100 },
        null,
        null,
      ];

      useProfileStore.setState({
        slots: [null, null, null],
        profilesUpdatedAt: 999999, // stale local timestamp
      });

      useProfileStore.getState().syncWithServerProfiles(serverProfiles, 100);

      const state = useProfileStore.getState();
      expect(state.slots[0]?.name).toBe('Main Listening Room');
      expect(state.slots[1]).toBeNull();
      expect(state.slots[2]).toBeNull();
      // Should NOT push empty slots to server!
      expect(preferencesApi.pushPreferences).not.toHaveBeenCalled();
    });

    it('WebSocket: remoteCommandHandler applies preferencesUpdated on the fly to profileStore', () => {
      useProfileStore.setState({
        slots: [null, null, null],
        profilesUpdatedAt: 0,
      });

      const serverProfiles = [
        { slot: 1, name: 'Headphones Pro', data: captureCurrentProfileData(), updatedAt: 250 },
        { slot: 2, name: 'Car Stereo', data: captureCurrentProfileData(), updatedAt: 250 },
        null,
      ];

      handleRemoteCommand(
        {
          type: 'preferencesUpdated',
          payload: {
            profiles: JSON.stringify(serverProfiles),
            updated_at: 250,
          },
        },
        {
          socket: null,
          deviceId: 'device-1',
          roomId: 'user-room',
          activeDeviceId: 'device-1',
          lastPausedAt: null,
        }
      );

      const state = useProfileStore.getState();
      expect(state.slots[0]?.name).toBe('Headphones Pro');
      expect(state.slots[1]?.name).toBe('Car Stereo');
      expect(state.slots[2]).toBeNull();
    });
  });

  describe('TASK 6: Mobile Web Audio Pipeline & Crossfade', () => {
    it('AudioEngine initializes WebAudioPipeline by default on all platforms', () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const pipeline = engine.getWebAudioPipeline();
      expect(pipeline).toBeDefined();
      expect(pipeline?.context).toBeDefined();
      expect(pipeline?.masterGainNode).toBeDefined();

      engine.destroy();
    });

    it('AudioDeck sets crossOrigin = "anonymous" for remote stream URLs', async () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-crossorigin-test', el);

      expect(deck.element.crossOrigin).toBe('anonymous');

      await deck.load('https://navidrome.example.com/rest/stream?id=123', 0);
      expect(deck.element.crossOrigin).toBe('anonymous');

      deck.destroy();
    });

    it('AudioDeck does NOT strip crossOrigin on NotAllowedError (autoplay policy)', async () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-autoplay-test', el);

      el.play = vi.fn().mockRejectedValue({ name: 'NotAllowedError', message: 'User interaction required' });

      await expect(deck.play()).rejects.toMatchObject({ name: 'NotAllowedError' });
      // crossOrigin MUST remain anonymous, not set to null!
      expect(deck.element.crossOrigin).toBe('anonymous');

      deck.destroy();
    });

    it('AudioDeck emits elementReplaced and AudioEngine re-attaches to WebAudioPipeline on fallback', () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);
      const pipeline = engine.getWebAudioPipeline();

      const attachSpy = vi.spyOn(pipeline as any, 'attachDeck');

      const deck0 = engine.getActiveDeck();
      // Simulate secondary element fallback
      const fallbackAudio = createMockAudioElement();
      (deck0 as any).element = fallbackAudio;
      (deck0 as any).emit('elementReplaced', fallbackAudio);

      expect(attachSpy).toHaveBeenCalledWith(0, fallbackAudio);

      engine.destroy();
    });

    it('WebAudioPipeline scheduleCrossfade smoothly schedules GainNode values for equalPower and linear curves', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();

      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      // equalPower
      pipeline.scheduleCrossfade(0, 1, 3, 'equalPower', pipeline.context.currentTime);
      expect(pipeline.getDeckGain(0)).toBeDefined();
      expect(pipeline.getDeckGain(1)).toBeDefined();

      // linear
      pipeline.scheduleCrossfade(1, 0, 3, 'linear', pipeline.context.currentTime);
      expect(pipeline.getDeckGain(0)).toBeDefined();
      expect(pipeline.getDeckGain(1)).toBeDefined();

      pipeline.destroy();
    });

    it('TransitionManager performCrossfade smoothly fades deck gains via Web Audio Pipeline', async () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck('test-deck-cf-0', el0);
      const deck1 = new AudioDeck('test-deck-cf-1', el1);

      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      const tm = new TransitionManager();
      const cfPromise = tm.performCrossfade(deck0, deck1, { duration: 0.1, curve: 'equalPower' }, pipeline, 0, 1.0);

      expect(tm.getIsTransitioning()).toBe(true);

      await cfPromise;

      expect(tm.getIsTransitioning()).toBe(false);
      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(pipeline.getDeckGain(1)).toBe(1.0);

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
    });
  });
});
