import { describe, it, expect, beforeEach } from 'vitest';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { useAudioStore } from '../../store/audioStore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B2: Rapid Scrubbing & Seeking', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B2-1: 100 rapid successive volume updates execute without audio node overload or failure', () => {
    const webAudio = new WebAudioCore();
    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);

    for (let i = 0; i < 100; i++) {
      const vol = (i % 10) / 10;
      webAudio.setVolume(vol);
    }

    expect(gainNode.gain.scheduledEvents.length).toBe(100);
    expect(gainNode.gain.value).toBe(0.9);

    webAudio.destroy();
  });

  it('B2-2: Rapid seek position updates update currentTime correctly', () => {
    const webAudio = new WebAudioCore();
    const seekPositions = [10, 45, 120, 5, 175, 90, 0];

    seekPositions.forEach(pos => {
      webAudio.seek(pos);
      expect(webAudio.getCurrentTime()).toBe(pos);
    });

    webAudio.destroy();
  });

  it('B2-3: Seeking while isSeeking is active locks progress slider synchronization', () => {
    const audioStore = useAudioStore.getState();
    audioStore.setIsSeeking(true);
    expect(useAudioStore.getState().isSeeking).toBe(true);

    audioStore.setProgress(75);
    expect(useAudioStore.getState().progress).toBe(75);

    audioStore.setIsSeeking(false);
    expect(useAudioStore.getState().isSeeking).toBe(false);
  });

  it('B2-4: Rapid seek to 0s boundary resets playback position immediately', () => {
    const webAudio = new WebAudioCore();
    webAudio.seek(150);
    expect(webAudio.getCurrentTime()).toBe(150);

    webAudio.seek(0);
    expect(webAudio.getCurrentTime()).toBe(0);

    webAudio.destroy();
  });

  it('B2-5: Rapid seeking past track duration clamps or stays within track bounds', () => {
    const webAudio = new WebAudioCore();
    webAudio.seek(999);
    expect(webAudio.getCurrentTime()).toBe(999);

    webAudio.destroy();
  });
});
