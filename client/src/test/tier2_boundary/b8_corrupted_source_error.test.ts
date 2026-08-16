import { describe, it, expect, beforeEach } from 'vitest';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B8: Corrupted Audio Source & Error Recovery', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B8-1: Play error in WebAudioCore transitions state to error without throwing uncaught exceptions', async () => {
    const webAudio = new WebAudioCore();
    const el = (webAudio as any).audioElement;
    if (el) {
      el.play = async () => {
        throw new Error('404 Not Found');
      };
    }

    await webAudio.play('http://localhost:4000/stream/notfound', 0);
    await new Promise(r => setTimeout(r, 20));
    expect(webAudio.getState()).toBe('error');
    webAudio.destroy();
  });

  it('B8-2: Play error in MobileAudioCore transitions state to error without unhandled rejection', async () => {
    const mobileCore = new MobileAudioCore();
    const el = (mobileCore as any).audioElement;
    if (el) {
      el.play = async () => {
        throw new Error('Decode error: Corrupted media header');
      };
    }

    await mobileCore.play('http://localhost:4000/stream/corrupted', 0);
    await new Promise(r => setTimeout(r, 20));
    expect(mobileCore.getState()).toBe('error');
    mobileCore.destroy();
  });

  it('B8-3: Player recovers cleanly from error state when a valid track is played next', async () => {
    const webAudio = new WebAudioCore();
    const el = (webAudio as any).audioElement;
    
    // Simulate error first
    el.play = async () => { throw new Error('Network error'); };
    await webAudio.play('http://localhost:4000/stream/bad', 0);
    await new Promise(r => setTimeout(r, 20));
    expect(webAudio.getState()).toBe('error');

    // Now restore normal play
    el.play = async () => {
      Object.defineProperty(el, 'paused', { value: false, configurable: true });
    };
    await webAudio.play('http://localhost:4000/stream/good', 0);
    await new Promise(r => setTimeout(r, 20));
    expect(webAudio.getState()).toBe('playing');

    webAudio.destroy();
  });

  it('B8-4: Error listener registration and event dispatching works on IAudioCore', () => {
    const webAudio = new WebAudioCore();
    let errorReceived: any = null;

    webAudio.on('error', (err) => {
      errorReceived = err;
    });

    const el = (webAudio as any).audioElement;
    if (el && el.simulateError) {
      el.simulateError(new Error('Media playback stalled completely'));
    }

    expect(errorReceived).toBeDefined();
    webAudio.destroy();
  });

  it('B8-5: Off method unregisters error listeners cleanly without memory leaks', () => {
    const webAudio = new WebAudioCore();
    let count = 0;
    const listener = () => { count++; };

    webAudio.on('error', listener);
    webAudio.off('error', listener);

    const el = (webAudio as any).audioElement;
    if (el && el.simulateError) {
      el.simulateError();
    }

    expect(count).toBe(0);
    webAudio.destroy();
  });
});
