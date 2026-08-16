import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockAlbumTracks } from '../helpers/testUtils';

describe('Tier 4 - Scenario 5: Dynamic Range Normalization Session with Compressor (R3, R4, R7)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RW5-1: Full album listening session with loudness normalization compressor active across crossfading tracks', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    // Enable loudness normalization and 1s crossfade
    engine.updateSettings({
      isLoudnessNormalizationEnabled: true,
      isCrossfadeEnabled: true,
      crossfadeDuration: 1,
    });
    engine.setVolume(0.8);
    engine.setVolumeMultiplier(0.2); // Desktop default multiplier

    const album = createMockAlbumTracks(4, 180);

    // 1. Play Track 1 (Intro Track)
    await engine.playTrack(album[0], { immediate: true });
    expect(engine.getState()).toBe('playing');
    expect(engine.getActiveDeckIndex()).toBe(0);

    let pipeline = engine.getWebAudioPipeline() as WebAudioPipeline;
    expect(pipeline.compressorNode.connectedTo).toContain(pipeline.masterGainNode);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.16, 4);

    // 2. Crossfade to Track 2 (High energy track)
    await engine.playTrack(album[1], { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTrack().id).toBe(album[1].id);

    // 3. Crossfade to Track 3 (Acoustic ballad)
    await engine.playTrack(album[2], { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(0);
    expect(engine.getCurrentTrack().id).toBe(album[2].id);

    // 4. Crossfade to Track 4 (Outro)
    await engine.playTrack(album[3], { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTrack().id).toBe(album[3].id);

    // Verify audio graph remained unbroken and compressor remained in chain
    expect(pipeline.compressorNode.connectedTo).toContain(pipeline.masterGainNode);

    engine.destroy();
  });

  it('RW5-2: User toggles normalization on and off during multi-song playback without interrupting active deck', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track = createMockAlbumTracks(1, 200)[0];
    await engine.playTrack(track, { immediate: true });

    // Toggle off
    engine.updateSettings({ isLoudnessNormalizationEnabled: false });
    expect(engine.getState()).toBe('playing');

    // Toggle back on
    engine.updateSettings({ isLoudnessNormalizationEnabled: true });
    expect(engine.getState()).toBe('playing');

    engine.destroy();
  });
});
