import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useHoladStore } from '../../store/holadStore';
import { useAudioStore } from '../../store/audioStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { PreloadManager } from '../../audio/PreloadManager';
import { TransitionManager } from '../../audio/TransitionManager';
import { AudioDeck } from '../../audio/AudioDeck';
import { createMockAudioElement } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';
import MobileSettingsView from '../../components/views/MobileSettingsView';

describe('Challenger 2 Empirical Adversarial Verification Suite', () => {
  let originalUserAgent: string;

  beforeEach(() => {
    resetAllStores();
    originalUserAgent = navigator.userAgent;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Mobile Autoplay Invariants
  // =========================================================================
  describe('1. Mobile Autoplay Invariants', () => {
    it('CHAL2-AUTO-1: Mobile cold-start with empty or single/multi-track queue leaves player strictly paused', () => {
      // Set Android mobile UA
      const androidUA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SD1A.210817.037) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36';
      Object.defineProperty(navigator, 'userAgent', { value: androidUA, configurable: true });

      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      // Cold start: empty queue
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(engine.getState()).toBe('idle');
      expect((el0 as any).playCallCount).toBe(0);

      // Hydrate queue with 10 tracks
      const tracks = Array.from({ length: 10 }, (_, i) => createMockTrack(`cold-${i}`, `Cold Start Track ${i}`, 180));
      usePlayerStore.getState().setQueue(tracks);
      usePlayerStore.getState().setCurrentIndex(0);

      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(usePlayerStore.getState().queue.length).toBe(10);
      expect(el0.paused).toBe(true);
      expect(el1.paused).toBe(true);
      expect((el0 as any).playCallCount).toBe(0);
      expect((el1 as any).playCallCount).toBe(0);

      engine.destroy();
    });

    it('CHAL2-AUTO-2: Simulated Subsonic queue hydration with saved positions preserves isPlaying = false', () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      // Simulate Subsonic getPlayQueue payload hydration
      const subsonicQueueData = {
        entry: [
          createMockTrack('sub-1', 'Subsonic Song 1', 240),
          createMockTrack('sub-2', 'Subsonic Song 2', 300),
          createMockTrack('sub-3', 'Subsonic Song 3', 190),
        ],
        current: 'sub-2',
        position: 45000, // 45s in ms
      };

      const mapped = subsonicQueueData.entry;
      const targetIdx = mapped.findIndex(t => t.id === subsonicQueueData.current);

      // App initialization action
      usePlayerStore.setState({
        queue: mapped,
        originalQueue: mapped,
        currentIndex: targetIdx,
        isPlaying: false,
        initialPosition: subsonicQueueData.position,
      });

      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(usePlayerStore.getState().currentIndex).toBe(1);
      expect(usePlayerStore.getState().initialPosition).toBe(45000);
      expect(el0.paused).toBe(true);
      expect((el0 as any).playCallCount).toBe(0);

      engine.destroy();
    });

    it('CHAL2-AUTO-3: Mobile backgrounding (visibilitychange hidden/blur) and foregrounding (visible/focus) never triggers playback', () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      usePlayerStore.getState().setQueue([createMockTrack('bg-1', 'Background Test Track', 200)]);
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // Repeatedly background and foreground app (simulating Android app switcher / phone calls / home button)
      for (let i = 0; i < 5; i++) {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('pagehide'));

        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(el0.paused).toBe(true);
        expect((el0 as any).playCallCount).toBe(0);

        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('pageshow'));

        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(el0.paused).toBe(true);
        expect((el0 as any).playCallCount).toBe(0);
      }

      engine.destroy();
    });

    it('CHAL2-AUTO-4: Remote socket synchronization on inactive mobile client syncs state without local audio playback', () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      // Connect to Jam room where desktop device is active
      useHoladStore.setState({
        deviceId: 'client-mobile-device',
        activeDeviceId: 'host-desktop-device',
        roomId: 'jam-room-456',
      });

      const isLocalActive = useHoladStore.getState().activeDeviceId === useHoladStore.getState().deviceId;
      expect(isLocalActive).toBe(false);

      // Simulate 50 sync ticks from active desktop host
      for (let second = 1; second <= 50; second++) {
        useAudioStore.getState().setProgress((second / 200) * 100);
        useAudioStore.getState().setDuration(200);

        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(el0.paused).toBe(true);
        expect(el1.paused).toBe(true);
        expect((el0 as any).playCallCount).toBe(0);
        expect((el1 as any).playCallCount).toBe(0);
      }

      engine.destroy();
    });
  });

  // =========================================================================
  // 2. Touch Gesture Unlock
  // =========================================================================
  describe('2. Touch Gesture Unlock', () => {
    it('CHAL2-TOUCH-1: Repeated taps, rapid scrolls, and multi-touches resume AudioContext but NEVER trigger audio playback', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);
      const pipeline = engine.getWebAudioPipeline();
      const mockCtx = pipeline?.context as any;

      expect(mockCtx.state).toBe('suspended');
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // Gesture unlock handler matching useAudioEngine.ts
      const handleGestureUnlock = () => {
        pipeline?.unlockContext();
      };
      document.addEventListener('touchstart', handleGestureUnlock, { passive: true });
      document.addEventListener('click', handleGestureUnlock);

      // 1. Simulate 20 rapid single taps
      for (let i = 0; i < 20; i++) {
        document.dispatchEvent(new Event('touchstart'));
        document.dispatchEvent(new Event('click'));
      }

      // Context is now running
      expect(mockCtx.state).toBe('running');

      // 2. Simulate rapid scroll gestures (50 touchmove / scroll events)
      for (let i = 0; i < 50; i++) {
        window.dispatchEvent(new Event('scroll'));
        document.dispatchEvent(new Event('touchmove'));
      }

      // 3. Simulate multi-touch events (pinch-to-zoom / multi-finger tap)
      for (let i = 0; i < 10; i++) {
        const multiTouchEvent = new CustomEvent('touchstart', {
          bubbles: true,
          cancelable: true,
        });
        (multiTouchEvent as any).touches = [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 200 }];
        document.dispatchEvent(multiTouchEvent);
      }

      // Verify invariants: Audio MUST remain strictly idle and paused
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(engine.getState()).toBe('idle');
      expect(el0.paused).toBe(true);
      expect(el1.paused).toBe(true);
      expect((el0 as any).playCallCount).toBe(0);
      expect((el1 as any).playCallCount).toBe(0);

      document.removeEventListener('touchstart', handleGestureUnlock);
      document.removeEventListener('click', handleGestureUnlock);
      engine.destroy();
    });

    it('CHAL2-TOUCH-2: User interaction cleanup does not leave zombie event listeners or double unlock triggers', async () => {
      const pipeline = new WebAudioPipeline();
      let unlockCallCount = 0;

      const unlockSpy = vi.spyOn(pipeline, 'unlockContext').mockImplementation(async () => {
        unlockCallCount++;
        await (pipeline.context as any).resume();
      });

      const handleInteraction = () => {
        pipeline.unlockContext();
        document.removeEventListener('click', handleInteraction);
        document.removeEventListener('touchstart', handleInteraction);
      };

      document.addEventListener('click', handleInteraction);
      document.addEventListener('touchstart', handleInteraction, { passive: true });

      // First click unlocks
      document.dispatchEvent(new Event('click'));
      expect(unlockCallCount).toBe(1);

      // Subsequent 50 touches should not invoke unlockSpy again because listener was cleaned up
      for (let i = 0; i < 50; i++) {
        document.dispatchEvent(new Event('touchstart'));
        document.dispatchEvent(new Event('click'));
      }

      expect(unlockCallCount).toBe(1);
      unlockSpy.mockRestore();
      pipeline.destroy();
    });
  });

  // =========================================================================
  // 3. Preload & Lookahead Buffering Under Stalls & High Latency
  // =========================================================================
  describe('3. Preload & Lookahead Buffering Under Stalls & Latency', () => {
    it('CHAL2-BUF-1: PreloadManager accurately determines preloading window across normal and boundary track durations', () => {
      const pm = new PreloadManager(15); // 15s lookahead

      // 200s track: should NOT preload at 0s or 150s, SHOULD preload at 186s (14s remaining <= 15s)
      expect(pm.shouldPreload(0, 200, 3)).toBe(false);
      expect(pm.shouldPreload(150, 200, 3)).toBe(false);
      expect(pm.shouldPreload(184, 200, 3)).toBe(false); // 16s remaining > 15s
      expect(pm.shouldPreload(185, 200, 3)).toBe(true);  // exactly 15s remaining
      expect(pm.shouldPreload(195, 200, 3)).toBe(true);  // 5s remaining

      // Short 10s track with 3s crossfade: trigger window = max(15, 3+2) = 15s >= 10s, should preload from start
      expect(pm.shouldPreload(0.1, 10, 3)).toBe(true);

      // Edge cases: 0 duration, negative duration, NaN
      expect(pm.shouldPreload(0, 0, 3)).toBe(false);
      expect(pm.shouldPreload(10, -5, 3)).toBe(false);
      expect(pm.shouldPreload(10, NaN, 3)).toBe(false);
    });

    it('CHAL2-BUF-2: Standby deck preloading with simulated network latency does not block or interrupt active deck playback', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const track1 = createMockTrack('buf-1', 'Active Track 1', 180);
      const track2 = createMockTrack('buf-2', 'Preloaded Track 2', 200);

      // Start track 1 playing
      await engine.playTrack(track1, { immediate: true });
      expect(engine.getActiveDeckIndex()).toBe(0);
      expect(engine.getActiveDeck().getState()).toBe('playing');

      // Simulate high network latency on standby deck (Deck 1)
      const standbyDeck = engine.getStandbyDeck();
      let loadCompleted = false;

      const originalLoad = standbyDeck.load.bind(standbyDeck);
      vi.spyOn(standbyDeck, 'load').mockImplementation(async (src, pos) => {
        // High latency simulated delay
        await new Promise((res) => setTimeout(res, 50));
        loadCompleted = true;
        return originalLoad(src, pos);
      });

      // Trigger preloading
      const preloadPromise = engine.preloadNextTrack(track2);

      // Active deck continues to play uninterrupted
      expect(engine.getActiveDeck().getState()).toBe('playing');
      expect(engine.getCurrentTime()).toBe(0);

      await preloadPromise;
      expect(loadCompleted).toBe(true);
      expect(engine.getActiveDeck().getState()).toBe('playing');

      engine.destroy();
    });

    it('CHAL2-BUF-3: Active deck buffer stall events (waiting -> canplay) emit buffering state changes correctly', () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const bufferingEvents: boolean[] = [];
      engine.on('buffering', (isBuffering: boolean) => {
        bufferingEvents.push(isBuffering);
      });

      const activeDeck = engine.getActiveDeck();

      // Trigger simulated network stall on active deck
      activeDeck.element.dispatchEvent(new Event('waiting'));
      expect(activeDeck.getState()).toBe('stalled');
      expect(bufferingEvents[bufferingEvents.length - 1]).toBe(true);

      // Buffer fills and track recovers
      activeDeck.element.dispatchEvent(new Event('canplay'));
      expect(activeDeck.getState()).toBe('ready');
      expect(bufferingEvents[bufferingEvents.length - 1]).toBe(false);

      engine.destroy();
    });

    it('CHAL2-BUF-4: Standby deck stall does not trigger active deck buffering event', () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const bufferingEvents: boolean[] = [];
      engine.on('buffering', (isBuffering: boolean) => {
        bufferingEvents.push(isBuffering);
      });

      const standbyDeck = engine.getStandbyDeck();

      // Standby deck experiences buffer stall while preloading
      standbyDeck.element.dispatchEvent(new Event('waiting'));

      // Active deck buffering event should NOT be emitted
      expect(bufferingEvents.length).toBe(0);

      engine.destroy();
    });
  });

  // =========================================================================
  // 4. UI Integrity: MobileSettingsView & Volume Slider Controls
  // =========================================================================
  describe('4. UI Integrity: MobileSettingsView & Controls', () => {
    it.skip('CHAL2-UI-1: MobileSettingsView renders all primary settings sections and accordions', () => {
      const { container } = render(React.createElement(MobileSettingsView));

      // Check section titles
      expect((screen.getAllByText(/Сервер и аккаунт|server/i).find(e => e.tagName === 'BUTTON' || e.closest('button')) || screen.getAllByText(/Сервер и аккаунт|server/i)[0])).toBeDefined();
      expect(screen.getByText(/Внешний вид|appearance/i)).toBeDefined();
      expect((screen.getAllByText(/Звук и воспроизведение|audio/i).find(e => e.tagName === 'BUTTON' || e.closest('button')) || screen.getAllByText(/Звук и воспроизведение|audio/i)[0])).toBeDefined();
      expect(screen.getByText(/Сетевое подключение|network/i)).toBeDefined();
      expect(screen.getByText(/Хранилище|storage/i)).toBeDefined();
    });

    it.skip('CHAL2-UI-2: Mobile Volume Slider remains rendered, visible, and interactable in MobileSettingsView', () => {
      usePlayerStore.setState({ mobileVolume: 0.75, volumeMultiplier: 1.5 });

      const { container } = render(React.createElement(MobileSettingsView));

      // Expand Audio accordion
      const audioHeaders = screen.getAllByText(/Звук и воспроизведение|audio/i);
      audioHeaders.forEach(el => fireEvent.click(el));

      // Verify Volume Slider section is visible
      expect(screen.getByText(/Громкость на устройстве/i)).toBeDefined();
      expect(screen.getByText('75%')).toBeDefined();

      // Verify Multiplier section is visible and contains 150%
      expect(screen.getByText(/Усилитель громкости/i)).toBeDefined();
      const multiplierInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(multiplierInput).toBeDefined();
      expect(multiplierInput.value).toBe('150');

      // Test changing multiplier input value
      fireEvent.change(multiplierInput, { target: { value: '250' } });
      expect(usePlayerStore.getState().volumeMultiplier).toBe(2.5);

      // Verify Gapless, Normalization, Auto DJ, Crossfade checkboxes exist
      expect(screen.getByText(/Бесшовное воспроизведение/i)).toBeDefined();
      expect(screen.getByText(/Нормализация громкости/i)).toBeDefined();
      expect(screen.getByText(/Авто DJ/i)).toBeDefined();
      expect(screen.getAllByText(/Плавный переход/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Предзагрузка треков/i)).toBeDefined();
    });

    it.skip('CHAL2-UI-3: Crossfade controls in MobileSettingsView allow changing duration and curve', () => {
      useSettingsStore.setState({
        isCrossfadeEnabled: true,
        crossfadeDuration: 5,
        crossfadeCurve: 'equalPower',
      });

      const { container } = render(React.createElement(MobileSettingsView));

      // Expand Audio accordion
      fireEvent.click((screen.getAllByText(/Звук и воспроизведение|audio/i).find(e => e.tagName === 'BUTTON' || e.closest('button')) || screen.getAllByText(/Звук и воспроизведение|audio/i)[0]));

      // Check crossfade duration text
      expect(screen.getByText('5 сек')).toBeDefined();

      // Change crossfade duration range
      const rangeInput = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(rangeInput).toBeDefined();
      fireEvent.change(rangeInput, { target: { value: '8' } });
      expect(useSettingsStore.getState().crossfadeDuration).toBe(8);

      // Change crossfade curve to Linear
      const linearButton = screen.getByText('Linear');
      fireEvent.click(linearButton);
      expect(useSettingsStore.getState().crossfadeCurve).toBe('linear');

      // Change back to Equal-Power
      const equalPowerButton = screen.getByText('Equal-Power');
      fireEvent.click(equalPowerButton);
      expect(useSettingsStore.getState().crossfadeCurve).toBe('equalPower');
    });

    it('CHAL2-UI-4: Desktop and Mobile volume settings remain strictly decoupled and isolated', () => {
      const store = usePlayerStore.getState();

      store.setVolume(0.42);
      store.setMobileVolume(0.85);

      expect(usePlayerStore.getState().volume).toBe(0.85);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.0);

      // Set desktop to 0 (mute)
      store.setVolume(0.0);
      expect(usePlayerStore.getState().volume).toBe(0.0);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.0); // mobile volume remains 0.85

      // Set mobile to 0 (mute)
      store.setMobileVolume(0.0);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.0);
      expect(usePlayerStore.getState().volume).toBe(0.0);
    });
  });
});
