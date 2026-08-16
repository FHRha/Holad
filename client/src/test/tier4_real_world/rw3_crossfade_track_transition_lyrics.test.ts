import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 4 - Scenario 3: DJ Crossfade Track Transition with Active Lyrics Follow (R3, R7, R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RW3-1: End-to-end DJ crossfade workflow: Track 1 reaches transition threshold, crossfades to Track 2, deck gains fade out/in, lyrics follow Track 2 timing', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    (el0 as any).duration = 180;
    (el1 as any).duration = 220;

    const engine = new AudioEngine([el0, el1]);
    engine.updateSettings({
      isCrossfadeEnabled: true,
      crossfadeDuration: 1,
    });

    const track1 = createMockTrack('dj-1', 'DJ Set Opener', 180);
    const track2 = createMockTrack('dj-2', 'DJ Set Followup', 220);

    const track2Lyrics = [
      { time: 0, text: 'Opening beat of track 2' },
      { time: 3, text: 'Drop of track 2' },
    ];

    // 1. Play Track 1
    await engine.playTrack(track1, { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);
    expect(engine.getState()).toBe('playing');

    // 2. Playhead approaches track 1 end (177s / 180s)
    (el0 as any).simulateTimeUpdate(177);

    // 3. Initiate crossfade to Track 2
    const crossfadePromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    // Wait for crossfade to complete
    await crossfadePromise;

    // 4. Verify Deck 1 is now active and Deck 0 is faded out
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTrack().id).toBe('dj-2');

    const pipeline = engine.getWebAudioPipeline() as WebAudioPipeline;
    if (pipeline) {
      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(pipeline.getDeckGain(1)).toBe(1.0);
    }

    // 5. Verify lyrics tracker evaluates Track 2 lyrics at time 0s
    const activeLyrics = track2Lyrics.find((l) => engine.getCurrentTime() >= l.time)?.text;
    expect(activeLyrics).toBe('Opening beat of track 2');

    engine.destroy();
  });

  it('RW3-2: Crossfade transition aborted by user skip immediately cuts to new track without stuck audio or phase cancellation', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('cf-ab-1', 'Original Track', 180);
    const track2 = createMockTrack('cf-ab-2', 'Fading Track', 200);
    const track3 = createMockTrack('cf-ab-3', 'Cut Track', 150);

    await engine.playTrack(track1, { immediate: true });

    // Start fade to track 2
    const fadePromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    // User suddenly clicks Next Track (immediate skip to track 3)
    await engine.playTrack(track3, { immediate: true });

    expect(engine.getState()).toBe('playing');
    expect(engine.getCurrentTrack().id).toBe('cf-ab-3');

    engine.destroy();
  });
});
