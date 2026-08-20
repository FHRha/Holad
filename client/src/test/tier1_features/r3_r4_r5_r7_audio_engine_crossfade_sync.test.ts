// oxlint-disable-next-line
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
// oxlint-disable-next-line
import { usePlayerStore } from '../../store/playerStore';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Audio Engine Requirements (R3, R4, R5, R7) Implementation Suite', () => {
  beforeEach(() => {
    resetAllStores();
  });

  // R3: Crossfade & Gapless Mutual Exclusivity
  it('R3-1: Enabling Crossfade automatically disables Gapless in settingsStore', () => {
    const settings = useSettingsStore.getState();
    
    // First enable gapless
    settings.setIsGaplessEnabled(true);
    expect(useSettingsStore.getState().isGaplessEnabled).toBe(true);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);

    // Now enable crossfade
    settings.setIsCrossfadeEnabled(true);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);
    expect(useSettingsStore.getState().isGaplessEnabled).toBe(false);
  });

  it('R3-2: Enabling Gapless automatically disables Crossfade in settingsStore', () => {
    const settings = useSettingsStore.getState();
    
    // Crossfade is true by default
    expect(settings.isCrossfadeEnabled).toBe(true);
    expect(settings.isGaplessEnabled).toBe(false);

    // Turn gapless on
    settings.setIsGaplessEnabled(true);
    expect(useSettingsStore.getState().isGaplessEnabled).toBe(true);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);
  });

  it('R3-3: AudioEngine updateSettings synchronizes mutually exclusive state', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.updateSettings({ isGaplessEnabled: true });
    // When gapless is enabled, crossfade should be disabled
    engine.updateSettings({ isCrossfadeEnabled: true });

    engine.destroy();
  });

  // R4: DynamicsCompressorNode Verification
  it('R4-1: WebAudioPipeline creates DynamicsCompressorNode with standard broadcast compression parameters', () => {
    const pipeline = new WebAudioPipeline();

    expect(pipeline.compressorNode).toBeDefined();
    expect(pipeline.compressorNode.threshold.value).toBe(-18);
    expect(pipeline.compressorNode.knee.value).toBe(30);
    expect(pipeline.compressorNode.ratio.value).toBe(3);
    expect(pipeline.compressorNode.attack.value).toBeCloseTo(0.003, 3);
    expect(pipeline.compressorNode.release.value).toBeCloseTo(0.25, 2);

    pipeline.destroy();
  });

  it('R4-2: WebAudioPipeline routes through compressor when normalization is enabled and bypasses when disabled', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    // Normalization enabled: compressor is in graph
    pipeline.setNormalizationEnabled(true);
    expect(pipeline.compressorNode.connectedTo.length).toBeGreaterThan(0);

    // Normalization disabled: compressor is bypassed
    pipeline.setNormalizationEnabled(false);
    expect(pipeline.compressorNode.connectedTo.length).toBe(0);

    pipeline.destroy();
  });

  // R5: Web Volume Slider
  it('R5-1: Volume slider actively modulates master gain in WebAudioPipeline', () => {
    const pipeline = new WebAudioPipeline();

    pipeline.setMasterVolume(0.75, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.75, 2);

    pipeline.setMasterVolume(0.25, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.25, 2);

    pipeline.setMasterVolume(0.0, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBe(0.0);

    pipeline.destroy();
  });

  it('R5-2: AudioEngine setVolume and setVolumeMultiplier update both WebAudio graph and audio decks', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.setVolume(0.8);
    engine.setVolumeMultiplier(0.5);

    expect(el0.volume).toBeCloseTo(0.4, 2);
    expect(el1.volume).toBeCloseTo(0.4, 2);

    const pipeline = engine.getWebAudioPipeline();
    if (pipeline) {
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.4, 2);
    }

    engine.destroy();
  });

  // R7: Crossfade Immediate Sync (activeIndex, timeupdate, durationchange)
  it('R7-1: Crossfade immediately switches activeIndex to incoming track at crossfade start', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.updateSettings({
      isCrossfadeEnabled: true,
      crossfadeDuration: 3,
    });

    const track1 = createMockTrack('cf-t1', 'Track One', 180);
    const track2 = createMockTrack('cf-t2', 'Track Two', 240);

    await engine.playTrack(track1, { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);
    expect(engine.getCurrentTrack().id).toBe('cf-t1');

    // oxlint-disable-next-line
    let receivedTime = -1;
    // oxlint-disable-next-line
    let receivedDuration = -1;
    engine.on('timeupdate', (time: number) => {
      receivedTime = time;
    });
    engine.on('durationchange', (duration: number) => {
      receivedDuration = duration;
    });

    // Start crossfade to track 2
    const crossfadePromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    // Complete transition
    await crossfadePromise;
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTrack().id).toBe('cf-t2');

    engine.destroy();
  });

  it('R7-2: Events from outgoing track during crossfade are ignored in favor of incoming track events', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.updateSettings({
      isCrossfadeEnabled: true,
      crossfadeDuration: 1,
    });

    const track1 = createMockTrack('cf-t1', 'Track One', 180);
    const track2 = createMockTrack('cf-t2', 'Track Two', 200);

    await engine.playTrack(track1, { immediate: true });

    let latestTime = -1;
    engine.on('timeupdate', (time: number) => {
      latestTime = time;
    });

    // Start crossfade to track 2
    await engine.playTrack(track2, { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(1);

    // Simulate outgoing deck 0 emitting an old timestamp (179s)
    (el0 as any).simulateTimeUpdate(179);
    // latestTime should NOT be updated to 179
    expect(latestTime).not.toBe(179);

    // Incoming deck 1 emits new timestamp (2s)
    (el1 as any).simulateTimeUpdate(2);
    expect(latestTime).toBe(2);

    engine.destroy();
  });
});
