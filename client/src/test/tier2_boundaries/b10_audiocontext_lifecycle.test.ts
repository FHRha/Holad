import { describe, it, expect, beforeEach } from 'vitest';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { MockAudioContext } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B10: AudioContext Lifecycle & Device Transitions', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B10-1: AudioContext starts suspended and transitions to running on resume()', async () => {
    const ctx = new MockAudioContext();
    expect(ctx.state).toBe('suspended');

    await ctx.resume();
    expect(ctx.state).toBe('running');
  });

  it('B10-2: WebAudioCore play resumes suspended AudioContext automatically', async () => {
    const webAudio = new WebAudioCore();
    const ctx = webAudio.getAudioContext() as any;
    ctx.state = 'suspended';

    await webAudio.play('http://localhost:4000/stream/test', 0);
    expect(ctx.state).toBe('running');

    webAudio.destroy();
  });

  it('B10-3: Idempotent resume() calls on running AudioContext do not throw', async () => {
    const ctx = new MockAudioContext();
    await ctx.resume();
    expect(ctx.state).toBe('running');

    await ctx.resume();
    expect(ctx.state).toBe('running');
  });

  it('B10-4: Global AudioContext reuse prevents creating unbounded contexts', () => {
    const webAudio1 = new WebAudioCore();
    const ctx1 = webAudio1.getAudioContext();

    const webAudio2 = new WebAudioCore();
    const ctx2 = webAudio2.getAudioContext();

    expect(ctx1).toBe(ctx2);

    webAudio1.destroy();
    webAudio2.destroy();
  });

  it('B10-5: destroy() cleanly disconnects source, gain, and analyser nodes', () => {
    const webAudio = new WebAudioCore();
    const source = webAudio.getMediaElementSource() as any;
    const analyser = webAudio.getAnalyserNode() as any;

    expect(source.connectedTo.length).toBeGreaterThan(0);

    webAudio.destroy();
    expect(source.connectedTo.length).toBe(0);
    expect(analyser.connectedTo.length).toBe(0);
  });
});
