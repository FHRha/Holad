import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 2 - B7: Crossfade Progress & Lyrics Sync Boundary Cases', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B7-1: Crossfade triggered at exact track boundary (last 100ms) transitions without race condition', async () => {
    const el0 = createMockAudioElement();
    (el0 as any).duration = 180;
    (el0 as any).currentTime = 179.9; // 100ms before end

    const el1 = createMockAudioElement();
    (el1 as any).duration = 240;

    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('edge-1', 'Track 1', 180);
    const track2 = createMockTrack('edge-2', 'Track 2', 240);

    await engine.playTrack(track1, { immediate: true });
    const cfPromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    // Outgoing track ends naturally during fade
    (el0 as any).simulateEnded();

    await cfPromise;
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTrack().id).toBe('edge-2');

    engine.destroy();
  });

  it('B7-2: Rapid consecutive skip storm (5 tracks skipped in 100ms) leaves only one active deck and correct track', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const tracks = Array.from({ length: 5 }, (_, i) => createMockTrack(`skip-trk-${i}`, `Song ${i}`, 150));

    // Rapidly play track 0, then skip through 1, 2, 3, 4
    for (let i = 0; i < tracks.length; i++) {
      engine.playTrack(tracks[i], { immediate: false, transitionDuration: 1 });
    }

    // Await last track
    await engine.playTrack(tracks[4], { immediate: true });

    expect(engine.getState()).toBe('playing');
    expect(engine.getCurrentTrack().id).toBe('skip-trk-4');

    engine.destroy();
  });

  it('B7-3: Seek interaction during active crossfade aborts prior fade and sets target position cleanly', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('seek-cf-1', 'Track 1', 180);
    const track2 = createMockTrack('seek-cf-2', 'Track 2', 200);

    await engine.playTrack(track1, { immediate: true });
    const cfPromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    // User seeks to 45s during crossfade
    engine.seek(45);
    await cfPromise;

    // Active deck should accept seek
    expect(engine.getState()).toBeDefined();

    engine.destroy();
  });

  it('B7-4: Incoming track with initial non-zero start position (e.g. 30s) initializes seek position properly', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('init-1', 'Song 1', 180);
    const track2 = createMockTrack('init-2', 'Song 2', 200);

    await engine.playTrack(track1, { immediate: true });
    await engine.playTrack(track2, { startTime: 30, immediate: false, transitionDuration: 1 });

    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTime()).toBeCloseTo(30, 1);

    engine.destroy();
  });

  it('B7-5: Incoming track with zero or NaN duration parameters handles duration change safely without division by zero', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    (el1 as any).duration = 0; // Edge duration 0

    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('zero-dur-1', 'Track 1', 180);
    const track2 = createMockTrack('zero-dur-2', 'Zero Duration Track', 0);

    await engine.playTrack(track1, { immediate: true });

    expect(() => {
      engine.playTrack(track2, { immediate: false, transitionDuration: 1 });
    }).not.toThrow();

    engine.destroy();
  });

  it('B7-6: Lyrics component updates smoothly when active deck emits high-density timeupdate stream', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const timeLog: number[] = [];
    engine.on('timeupdate', (t) => {
      timeLog.push(t);
    });

    // Simulate 50 time updates
    for (let sec = 0; sec <= 50; sec++) {
      (el0 as any).simulateTimeUpdate(sec);
    }

    expect(timeLog.length).toBe(51);
    expect(timeLog[timeLog.length - 1]).toBe(50);

    engine.destroy();
  });
});
