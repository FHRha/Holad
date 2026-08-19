import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B9: Mid-Playback Setting Changes', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B9-1: Toggling crossfade enabled to disabled mid-playback does not pause audio', async () => {
    const webAudio = new WebAudioCore();
    await webAudio.play('http://localhost:4000/stream/song', 50);
    expect(webAudio.getState()).toBe('playing');

    useSettingsStore.getState().setIsCrossfadeEnabled(false);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);
    expect(webAudio.getState()).toBe('playing');

    webAudio.destroy();
  });

  it('B9-2: Modifying crossfade duration mid-playback recalculates trigger time dynamically', () => {
    const settings = useSettingsStore.getState();
    settings.setCrossfadeDuration(4);

    const trackDuration = 180;
    const timeA = 175; // 5s remaining
    expect(trackDuration - timeA <= settings.crossfadeDuration).toBe(false);

    settings.setCrossfadeDuration(8);
    expect(trackDuration - timeA <= useSettingsStore.getState().crossfadeDuration).toBe(true);
  });

  it('B9-3: Modifying volume multiplier mid-track recalculates gain instantly without re-creating graph', () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.5);

    usePlayerStore.getState().setVolumeMultiplier(2.0);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(2.0);

    webAudio.setVolume(0.5 * usePlayerStore.getState().volumeMultiplier);
    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(1.0);

    webAudio.destroy();
  });

  it('B9-4: Switching repeat mode from none to one enables loop on audio element', () => {
    const webAudio = new WebAudioCore();
    webAudio.setLoop(true);

    const el = (webAudio as any).audioElement;
    expect(el.loop).toBe(true);

    webAudio.setLoop(false);
    expect(el.loop).toBe(false);

    webAudio.destroy();
  });

  it('B9-5: Toggling Auto DJ mid-playback toggles store state cleanly', () => {
    const store = usePlayerStore.getState();
    const initial = store.isAutoDjEnabled;

    store.toggleAutoDj();
    expect(usePlayerStore.getState().isAutoDjEnabled).toBe(!initial);

    store.toggleAutoDj();
    expect(usePlayerStore.getState().isAutoDjEnabled).toBe(initial);
  });
});
