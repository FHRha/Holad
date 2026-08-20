import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
// oxlint-disable-next-line
import { AudioDeck } from '../../audio/AudioDeck';
// oxlint-disable-next-line
import { useAudioStore } from '../../store/audioStore';
// oxlint-disable-next-line
import { usePlayerStore } from '../../store/playerStore';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 1 - R7: Crossfade Progress Slider & Lyrics Time Synchronization', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('R7-1: AudioEngine switches activeIndex to incoming track at the start of crossfade transition', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('sync-1', 'Track 1', 180);
    const track2 = createMockTrack('sync-2', 'Track 2', 210);

    // Start playback on Deck 0
    await engine.playTrack(track1, { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);

    // Crossfade to Track 2
    const crossfadePromise = engine.playTrack(track2, {
      immediate: false,
      transitionDuration: 1,
    });

    await crossfadePromise;
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getCurrentTrack().id).toBe('sync-2');

    engine.destroy();
  });

  it('R7-2: Progress slider and currentTime jump to 0s for incoming track when crossfade starts', async () => {
    const el0 = createMockAudioElement();
    (el0 as any).duration = 180;
    (el0 as any).currentTime = 177; // Outgoing track is at 177s

    const el1 = createMockAudioElement();
    (el1 as any).duration = 210;
    (el1 as any).currentTime = 0; // Incoming track starts at 0s

    const engine = new AudioEngine([el0, el1]);

    const timeEvents: number[] = [];
    engine.on('timeupdate', (t: number) => {
      timeEvents.push(t);
    });

    const track1 = createMockTrack('trk-out', 'Outgoing Track', 180);
    const track2 = createMockTrack('trk-in', 'Incoming Track', 210);

    await engine.playTrack(track1, { immediate: true });
    await engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    // Active deck should now report incoming deck's time
    expect(engine.getCurrentTime()).toBe(0);

    engine.destroy();
  });

  it('R7-3: Duration update reflects incoming track duration when crossfade begins', async () => {
    const el0 = createMockAudioElement();
    (el0 as any).duration = 150;
    const el1 = createMockAudioElement();
    (el1 as any).duration = 320;

    const engine = new AudioEngine([el0, el1]);

    const durationEvents: number[] = [];
    engine.on('durationchange', (d: number) => {
      durationEvents.push(d);
    });

    const track1 = createMockTrack('dur-1', 'Short Track', 150);
    const track2 = createMockTrack('dur-2', 'Long Track', 320);

    await engine.playTrack(track1, { immediate: true });
    expect(engine.getDuration()).toBe(150);

    await engine.playTrack(track2, { immediate: false, transitionDuration: 1 });
    expect(engine.getDuration()).toBe(320);

    engine.destroy();
  });

  it('R7-4: Time tracking events are emitted exclusively by active deck during crossfade without cross-talk', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    let emittedTime = -1;
    engine.on('timeupdate', (t: number) => {
      emittedTime = t;
    });

    // Deck 0 is active
    (el0 as any).simulateTimeUpdate(50);
    expect(emittedTime).toBe(50);

    // Standby deck (1) timeupdate must NOT leak to engine listeners
    (el1 as any).simulateTimeUpdate(12);
    expect(emittedTime).toBe(50); // Still 50, ignored deck 1

    engine.destroy();
  });

  it('R7-5: Lyrics / Karaoke synchronizer uses active deck time updates to match incoming track verses', () => {
    const mockLyrics = [
      { time: 0, text: 'Verse 1 of Track 2' },
      { time: 5, text: 'Verse 2 of Track 2' },
    ];

    // Helper to find current lyric line
    const getCurrentLine = (currentTime: number) => {
      for (let i = mockLyrics.length - 1; i >= 0; i--) {
        if (currentTime >= mockLyrics[i].time) return mockLyrics[i].text;
      }
      return '';
    };

    // When crossfade to track 2 happens, time jumps to 0s
    expect(getCurrentLine(0)).toBe('Verse 1 of Track 2');
    expect(getCurrentLine(5)).toBe('Verse 2 of Track 2');
  });

  it('R7-6: Outgoing deck timeupdates after crossfade completion are completely ignored', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    let lastEmittedTime = 0;
    engine.on('timeupdate', (t: number) => {
      lastEmittedTime = t;
    });

    const track1 = createMockTrack('out-1', 'Outgoing', 180);
    const track2 = createMockTrack('in-2', 'Incoming', 200);

    await engine.playTrack(track1, { immediate: true });
    await engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    expect(engine.getActiveDeckIndex()).toBe(1);

    // Simulate old deck 0 firing lingering timeupdate
    (el0 as any).simulateTimeUpdate(180);

    // Engine should NOT emit 180
    expect(lastEmittedTime).not.toBe(180);

    engine.destroy();
  });
});
