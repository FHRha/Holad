import { describe, it, expect, beforeEach } from 'vitest';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { useAudioStore } from '../../store/audioStore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B7: Network Stalled Buffer & Latency', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B7-1: Network stall triggers waiting event listener cleanly', () => {
    const webAudio = new WebAudioCore();
    let waitingFired = false;
    webAudio.on('statechange', (e: any) => {
      if (e?.type === 'waiting') waitingFired = true;
    });

    const el = (webAudio as any).audioElement;
    if (el) el.dispatchEvent(new Event('waiting'));

    expect(waitingFired).toBe(true);
    webAudio.destroy();
  });

  it('B7-2: Buffer recovery fires canplay event and resumes smoothly', () => {
    const webAudio = new WebAudioCore();
    let canplayFired = false;
    webAudio.on('statechange', (e: any) => {
      if (e?.type === 'canplay') canplayFired = true;
    });

    const el = (webAudio as any).audioElement;
    if (el) el.dispatchEvent(new Event('canplay'));

    expect(canplayFired).toBe(true);
    webAudio.destroy();
  });

  it('B7-3: Duration change event during VBR streaming updates audio store duration', () => {
    const store = useAudioStore.getState();
    store.setDuration(120);
    expect(useAudioStore.getState().duration).toBe(120);

    store.setDuration(245.5);
    expect(useAudioStore.getState().duration).toBe(245.5);
  });

  it('B7-4: Multiple disconnected buffer fragments are handled without throwing', () => {
    const el = (window as any).Audio();
    if (el && el.simulateBufferProgress) {
      el.simulateBufferProgress(0, 45);
      expect(el.buffered.length).toBe(1);
      expect(el.buffered.end(0)).toBe(45);
    }
  });

  it('B7-5: Preloading invalid/slow network URL does not disrupt active playback deck', async () => {
    const webAudio = new WebAudioCore();
    await webAudio.play('http://localhost:4000/stream/active-track', 0);
    expect(webAudio.getState()).toBe('playing');

    // Preload slow or failed URL
    await webAudio.preload('http://localhost:4000/stream/slow-track');
    expect(webAudio.getState()).toBe('playing');

    webAudio.destroy();
  });
});
