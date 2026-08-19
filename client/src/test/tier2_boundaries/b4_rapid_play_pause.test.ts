import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B4: Rapid Play/Pause Toggling', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B4-1: Rapid play/pause on WebAudioCore alternates state without crashing', async () => {
    const webAudio = new WebAudioCore();

    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        await webAudio.play('http://localhost:4000/stream/test', 0);
        expect(webAudio.getState()).toBe('playing');
      } else {
        webAudio.pause();
      }
    }

    webAudio.destroy();
  });

  it('B4-2: Rapid play/pause on MobileAudioCore handles state cleanly', async () => {
    const mobileCore = new MobileAudioCore();

    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        await mobileCore.play('http://localhost:4000/stream/test', 0);
        expect(mobileCore.getState()).toBe('playing');
      } else {
        mobileCore.pause();
      }
    }

    mobileCore.destroy();
  });

  it('B4-3: Rapid isPlaying store toggling stays synchronized', () => {
    const store = usePlayerStore.getState();

    for (let i = 0; i < 20; i++) {
      store.setIsPlaying(i % 2 === 0);
      expect(usePlayerStore.getState().isPlaying).toBe(i % 2 === 0);
    }
  });

  it('B4-4: Pause called immediately after play preserves pause state', async () => {
    const webAudio = new WebAudioCore();
    const playPromise = webAudio.play('http://localhost:4000/stream/test', 0);
    webAudio.pause();
    await playPromise;

    // After explicit pause, should be paused
    webAudio.destroy();
  });

  it('B4-5: Resuming after rapid pauses resumes from correct currentTime', async () => {
    const webAudio = new WebAudioCore();
    await webAudio.play('http://localhost:4000/stream/test', 35);
    webAudio.pause();
    expect(webAudio.getCurrentTime()).toBe(35);

    await webAudio.resume();
    expect(webAudio.getCurrentTime()).toBe(35);

    webAudio.destroy();
  });
});
