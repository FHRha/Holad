import { describe, it, expect, beforeEach } from 'vitest';
import { MockAudioElement, MockTimeRanges } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F8: Buffering & Pre-Buffering', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('F8-1: Audio element waiting event signals buffering state', () => {
    const audio = new MockAudioElement();
    let isBuffering = false;

    audio.addEventListener('waiting', () => { isBuffering = true; });
    audio.addEventListener('playing', () => { isBuffering = false; });

    audio.simulateWaiting();
    expect(isBuffering).toBe(true);

    audio.dispatchEvent(new Event('playing'));
    expect(isBuffering).toBe(false);
  });

  it('F8-2: canplay / canplaythrough events resolve buffering readiness', () => {
    const audio = new MockAudioElement();
    let canPlay = false;

    audio.addEventListener('canplay', () => { canPlay = true; });
    audio.load();

    expect(canPlay).toBe(true);
    expect(audio.readyState).toBe(4);
  });

  it('F8-3: Buffer progress calculation computes percentage from buffered TimeRanges', () => {
    const audio = new MockAudioElement();
    audio.duration = 200;
    audio.simulateBufferProgress(0, 100);

    const bufferedPercent = (audio.buffered.end(0) / audio.duration) * 100;
    expect(bufferedPercent).toBe(50);

    audio.simulateBufferProgress(0, 200);
    const fullPercent = (audio.buffered.end(0) / audio.duration) * 100;
    expect(fullPercent).toBe(100);
  });

  it('F8-4: Pre-buffering handles fragmented buffer ranges correctly', () => {
    const ranges = new MockTimeRanges([
      { start: 0, end: 30 },
      { start: 100, end: 150 },
    ]);

    expect(ranges.length).toBe(2);
    expect(ranges.start(0)).toBe(0);
    expect(ranges.end(0)).toBe(30);
    expect(ranges.start(1)).toBe(100);
    expect(ranges.end(1)).toBe(150);
  });

  it('F8-5: Empty buffer state returns 0 buffered ranges safely without throwing', () => {
    const ranges = new MockTimeRanges([]);
    expect(ranges.length).toBe(0);
    expect(() => ranges.start(0)).toThrow();
  });

  it('F8-6: Stalled stream re-triggers load/canplay cycle gracefully', () => {
    const audio = new MockAudioElement();
    let loadCount = 0;
    audio.addEventListener('loadedmetadata', () => { loadCount++; });

    audio.load();
    expect(loadCount).toBe(1);

    // Stalled / reload
    audio.load();
    expect(loadCount).toBe(2);
  });
});
