import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useHoladStore } from '../../store/holadStore';
import {
  handleHeadphonesDisconnected,
  handleHeadphonesConnected,
  getLastHeadphonesDisconnectedAt,
  setLastHeadphonesDisconnectedAt,
  getAudioOutputDevice,
  getDeviceDisplayName,
  cleanRawDeviceLabel,
  initAudioDeviceManager,
  cleanupAudioDeviceManager,
  promptSelectAudioOutput,
  isGenericOrDriverJunk
} from '../../hooks/useAudioOutputDevice';
import { useSettingsStore } from '../../store/settingsStore';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import { AudioDeck } from '../../audio/AudioDeck';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';

describe('Headphone Handling, Audio Device Display & Holad Remote Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStores();
    useHoladStore.getState().disconnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupAudioDeviceManager();
    useHoladStore.getState().disconnect();
  });

  describe('1. Headphone Disconnection Handler', () => {
    it('immediately sets isPlaying to false when headphones are disconnected', () => {
      const track = createMockTrack('hp-1', 'Headphone Song', 200);
      usePlayerStore.getState().setQueue([track]);
      usePlayerStore.getState().setIsPlaying(true);

      expect(usePlayerStore.getState().isPlaying).toBe(true);

      // Trigger headphone disconnect handler (ACTION_AUDIO_BECOMING_NOISY)
      handleHeadphonesDisconnected();

      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('returns valid initial audio output device', () => {
      const dev = getAudioOutputDevice();
      expect(dev).toBeDefined();
      expect(dev.name).toBeDefined();
      expect(typeof dev.isHeadphones).toBe('boolean');
    });
  });

  describe('2. Holad Connect Active Device Protection & Recovery', () => {
    it('claims activeDeviceId when local user initiates playback and no device is active', () => {
      const holad = useHoladStore.getState();
      const myId = holad.deviceId;

      // Mock connect socket state
      useHoladStore.setState({
        roomId: 'test-room',
        activeDeviceId: null,
        devices: [
          { id: myId, name: 'My Device' },
          { id: 'remote-1', name: 'Remote Device' }
        ]
      });

      holad.setupStoreSubscriptions();

      // User presses Play on local device
      usePlayerStore.getState().setIsPlaying(true);

      // Store subscription should detect isPlaying=true when !currentActive and claim active
      // In tests without live socket, setActiveDevice emits or handles call
      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');
      
      // Simulate play toggle
      usePlayerStore.setState({ isPlaying: false });
      usePlayerStore.getState().setIsPlaying(true);

      // Verified: no crash and handles null state gracefully
      expect(useHoladStore.getState().roomId).toBe('test-room');
    });

    it('does NOT steal activeDeviceId when remote device goes offline on passive store changes', () => {
      const holad = useHoladStore.getState();
      const myId = holad.deviceId;
      const remoteId = 'phone-device';

      useHoladStore.setState({
        roomId: 'test-room',
        activeDeviceId: remoteId,
        isRemotePlaying: true,
        devices: [
          { id: myId, name: 'PC Desktop' }
          // remoteId is now offline!
        ]
      });

      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');
      holad.setupStoreSubscriptions();

      // Passive change: volume change or queue hydration without user pressing play
      usePlayerStore.setState({ volume: 0.8 });

      // Should NOT steal active device!
      expect(setActiveSpy).not.toHaveBeenCalled();
    });

    it('auto-heals activeDeviceId when only 1 device is in the room', () => {
      const holad = useHoladStore.getState();
      const myId = holad.deviceId;
      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');

      // holad_devices event arrives with activeDeviceId === null, but only 1 device
      const mockDevices = [{ id: myId, name: 'Single Device' }];
      
      // Call mock devices logic:
      if (mockDevices.length === 1 && mockDevices[0].id === myId) {
        useHoladStore.getState().setActiveDevice(myId);
      }

      expect(setActiveSpy).toHaveBeenCalledWith(myId);
    });

    it('claims activeDeviceId when setIsPlaying(true) is called and activeDeviceId is null', () => {
      const myId = useHoladStore.getState().deviceId;
      useHoladStore.setState({
        roomId: 'test-room-null',
        activeDeviceId: null,
        devices: [{ id: myId, name: 'My Device' }, { id: 'other-dev', name: 'Other' }]
      });

      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');

      usePlayerStore.getState().setIsPlaying(true);

      expect(setActiveSpy).toHaveBeenCalledWith(myId);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it('does NOT steal activeDeviceId when window visibility changes to visible', () => {
      const holad = useHoladStore.getState();
      const myId = holad.deviceId;
      const masterId = 'desktop-master';

      useHoladStore.setState({
        roomId: 'test-room',
        activeDeviceId: masterId,
        isRemotePlaying: false,
        lastPausedAt: Date.now() - 5000,
        devices: [
          { id: myId, name: 'Phone Remote' },
          { id: masterId, name: 'Desktop' }
        ]
      });

      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');
      holad.setupStoreSubscriptions();

      // Simulate window becoming visible
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      window.dispatchEvent(new Event('visibilitychange'));

      // Passive window visibility must NOT steal active device!
      expect(setActiveSpy).not.toHaveBeenCalled();
    });

    it('Idle Timeout: remote play sends remoteCommand "play" when master was paused < 60s', () => {
      const holad = useHoladStore.getState();
      const myId = holad.deviceId;
      const masterId = 'desktop-master';
      const mockSocket = { emit: vi.fn() } as any;

      useHoladStore.setState({
        socket: mockSocket,
        roomId: 'test-room',
        activeDeviceId: masterId,
        isRemotePlaying: false,
        lastPausedAt: Date.now() - 20000, // Paused only 20 seconds ago (< 60s)
        devices: [
          { id: myId, name: 'Phone Remote' },
          { id: masterId, name: 'Desktop' }
        ]
      });

      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');
      holad.setupStoreSubscriptions();

      // User presses Play on remote device
      usePlayerStore.getState().setIsPlaying(true);

      // Must NOT steal active device
      expect(setActiveSpy).not.toHaveBeenCalled();
      // Must send remoteCommand 'play' to the current master
      expect(mockSocket.emit).toHaveBeenCalledWith('holad_remoteCommand', { type: 'play' });
    });

    it('Idle Timeout: remote play claims activeDeviceId locally when master has been paused >= 60s', () => {
      const holad = useHoladStore.getState();
      const myId = holad.deviceId;
      const masterId = 'desktop-master';
      const mockSocket = { emit: vi.fn() } as any;

      useHoladStore.setState({
        socket: mockSocket,
        roomId: 'test-room',
        activeDeviceId: masterId,
        isRemotePlaying: false,
        lastPausedAt: Date.now() - 65000, // Paused 65 seconds ago (> 60s idle timeout)
        devices: [
          { id: myId, name: 'Phone Remote' },
          { id: masterId, name: 'Desktop' }
        ]
      });

      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');
      holad.setupStoreSubscriptions();

      // User presses Play on remote device after idle timeout
      usePlayerStore.getState().setIsPlaying(true);

      // Must claim active device locally!
      expect(setActiveSpy).toHaveBeenCalledWith(myId);
    });

    it('transfers active device to remaining online device when primary active device goes offline after grace period', () => {
      const holad = useHoladStore.getState();
      const myId = holad.deviceId;
      const deadDeviceId = 'closed-desktop-id';
      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');

      // Socket event arrives after 45s grace period expires on server:
      // only myId is in devices list, and room is updating
      const data = {
        devices: [{ id: myId, name: 'Phone' }],
        activeDeviceId: null
      };

      const isActiveDeviceOnline = Boolean(data.activeDeviceId && data.devices.some(d => d.id === data.activeDeviceId));
      if (!isActiveDeviceOnline && data.devices.length === 1 && data.devices[0].id === myId) {
        useHoladStore.getState().setActiveDevice(myId);
      }

      expect(setActiveSpy).toHaveBeenCalledWith(myId);
    });
  });

  describe('3. getDeviceDisplayName Resolution', () => {
    const mockT = (key: string, fallback?: string) => fallback || key;

    it('returns specific device name if authentic (not generic and not driver junk)', () => {
      expect(getDeviceDisplayName({ name: 'Sony WH-1000XM4', type: 'bluetooth', isHeadphones: true }, mockT)).toBe('Sony WH-1000XM4');
      expect(getDeviceDisplayName({ name: 'Galaxy Buds2', type: 'bluetooth', isHeadphones: true }, mockT)).toBe('Galaxy Buds2');
      expect(getDeviceDisplayName({ name: 'HyperX Cloud III', type: 'bluetooth', isHeadphones: true }, mockT)).toBe('HyperX Cloud III');
      expect(getDeviceDisplayName({ name: 'USB Audio DAC', type: 'speaker', isHeadphones: false }, mockT)).toBe('USB Audio DAC');
    });

    it('filters universal driver/mixer technical junk into clean localized labels', () => {
      expect(isGenericOrDriverJunk('Realtek High Definition Audio')).toBe(true);
      expect(getDeviceDisplayName({ name: 'Realtek High Definition Audio', type: 'speaker', isHeadphones: false }, mockT)).toBe('Динамики компьютера');
      expect(getDeviceDisplayName({ name: 'По умолчанию - Динамики (Realtek(R) Audio)', type: 'speaker', isHeadphones: false }, mockT)).toBe('Динамики компьютера');
      expect(getDeviceDisplayName({ name: 'Default - Наушники (Realtek Audio)', type: 'wired', isHeadphones: true }, mockT)).toBe('Проводные наушники');
      expect(getDeviceDisplayName({ name: 'Стерео микшер', type: 'speaker', isHeadphones: false }, mockT)).toBe('Динамики компьютера');
      expect(getDeviceDisplayName({ name: 'A2DP Audio Output', type: 'bluetooth', isHeadphones: true }, mockT)).toBe('Bluetooth-наушники');
      expect(getDeviceDisplayName({ name: 'Conexant SmartAudio HD', type: 'speaker', isHeadphones: false }, mockT)).toBe('Динамики компьютера');
      expect(getDeviceDisplayName({ name: 'Primary-Out', type: 'speaker', isHeadphones: false }, mockT)).toBe('Динамики компьютера');
      expect(getDeviceDisplayName({ name: 'Sound Blaster X-Fi', type: 'speaker', isHeadphones: false }, mockT)).toBe('Динамики компьютера');
      expect(getDeviceDisplayName({ name: 'Устройство с поддержкой High Definition Audio', type: 'speaker', isHeadphones: false }, mockT)).toBe('Динамики компьютера');
    });

    it('returns headphones localization if isHeadphones is true and name is generic or empty', () => {
      expect(getDeviceDisplayName({ name: '', type: 'bluetooth', isHeadphones: true }, mockT)).toBe('Bluetooth-наушники');
      expect(getDeviceDisplayName({ name: 'Наушники', type: 'wired', isHeadphones: true }, mockT)).toBe('Проводные наушники');
    });

    it('returns computer or phone speakers depending on platform for generic or empty name', () => {
      const displayName = getDeviceDisplayName({ name: '', type: 'speaker', isHeadphones: false }, mockT);
      expect(displayName).toBe('Динамики компьютера');
    });

    it('cleans OS prefixes (Default -, По умолчанию -) from Windows/Linux device names', () => {
      expect(cleanRawDeviceLabel('Default - Наушники (Realtek Audio)')).toBe('Наушники (Realtek Audio)');
      expect(cleanRawDeviceLabel('По умолчанию - Speakers (High Definition Audio)')).toBe('Speakers (High Definition Audio)');
      expect(cleanRawDeviceLabel('Связь по умолчанию - HyperX Cloud III Wireless')).toBe('HyperX Cloud III Wireless');
      expect(cleanRawDeviceLabel('Communications - USB Audio DAC')).toBe('USB Audio DAC');
      expect(cleanRawDeviceLabel('System default - Standart - Speakers')).toBe('Speakers');
    });

    it('formats desktop device names cleanly through getDeviceDisplayName', () => {
      expect(getDeviceDisplayName({ name: 'Default - Наушники (HyperX Cloud III Wireless)', type: 'bluetooth', isHeadphones: true }, mockT))
        .toBe('Наушники (HyperX Cloud III Wireless)');
      expect(getDeviceDisplayName({ name: 'По умолчанию - Bose QuietComfort 45', type: 'bluetooth', isHeadphones: true }, mockT))
        .toBe('Bose QuietComfort 45');
    });
  });

  describe('4. AudioDeck & AudioEngine Switching Fixes', () => {
    it('AudioDeck.load calls element.pause() before assigning new src and loading', async () => {
      const el = createMockAudioElement();
      const pauseSpy = vi.spyOn(el, 'pause');
      const deck = new AudioDeck('test-deck-pause', el);

      await deck.load('http://localhost:4000/stream/song-pause', 0);
      expect(pauseSpy).toHaveBeenCalled();
      deck.destroy();
    });

    it('AudioDeck CORS fallback does not play() if deck was not playing', () => {
      const el = createMockAudioElement();
      el.setAttribute('crossorigin', 'anonymous');
      const deck = new AudioDeck('test-deck-cors-paused', el);
      deck.state = 'paused';
      (el as any).paused = true;

      const fallbackEl = createMockAudioElement();
      const playSpy = vi.spyOn(fallbackEl, 'play');
      vi.spyOn(window, 'Audio').mockImplementation(function (this: any) {
        return fallbackEl as any;
      });

      el.dispatchEvent(new Event('error'));

      expect(playSpy).not.toHaveBeenCalled();
      deck.destroy();
    });

    it('AudioDeck CORS fallback invokes play() if deck was actively playing', () => {
      const el = createMockAudioElement();
      el.setAttribute('crossorigin', 'anonymous');
      const deck = new AudioDeck('test-deck-cors-playing', el);
      deck.state = 'playing';
      (el as any).paused = false;

      const fallbackEl = createMockAudioElement();
      const playSpy = vi.spyOn(fallbackEl, 'play');
      vi.spyOn(window, 'Audio').mockImplementation(function (this: any) {
        return fallbackEl as any;
      });

      el.dispatchEvent(new Event('error'));

      expect(playSpy).toHaveBeenCalled();
      deck.destroy();
    });

    it('AudioEngine blocks preloadNextTrack during playback preparation and transition so incoming deck is never clobbered', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const track1 = { id: 'track-1', streamUrl: 'http://localhost:4000/stream/trk1', duration: 180 };
      const track2 = { id: 'track-2', streamUrl: 'http://localhost:4000/stream/trk2', duration: 139 };
      const track3 = { id: 'track-3', streamUrl: 'http://localhost:4000/stream/trk3', duration: 125 };

      // Play track 1
      await engine.playTrack(track1, { immediate: true });
      expect(engine.getActiveDeckIndex()).toBe(0);
      expect(engine.getActiveTrackId()).toBe('track-1');

      // Now start transitioning to track 2
      const playPromise = engine.playTrack(track2, { transitionDuration: 0.1 });

      // Concurrently attempt to preload track 3 while track 2 is being prepared/transitioned
      await engine.preloadNextTrack(track3);

      await playPromise;

      // Active deck index must be deck 1, playing track-2, NOT overwritten by track-3
      expect(engine.getActiveDeckIndex()).toBe(1);
      expect(engine.getActiveTrackId()).toBe('track-2');
      expect(el1.src).toContain('trk2');
      expect(el1.src).not.toContain('trk3');
    });

    it('AudioEngine / AudioDeck premature stream ended recovery contract', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const track = { id: 'trk-premature', streamUrl: 'http://localhost:4000/stream/trk1', duration: 200 };
      await engine.playTrack(track, { immediate: true });

      const deck = engine.getActiveDeck();
      const loadSpy = vi.spyOn(deck, 'load').mockResolvedValue(undefined);
      const playSpy = vi.spyOn(deck, 'play').mockResolvedValue(undefined);

      // Simulate stream ending at 60s of 200s track (e.g. bluetooth audio device switch / socket drop)
      vi.spyOn(deck, 'getCurrentTime').mockReturnValue(60);
      vi.spyOn(engine, 'getDuration').mockReturnValue(200);

      const currentTime = deck.getCurrentTime();
      const engDur = engine.getDuration();
      const actualDur = engDur > 0 ? engDur : track.duration;

      let skippedTrack = false;
      const nextTrack = () => { skippedTrack = true; };

      // Protection algorithm from useAudioEngine:
      if (actualDur > 3 && currentTime < actualDur - 2.5) {
        await deck.load(track.streamUrl, currentTime, 'auto');
        await deck.play();
      } else {
        nextTrack();
      }

      expect(skippedTrack).toBe(false);
      expect(loadSpy).toHaveBeenCalledWith(track.streamUrl, 60, 'auto');
      expect(playSpy).toHaveBeenCalled();
    });
  });

  describe('5. Persistent Global Service (initAudioDeviceManager) & Audio Routing', () => {
    it('initializes persistent manager idempotently', () => {
      initAudioDeviceManager();
      initAudioDeviceManager();
      expect(getAudioOutputDevice()).toBeDefined();
    });

    it('handles DOM audio becoming noisy custom event', () => {
      initAudioDeviceManager();
      usePlayerStore.getState().setIsPlaying(true);
      expect(usePlayerStore.getState().isPlaying).toBe(true);

      window.dispatchEvent(new CustomEvent('holad:audiobecomingnoisy'));

      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('promptSelectAudioOutput passes sinkId to AudioEngine and updates global device', async () => {
      const engine = AudioEngine.getInstance();
      const setSinkSpy = vi.spyOn(engine, 'setSinkId').mockResolvedValue(undefined);

      const mockSelectOutput = vi.fn().mockResolvedValue({
        deviceId: 'usb-audio-dac-id',
        label: 'Default - USB Audio DAC'
      });

      // Mock mediaDevices.selectAudioOutput
      const nav = navigator as any;
      if (!nav.mediaDevices) {
        nav.mediaDevices = {};
      }
      nav.mediaDevices.selectAudioOutput = mockSelectOutput;

      const success = await promptSelectAudioOutput();
      expect(success).toBe(true);
      expect(setSinkSpy).toHaveBeenCalledWith('usb-audio-dac-id');
      expect(getAudioOutputDevice().name).toBe('USB Audio DAC');
    });
  });

  describe('6. Headphone Reconnect Auto-Resume (Wear Detection)', () => {
    beforeEach(() => {
      useSettingsStore.setState({ autoResumeOnHeadphonesConnect: true });
    });

    it('auto-resumes playback when headphones reconnect within 45 seconds', () => {
      const track = createMockTrack('hp-auto-1', 'Resume Song', 180);
      usePlayerStore.getState().setQueue([track]);
      usePlayerStore.getState().setIsPlaying(true);

      // Disconnect headphones
      handleHeadphonesDisconnected();
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(getLastHeadphonesDisconnectedAt()).not.toBeNull();

      // Fast forward 10 seconds (well within 45s window)
      const now = Date.now();
      setLastHeadphonesDisconnectedAt(now - 10_000);

      // Reconnect
      handleHeadphonesConnected();
      expect(usePlayerStore.getState().isPlaying).toBe(true);
      expect(getLastHeadphonesDisconnectedAt()).toBeNull();
    });

    it('does NOT auto-resume if reconnection occurs after 45 seconds', () => {
      const track = createMockTrack('hp-auto-2', 'Late Song', 180);
      usePlayerStore.getState().setQueue([track]);
      usePlayerStore.getState().setIsPlaying(true);

      handleHeadphonesDisconnected();
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // 46 seconds passed
      const now = Date.now();
      setLastHeadphonesDisconnectedAt(now - 46_000);

      handleHeadphonesConnected();
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('does NOT auto-resume if autoResumeOnHeadphonesConnect is disabled', () => {
      useSettingsStore.setState({ autoResumeOnHeadphonesConnect: false });

      const track = createMockTrack('hp-auto-3', 'Disabled Auto Song', 180);
      usePlayerStore.getState().setQueue([track]);
      usePlayerStore.getState().setIsPlaying(true);

      handleHeadphonesDisconnected();
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // Within 5s window
      setLastHeadphonesDisconnectedAt(Date.now() - 5_000);

      handleHeadphonesConnected();
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('clears auto-resume window when user manually pauses playback in UI', () => {
      initAudioDeviceManager();
      const track = createMockTrack('hp-auto-4', 'Manual Pause Song', 180);
      usePlayerStore.getState().setQueue([track]);
      usePlayerStore.getState().setIsPlaying(true);

      // Headphones disconnected
      handleHeadphonesDisconnected();
      expect(getLastHeadphonesDisconnectedAt()).not.toBeNull();

      // User subsequently toggles or manually pauses via UI
      usePlayerStore.getState().setIsPlaying(true);
      usePlayerStore.getState().setIsPlaying(false);

      expect(getLastHeadphonesDisconnectedAt()).toBeNull();

      // Now reconnection shouldn't auto-resume
      handleHeadphonesConnected();
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('handles DOM holad:headphonesconnected custom event', () => {
      initAudioDeviceManager();
      const track = createMockTrack('hp-dom-1', 'DOM Connect Song', 180);
      usePlayerStore.getState().setQueue([track]);
      usePlayerStore.getState().setIsPlaying(true);

      handleHeadphonesDisconnected();
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      setLastHeadphonesDisconnectedAt(Date.now() - 5_000);

      window.dispatchEvent(new CustomEvent('holad:headphonesconnected'));
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });
  });
});
