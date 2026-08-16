import { describe, it, expect, beforeEach } from 'vitest';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F4: Smooth Volume Transitions', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('F4-1: setVolume schedules setTargetAtTime with smooth timeConstant on GainNode', () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.8);

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode).toBeDefined();

    const events = gainNode.gain.scheduledEvents;
    expect(events.length).toBeGreaterThan(0);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe('setTargetAtTime');
    expect(lastEvent.target).toBe(0.8);
    expect(lastEvent.timeConstant).toBe(0.01);

    webAudio.destroy();
  });

  it('F4-2: Volume transitions avoid abrupt step changes to prevent zipper noise', () => {
    const webAudio = new WebAudioCore();
    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);

    webAudio.setVolume(0.2);
    webAudio.setVolume(0.7);

    const events = gainNode.gain.scheduledEvents;
    expect(events.filter((e: any) => e.type === 'setTargetAtTime').length).toBe(2);

    webAudio.destroy();
  });

  it('F4-3: Mute transition smoothly moves gain to 0.0', () => {
    const webAudio = new WebAudioCore();
    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);

    webAudio.setVolume(0.0);
    expect(gainNode.gain.value).toBe(0.0);

    const lastEvent = gainNode.gain.scheduledEvents[gainNode.gain.scheduledEvents.length - 1];
    expect(lastEvent.target).toBe(0.0);

    webAudio.destroy();
  });

  it('F4-4: Un-mute transition restores previous volume smoothly', () => {
    const webAudio = new WebAudioCore();
    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);

    webAudio.setVolume(0.0); // Mute
    webAudio.setVolume(0.65); // Restore

    const lastEvent = gainNode.gain.scheduledEvents[gainNode.gain.scheduledEvents.length - 1];
    expect(lastEvent.target).toBe(0.65);
    expect(gainNode.gain.value).toBe(0.65);

    webAudio.destroy();
  });

  it('F4-5: Rapid successive volume updates seamlessly track latest target value', () => {
    const webAudio = new WebAudioCore();
    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);

    for (let v = 0; v <= 1.0; v += 0.1) {
      webAudio.setVolume(Number(v.toFixed(1)));
    }

    expect(gainNode.gain.value).toBe(1.0);
    expect(gainNode.gain.scheduledEvents.length).toBeGreaterThanOrEqual(10);

    webAudio.destroy();
  });

  it('F4-6: Playback rate adjustments do not distort volume ramp parameters', () => {
    const webAudio = new WebAudioCore();
    webAudio.setPlaybackRate(1.5);
    webAudio.setVolume(0.9);

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(0.9);

    webAudio.destroy();
  });
});
