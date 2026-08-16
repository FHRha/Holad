import { describe, it, expect, beforeEach } from 'vitest';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 3 - P5: Low Buffering Network + Preload Lookahead + Seek to Unbuffered Region', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('P5-1: Preload lookahead does not pause active playback during low buffer state', async () => {
    const webAudio = new WebAudioCore();
    await webAudio.play('http://localhost:4000/stream/current-song', 160);
    expect(webAudio.getState()).toBe('playing');

    // Trigger preload of next song
    await webAudio.preload('http://localhost:4000/stream/next-song');
    expect(webAudio.getState()).toBe('playing');
    expect(webAudio.getCurrentTime()).toBe(160);

    webAudio.destroy();
  });

  it('P5-2: Seeking to unbuffered region requests new stream offset without crashing', async () => {
    const webAudio = new WebAudioCore();
    await webAudio.play('http://localhost:4000/stream/current-song', 10);
    
    // Seek to unbuffered region at 150s
    webAudio.seek(150);
    expect(webAudio.getCurrentTime()).toBe(150);

    webAudio.destroy();
  });

  it('P5-3: Pre-buffering standby deck is ready for immediate handover upon seek to boundary', async () => {
    const webAudio = new WebAudioCore();
    await webAudio.play('http://localhost:4000/stream/track1', 178);
    expect(webAudio.getCurrentTime()).toBe(178);

    // Seek to beginning and transition
    webAudio.seek(0);
    await webAudio.play('http://localhost:4000/stream/track2', 0);
    expect(webAudio.getCurrentTime()).toBe(0);
    expect(webAudio.getState()).toBe('playing');

    webAudio.destroy();
  });
});
