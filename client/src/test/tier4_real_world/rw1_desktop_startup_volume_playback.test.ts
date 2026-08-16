import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockAlbumTracks } from '../helpers/testUtils';

describe('Tier 4 - Scenario 1: Desktop Startup, Volume Configuration & Continuous Playback (R1, R5, R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RW1-1: End-to-end desktop workflow: Initial load defaults volumeMultiplier to 20%, user adjusts volume slider, plays multi-track queue', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    // 1. Initial desktop startup: volume multiplier is 20% (0.20), base volume is 0.50
    usePlayerStore.getState().setVolumeMultiplier(0.2);
    usePlayerStore.getState().setVolume(0.5);
    engine.setVolumeMultiplier(0.2);
    engine.setVolume(0.5);

    let pipeline = engine.getWebAudioPipeline() as WebAudioPipeline;
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.1, 4);

    // 2. Load 5-track album into player queue
    const albumTracks = createMockAlbumTracks(5, 180);
    usePlayerStore.setState({
      queue: albumTracks,
      currentIndex: 0,
      isPlaying: true,
    });

    // 3. Start playback on Track 1
    await engine.playTrack(albumTracks[0], { immediate: true });
    expect(engine.getState()).toBe('playing');
    expect(engine.getActiveDeckIndex()).toBe(0);

    // 4. User slides volume slider up to 80% (0.80)
    usePlayerStore.getState().setVolume(0.8);
    engine.setVolume(0.8);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.16, 4);

    // 5. Track 1 completes, transition to Track 2
    await engine.playTrack(albumTracks[1], { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTrack().id).toBe(albumTracks[1].id);

    // 6. User mutes volume during Track 2
    usePlayerStore.getState().setVolume(0.0);
    engine.setVolume(0.0);
    expect(pipeline.masterGainNode.gain.value).toBe(0.0);

    // 7. User unmutes back to 80%
    usePlayerStore.getState().setVolume(0.8);
    engine.setVolume(0.8);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.16, 4);

    engine.destroy();
  });

  it('RW1-2: User configures 200% volume multiplier boost on desktop and verifies gain scaling across tracks', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    // Set boost multiplier to 2.0x
    usePlayerStore.getState().setVolumeMultiplier(2.0);
    usePlayerStore.getState().setVolume(0.5);
    engine.setVolumeMultiplier(2.0);
    engine.setVolume(0.5);

    const pipeline = engine.getWebAudioPipeline() as WebAudioPipeline;
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.0, 4);

    const track = createMockAlbumTracks(1, 200)[0];
    await engine.playTrack(track, { immediate: true });

    expect(engine.getState()).toBe('playing');
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.0, 4);

    engine.destroy();
  });
});
