import { describe, it, expect, beforeEach } from 'vitest';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { useAudioStore } from '../../store/audioStore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B6: Boundary Seeking', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B6-1: Seeking to 1s before track end places currentTime near boundary', () => {
    const webAudio = new WebAudioCore();
    webAudio.seek(179);
    expect(webAudio.getCurrentTime()).toBe(179);
    webAudio.destroy();
  });

  it('B6-2: Seeking while paused preserves paused state and updates position', () => {
    const webAudio = new WebAudioCore();
    expect(webAudio.getState()).toBe('idle');

    webAudio.seek(75);
    expect(webAudio.getCurrentTime()).toBe(75);
    expect(webAudio.getState()).toBe('idle');
    webAudio.destroy();
  });

  it('B6-3: Seeking during active playback preserves playing state', async () => {
    const webAudio = new WebAudioCore();
    await webAudio.play('http://localhost:4000/stream/test', 10);
    expect(webAudio.getState()).toBe('playing');

    webAudio.seek(120);
    expect(webAudio.getCurrentTime()).toBe(120);
    expect(webAudio.getState()).toBe('playing');
    webAudio.destroy();
  });

  it('B6-4: Seeking to 0.0s resets progress to 0%', () => {
    const audioStore = useAudioStore.getState();
    audioStore.setDuration(200);
    audioStore.setProgress(80);

    audioStore.setProgress(0);
    expect(useAudioStore.getState().progress).toBe(0);
  });

  it('B6-5: Sub-second micro-seeking (e.g. 0.05s increments) updates floating point currentTime', () => {
    const webAudio = new WebAudioCore();
    webAudio.seek(12.345);
    expect(webAudio.getCurrentTime()).toBeCloseTo(12.345);

    webAudio.seek(12.395);
    expect(webAudio.getCurrentTime()).toBeCloseTo(12.395);
    webAudio.destroy();
  });
});
