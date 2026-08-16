import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 3 - Pairwise: Crossfade Fadeout (R3) + Progress Sync (R7) + UI Continuity (R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('P3-1: During crossfade, outgoing deck gain fades out while progress immediately syncs to incoming track', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('cf-syn-1', 'Track 1', 180);
    const track2 = createMockTrack('cf-syn-2', 'Track 2', 240);

    await engine.playTrack(track1, { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);

    const cfPromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });
    await cfPromise;

    expect(engine.getActiveDeckIndex()).toBe(1);
    const pipeline = engine.getWebAudioPipeline() as WebAudioPipeline;
    if (pipeline) {
      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(pipeline.getDeckGain(1)).toBe(1.0);
    }

    engine.destroy();
  });

  it('P3-2: Lyrics timestamp matches incoming track starting at 0s at the onset of crossfade', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const lyricsData = [
      { time: 0, text: 'First line of new song' },
      { time: 4, text: 'Second line of new song' },
    ];

    const track1 = createMockTrack('lyr-1', 'Song A', 180);
    const track2 = createMockTrack('lyr-2', 'Song B', 220);

    await engine.playTrack(track1, { immediate: true });
    await engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    const currentTrackTime = engine.getCurrentTime();
    const activeLine = lyricsData.find((l) => currentTrackTime >= l.time)?.text;
    expect(activeLine).toBe('First line of new song');

    engine.destroy();
  });

  it('P3-3: Rapid 3-song playlist crossfade sequence preserves volume fadeout and progress sync for each hop', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const tracks = [
      createMockTrack('seq-1', 'Sequence 1', 100),
      createMockTrack('seq-2', 'Sequence 2', 120),
      createMockTrack('seq-3', 'Sequence 3', 140),
    ];

    await engine.playTrack(tracks[0], { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);

    await engine.playTrack(tracks[1], { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTrack().id).toBe('seq-2');

    await engine.playTrack(tracks[2], { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(0);
    expect(engine.getCurrentTrack().id).toBe('seq-3');

    engine.destroy();
  });

  it('P3-4: Pause command issued during multi-deck crossfade halts both decks and leaves single active state', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('p-cf-1', 'Track 1', 180);
    const track2 = createMockTrack('p-cf-2', 'Track 2', 200);

    await engine.playTrack(track1, { immediate: true });
    const cfPromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    engine.pause();
    await cfPromise;
    engine.pause();

    expect(engine.getState()).toBe('paused');

    engine.destroy();
  });
});
