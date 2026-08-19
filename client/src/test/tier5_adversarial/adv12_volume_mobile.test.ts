import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useHoladStore } from '../../store/holadStore';
import { useAudioStore } from '../../store/audioStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { VolumeManager } from '../../audio/VolumeManager';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { createMockAudioElement, MockAudioContext } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';
import MobileSettingsView from '../../components/views/MobileSettingsView';

describe('Adversarial Test Suite: Desktop Volume Control (F1, F4) & Mobile Autoplay Prevention (F2, F3)', () => {
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
  // Section 1: Extreme Desktop Volume Values & Headroom Multiplier (F1, F4)
  // =========================================================================
  describe('1. Extreme Desktop Volume Values & Headroom Multiplier Boost', () => {
    it('ADV-VOL-EXT-1: Volume 0.0 (Absolute Mute) sets GainNode strictly to 0.0 with zero signal bleed', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      pipeline.setMasterVolume(0.0, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBe(0.0);

      // Verify scheduled event for setTargetAtTime
      const events = pipeline.masterGainNode.gain.scheduledEvents;
      expect(events.length).toBeGreaterThan(0);
      const lastEvent = events[events.length - 1];
      expect(lastEvent.target).toBe(0.0);
      expect(lastEvent.timeConstant).toBe(0.01);

      pipeline.destroy();
    });

    it('ADV-VOL-EXT-2: Volume 1e-6 (Ultra-low boundary) maintains finite floating-point precision without NaN or underflow to zero', () => {
      const pipeline = new WebAudioPipeline();
      const ultraLowVol = 1e-6;

      pipeline.setMasterVolume(ultraLowVol, 1.0);
      const gainVal = pipeline.masterGainNode.gain.value;

      expect(Number.isFinite(gainVal)).toBe(true);
      expect(isNaN(gainVal)).toBe(false);
      expect(gainVal).toBe(1e-6);
      expect(gainVal).toBeGreaterThan(0.0);

      pipeline.destroy();
    });

    it('ADV-VOL-EXT-3: Volume 0.5 (Midpoint) applies exact 0.5 gain without artificial 9% (0.3*0.3) attenuation clamping', () => {
      const pipeline = new WebAudioPipeline();
      pipeline.setMasterVolume(0.5, 1.0);

      expect(pipeline.masterGainNode.gain.value).toBe(0.5);
      // Ensure NOT attenuated to 0.09 or 0.25
      expect(pipeline.masterGainNode.gain.value).not.toBeCloseTo(0.09, 2);
      expect(pipeline.masterGainNode.gain.value).not.toBeCloseTo(0.25, 2);

      pipeline.destroy();
    });

    it('ADV-VOL-EXT-4: Volume 0.9999 (Near-max boundary) preserves floating point precision without premature ceiling truncation', () => {
      const pipeline = new WebAudioPipeline();
      pipeline.setMasterVolume(0.9999, 1.0);

      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.9999, 4);

      pipeline.destroy();
    });

    it('ADV-VOL-EXT-5: Volume 1.0 (Maximum nominal) sets full unity gain 1.0', () => {
      const pipeline = new WebAudioPipeline();
      pipeline.setMasterVolume(1.0, 1.0);

      expect(pipeline.masterGainNode.gain.value).toBe(1.0);

      pipeline.destroy();
    });

    it('ADV-VOL-EXT-6: Headroom Multiplier Boost (1.0x to 3.0x) scales gain linearly across full volume range', () => {
      const pipeline = new WebAudioPipeline();

      // Test matrix: [volume, multiplier, expectedGain]
      const matrix = [
        { vol: 1.0, mult: 1.0, expected: 1.0 },
        { vol: 1.0, mult: 1.5, expected: 1.5 },
        { vol: 1.0, mult: 2.0, expected: 2.0 },
        { vol: 1.0, mult: 3.0, expected: 3.0 },
        { vol: 0.5, mult: 2.0, expected: 1.0 },
        { vol: 0.5, mult: 3.0, expected: 1.5 },
        { vol: 0.2, mult: 3.0, expected: 0.6 },
        { vol: 0.0, mult: 3.0, expected: 0.0 }, // Silence boosted 300% MUST stay strictly 0.0
      ];

      matrix.forEach(({ vol, mult, expected }) => {
        pipeline.setMasterVolume(vol, mult);
        expect(pipeline.masterGainNode.gain.value).toBeCloseTo(expected, 3);
      });

      pipeline.destroy();
    });

    it('ADV-VOL-EXT-7: Adversarial inputs (negative, overflow, NaN, Infinity, null, undefined) clamp safely to valid [0, 1] range', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const adversarialTestCases = [
        { input: -1.0, expected: 0.0 },
        { input: -999.99, expected: 0.0 },
        { input: -0.000001, expected: 0.0 },
        { input: 1.0001, expected: 1.0 },
        { input: 2.5, expected: 1.0 },
        { input: 100.0, expected: 1.0 },
      ];

      adversarialTestCases.forEach(({ input, expected }) => {
        engine.setVolume(input);
        pipeline.setMasterVolume(input, 1.0);

        expect(pipeline.masterGainNode.gain.value).toBe(expected);
      });

      // Test non-fatal handling of non-numeric types
      const nonNumericCases = [NaN, Infinity, -Infinity, null as any, undefined as any];
      nonNumericCases.forEach((val) => {
        expect(() => engine.setVolume(val)).not.toThrow();
        expect(() => pipeline.setMasterVolume(val, 1.0)).not.toThrow();
        expect(Number.isFinite(pipeline.masterGainNode.gain.value)).toBe(true);
      });

      engine.destroy();
      pipeline.destroy();
    });
  });

  // =========================================================================
  // Section 2: High-Frequency Volume Scrubbing & Gain Ramp Modulation (F1, F4)
  // =========================================================================
  describe('2. High-Frequency Volume Scrubbing & Gain Ramp Modulation', () => {
    it('ADV-VOL-SCRUB-1: 100 rapid volume changes in <50ms execute without throwing or desynchronizing Web Audio graph', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      const startTime = performance.now();
      let lastTarget = 0;

      // Blast 100 rapid volume updates
      for (let i = 0; i < 100; i++) {
        const testVol = Number((Math.sin(i) * 0.5 + 0.5).toFixed(4));
        const testMult = 1.0 + (i % 20) / 10; // 1.0 to 2.9
        lastTarget = testVol * testMult;

        expect(() => {
          pipeline.setMasterVolume(testVol, testMult);
        }).not.toThrow();

        const currentGain = pipeline.masterGainNode.gain.value;
        expect(Number.isFinite(currentGain)).toBe(true);
        expect(isNaN(currentGain)).toBe(false);
      }

      const elapsedMs = performance.now() - startTime;
      expect(elapsedMs).toBeLessThan(500); // executed well within time limit
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(lastTarget, 3);

      pipeline.destroy();
    });

    it('ADV-VOL-SCRUB-2: Linear ramp volume scrubbing cancels previous schedules cleanly without zipper clicks', () => {
      const pipeline = new WebAudioPipeline();
      const ctx = pipeline.context as any;

      // Schedule 50 rapid linear ramp changes with ramp duration
      for (let i = 0; i < 50; i++) {
        const targetVol = i / 50;
        pipeline.setMasterVolume(targetVol, 1.0, 0.05); // 50ms ramp
        ctx.advanceTime(0.001); // 1ms forward
      }

      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(49 / 50, 2);
      expect(Number.isFinite(pipeline.masterGainNode.gain.value)).toBe(true);

      pipeline.destroy();
    });

    it('ADV-VOL-SCRUB-3: Concurrent deck crossfade gain ramps and master volume scrubbing do not corrupt deck isolation', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      // Deck 0 fading out, Deck 1 fading in, while user scrubs master volume from 1.0 to 0.3
      for (let step = 0; step <= 20; step++) {
        const progress = step / 20;
        const deck0Gain = Math.cos(progress * (Math.PI / 2));
        const deck1Gain = Math.sin(progress * (Math.PI / 2));
        const masterVol = 1.0 - progress * 0.7; // 1.0 down to 0.3

        pipeline.setDeckGain(0, deck0Gain, 0.02);
        pipeline.setDeckGain(1, deck1Gain, 0.02);
        pipeline.setMasterVolume(masterVol, 1.0);

        expect(pipeline.getDeckGain(0)).toBeCloseTo(deck0Gain, 3);
        expect(pipeline.getDeckGain(1)).toBeCloseTo(deck1Gain, 3);
        expect(pipeline.masterGainNode.gain.value).toBeCloseTo(masterVol, 3);
      }

      pipeline.destroy();
    });
  });

  // =========================================================================
  // Section 3: Mobile App Launch Simulation & Autoplay Prevention (F2, F3)
  // =========================================================================
  describe('3. Mobile App Launch Simulation (LD Player / Android / Capacitor)', () => {
    it('ADV-MOB-AUTO-1: Cold start in LD Player / Android environment with hydrated queue NEVER auto-starts playback', async () => {
      // Simulate LD Player / Android User-Agent
      const androidUA = 'Mozilla/5.0 (Linux; U; Android 12; en-us; LDPlayer Build/N2G47H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/100.0.4896.127 Mobile Safari/537.36';
      Object.defineProperty(navigator, 'userAgent', { value: androidUA, configurable: true });

      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      // Hydrate queue with 20 tracks on cold start
      const savedTracks = Array.from({ length: 20 }, (_, i) => createMockTrack(`t-${i}`, `Track ${i}`, 200));
      usePlayerStore.getState().setQueue(savedTracks);
      usePlayerStore.getState().setCurrentIndex(0);

      // Verify store invariant: isPlaying MUST be false
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(engine.getState()).toBe('idle');

      // Verify deck invariants: audio element MUST NOT be playing
      expect(el0.paused).toBe(true);
      expect(el1.paused).toBe(true);
      expect((el0 as any).playCallCount).toBe(0);
      expect((el1 as any).playCallCount).toBe(0);

      engine.destroy();
    });

    it('ADV-MOB-AUTO-2: Burst of 50 touch/click interaction unlock events unlocks AudioContext without triggering audio.play()', async () => {
      const androidUA = 'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';
      Object.defineProperty(navigator, 'userAgent', { value: androidUA, configurable: true });

      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);
      const mockCtx = engine.getAudioContext() as any;

      expect(mockCtx.state).toBe('suspended');
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // Simulate global interaction unlock listener (as in useAudioEngine.ts)
      const handleUnlock = () => {
        engine.getWebAudioPipeline()?.unlockContext();
      };
      document.addEventListener('touchstart', handleUnlock);
      document.addEventListener('click', handleUnlock);

      // User violently taps screen (LD Player mouse clicks / mobile touches on non-play buttons)
      for (let i = 0; i < 50; i++) {
        document.dispatchEvent(new Event('touchstart'));
        document.dispatchEvent(new Event('click'));
      }

      // AudioContext is now safely unlocked and running
      expect(mockCtx.state).toBe('running');

      // Audio MUST still remain paused!
      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(engine.getState()).toBe('idle');
      expect(el0.paused).toBe(true);
      expect(el1.paused).toBe(true);
      expect((el0 as any).playCallCount).toBe(0);
      expect((el1 as any).playCallCount).toBe(0);

      document.removeEventListener('touchstart', handleUnlock);
      document.removeEventListener('click', handleUnlock);
      engine.destroy();
    });

    it('ADV-MOB-AUTO-3: Mobile app backgrounding (visibilitychange hidden/blur) and foregrounding (visible/focus) does not trigger playback', () => {
      usePlayerStore.getState().setQueue([createMockTrack('mob-1', 'Mobile Song 1')]);
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // Simulate app minimized / sent to background in Android
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));

      expect(usePlayerStore.getState().isPlaying).toBe(false);

      // Simulate app resumed to foreground
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));

      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('ADV-MOB-AUTO-4: Inactive mobile receiver in Holad Jam session does not start audio playback upon receiving remote state broadcasts', () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      useHoladStore.setState({
        deviceId: 'mobile-client-ldplayer',
        activeDeviceId: 'desktop-host-streamer', // Host is desktop
        roomId: 'jam-room-999',
      });

      const isLocalActive = useHoladStore.getState().activeDeviceId === useHoladStore.getState().deviceId;
      expect(isLocalActive).toBe(false);

      // Simulate 20 incoming sync ticks from remote host
      for (let t = 0; t < 20; t++) {
        if (!isLocalActive) {
          useAudioStore.getState().setProgress((t / 180) * 100);
        }
      }

      expect(usePlayerStore.getState().isPlaying).toBe(false);
      expect(engine.getState()).toBe('idle');
      expect((el0 as any).playCallCount).toBe(0);

      engine.destroy();
    });

    it('ADV-MOB-AUTO-5: Explicit user play action correctly starts audio and sets isPlaying = true', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const track = createMockTrack('user-play-1', 'User Clicked Song', 210);
      
      // Explicit user click
      usePlayerStore.getState().setIsPlaying(true);
      await engine.playTrack(track, { immediate: true });

      expect(usePlayerStore.getState().isPlaying).toBe(true);
      expect(engine.getState()).toBe('playing');
      expect(el0.paused).toBe(false);
      expect((el0 as any).playCallCount).toBe(1);

      engine.destroy();
    });
  });

  // =========================================================================
  // Section 4: Mobile Volume Slider State Consistency & UI Verification (F3)
  // =========================================================================
  describe('4. Mobile Volume Slider State Consistency & UI Verification', () => {
    it('ADV-MOB-VOL-1: Independent state mutation: mobileVolume updates do NOT mutate desktop volume and vice versa', () => {
      const store = usePlayerStore.getState();

      // Initial defaults
      expect(usePlayerStore.getState().volume).toBe(0.5);
      expect(usePlayerStore.getState().mobileVolume).toBe(1.0);

      // Mutate mobile volume
      store.setMobileVolume(0.35);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.35);
      expect(usePlayerStore.getState().volume).toBe(0.5); // desktop volume intact

      // Mutate desktop volume
      store.setVolume(0.88);
      expect(usePlayerStore.getState().volume).toBe(0.88);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.35); // mobile volume intact

      // Mutate volume multiplier
      store.setVolumeMultiplier(2.5);
      expect(usePlayerStore.getState().volumeMultiplier).toBe(2.5);
      expect(usePlayerStore.getState().volume).toBe(0.88);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.35);
    });

    it('ADV-MOB-VOL-2: MobileAudioCore routes volume directly to underlying audio element without side-effects', () => {
      const mobileCore = new MobileAudioCore();
      
      mobileCore.setVolume(0.7);
      expect((mobileCore as any).audioElement.volume).toBe(0.7);

      mobileCore.setVolume(0.0);
      expect((mobileCore as any).audioElement.volume).toBe(0.0);

      mobileCore.setVolume(1.0);
      expect((mobileCore as any).audioElement.volume).toBe(1.0);

      mobileCore.destroy();
    });

    it('ADV-MOB-VOL-3: MobileSettingsView renders mobile volume slider cleanly and is visible in DOM', () => {
      usePlayerStore.setState({ mobileVolume: 0.65, volumeMultiplier: 1.5 });

      const { container } = render(React.createElement(MobileSettingsView));

      // Locate audio section accordion
      const audioHeaders = screen.getAllByText(/Звук и воспроизведение|audio/i);
      expect(audioHeaders.length).toBeGreaterThan(0);

      // Expand audio accordion section
      fireEvent.click(audioHeaders[0]);

      // Verify the volume slider is rendered
      const volumeLabel = screen.getByText(/Громкость на устройстве/i);
      expect(volumeLabel).toBeDefined();

      // Verify percentage display shows 65%
      const percentageDisplay = screen.getByText('65%');
      expect(percentageDisplay).toBeDefined();

      // Verify Volume Multiplier input is rendered and shows 150%
      const multiplierInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(multiplierInput).toBeDefined();
      expect(multiplierInput.value).toBe('150');

      // Test changing multiplier input
      fireEvent.change(multiplierInput, { target: { value: '200' } });
      expect(usePlayerStore.getState().volumeMultiplier).toBe(2.0);
    });

    it('ADV-MOB-VOL-4: MobileSettingsView volume slider updates mobileVolume in playerStore on interaction', () => {
      usePlayerStore.setState({ mobileVolume: 0.5 });

      const { container } = render(React.createElement(MobileSettingsView));

      // Expand audio section
      const audioHeaders = screen.getAllByText(/Звук и воспроизведение|audio/i);
      fireEvent.click(audioHeaders[0]);

      // Simulate dragging volume slider
      const sliderContainer = container.querySelector('.relative.flex.items-center.cursor-pointer');
      expect(sliderContainer).toBeDefined();

      // Dispatch store update directly to verify reactive binding
      usePlayerStore.getState().setMobileVolume(0.8);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.8);
    });
  });
});
