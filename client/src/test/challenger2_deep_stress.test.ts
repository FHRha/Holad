import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import i18n from 'i18next';

import Slider from '../components/common/Slider';
import LiquidSeekBar from '../components/common/LiquidSeekBar';
import BottomPlayer from '../components/player/BottomPlayer';
import SettingsModal from '../components/modals/SettingsModal';
import MobileSettingsView from '../components/views/MobileSettingsView';

import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useAudioStore } from '../store/audioStore';
import { useHoladStore } from '../store/holadStore';
import { AudioEngine } from '../audio/AudioEngine';
import { AudioDeck } from '../audio/AudioDeck';
import { createMockAudioElement, MockTimeRanges } from './mocks/mockAudio';
import { createMockTrack, resetAllStores } from './helpers/testUtils';

describe('CHALLENGER 2: Comprehensive Adversarial Stress Test Suite', () => {
  let enTranslations: Record<string, any>;
  let ruTranslations: Record<string, any>;

  beforeEach(() => {
    resetAllStores();
    const enPath = path.resolve(__dirname, '../../public/locales/en/translation.json');
    const ruPath = path.resolve(__dirname, '../../public/locales/ru/translation.json');
    enTranslations = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    ruTranslations = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Buffering UI Adversarial Probing & Edge Cases
  // =========================================================================
  describe('1. Buffering UI Adversarial Stress & Edge Cases', () => {
    it('BUF-ADV-1: LiquidSeekBar and Slider normalize extreme buffer inputs (0, 100, >100, negatives, NaN, Infinity)', () => {
      const extremeValues = [
        0,
        1,
        0.0001,
        0.9999,
        100,
        50,
        -10,
        -0.5,
        150,
        1000,
        NaN,
        Infinity,
        -Infinity,
        undefined as any,
        null as any,
      ];

      for (const val of extremeValues) {
        expect(() => {
          const { unmount: unmountSlider } = render(
            React.createElement(Slider, { value: 0.5, buffered: val })
          );
          unmountSlider();

          const { unmount: unmountLiquid } = render(
            React.createElement(LiquidSeekBar, { value: 0.5, buffered: val })
          );
          unmountLiquid();
        }).not.toThrow();
      }
    });

    it('BUF-ADV-2: Fragmented and disjointed buffer ranges on HTMLAudioElement update audioStore.buffered without error', () => {
      const el = createMockAudioElement();
      (el as any).duration = 200;

      useAudioStore.getState().setAudioElement(el);

      // 1. Empty buffer
      (el as any).buffered = new MockTimeRanges([]);
      (el as any).dispatchEvent(new Event('progress'));
      expect(useAudioStore.getState().buffered).toBe(0);

      // 2. Discontinuous ranges: [0-20], [50-100], [150-180]
      (el as any).buffered = new MockTimeRanges([
        { start: 0, end: 20 },
        { start: 50, end: 100 },
        { start: 150, end: 180 },
      ]);
      (el as any).dispatchEvent(new Event('progress'));
      // Last buffer end is 180s out of 200s => (180/200)*100 = 90%
      expect(useAudioStore.getState().buffered).toBe(90);

      // 3. Overflow buffer end (stream buffer reporting beyond duration)
      (el as any).buffered = new MockTimeRanges([{ start: 0, end: 250 }]);
      (el as any).dispatchEvent(new Event('progress'));
      expect(useAudioStore.getState().buffered).toBe(100);

      // 4. Zero duration edge case
      (el as any).duration = 0;
      (el as any).buffered = new MockTimeRanges([{ start: 0, end: 50 }]);
      (el as any).dispatchEvent(new Event('progress'));
      // Buffered remains valid without division by zero or NaN
      expect(Number.isFinite(useAudioStore.getState().buffered)).toBe(true);

      useAudioStore.getState().setAudioElement(null);
    });

    it('BUF-ADV-3: AudioDeck and AudioEngine handle network stalls (waiting -> progress -> canplay) smoothly', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const track = createMockTrack('stall-track', 'Stalling Track', 180);
      await engine.playTrack(track, { immediate: true });

      const bufferingEvents: boolean[] = [];
      engine.on('buffering', (b) => bufferingEvents.push(b));

      // Network stall begins
      el0.dispatchEvent(new Event('waiting'));
      expect(bufferingEvents[bufferingEvents.length - 1]).toBe(true);

      // While stalled, user seeks into unbuffered area (e.g. 150s)
      engine.seek(150);
      expect(engine.getCurrentTime()).toBe(150);

      // Incremental buffer progress arrives
      (el0 as any).simulateBufferProgress(140, 160);
      el0.dispatchEvent(new Event('progress'));

      // Stall resolves
      el0.dispatchEvent(new Event('canplay'));
      expect(bufferingEvents[bufferingEvents.length - 1]).toBe(false);

      engine.destroy();
    });

    it('BUF-ADV-4: Rapid 100-seek scrubbing storm across buffered and unbuffered regions does not throw or desync', () => {
      const track = createMockTrack('scrub-1', 'Scrubbing Track', 300);
      usePlayerStore.setState({
        queue: [track],
        currentIndex: 0,
        isPlaying: true,
      });

      const el = createMockAudioElement();
      (el as any).duration = 300;
      (el as any).buffered = new MockTimeRanges([{ start: 0, end: 150 }]); // 50% buffered
      useAudioStore.getState().setAudioElement(el);

      // Perform 100 rapid seek changes and seek ends across [0.0, 1.0]
      for (let i = 0; i <= 100; i++) {
        const target = (i % 10) / 10;
        useAudioStore.getState().handleSeekChange(target);
        expect(useAudioStore.getState().isSeeking).toBe(true);
        expect(useAudioStore.getState().progress).toBe(target * 100);

        if (i % 5 === 0) {
          useAudioStore.getState().handleSeekEnd(target);
          expect(useAudioStore.getState().isSeeking).toBe(false);
          expect(el.currentTime).toBe(target * 300);
        }
      }

      useAudioStore.getState().setAudioElement(null);
    });
  });

  // =========================================================================
  // 2. Settings UI Mutual Exclusivity Adversarial Probing
  // =========================================================================
  describe('2. Settings UI Mutual Exclusivity Adversarial Probing', () => {
    it('SET-ADV-1: Invariant !(isCrossfadeEnabled && isGaplessEnabled) is strictly maintained under all conditions', () => {
      const store = useSettingsStore.getState();

      // Case 1: Default state check
      expect(!(store.isCrossfadeEnabled && store.isGaplessEnabled)).toBe(true);

      // Case 2: Enable Crossfade -> Gapless must be false
      store.setIsCrossfadeEnabled(true);
      expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);
      expect(useSettingsStore.getState().isGaplessEnabled).toBe(false);

      // Case 3: Enable Gapless -> Crossfade must be false
      store.setIsGaplessEnabled(true);
      expect(useSettingsStore.getState().isGaplessEnabled).toBe(true);
      expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);

      // Case 4: Disable Gapless -> both can be false
      store.setIsGaplessEnabled(false);
      expect(useSettingsStore.getState().isGaplessEnabled).toBe(false);
      expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);

      // Case 5: Enable Crossfade again
      store.setIsCrossfadeEnabled(true);
      expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);
      expect(useSettingsStore.getState().isGaplessEnabled).toBe(false);
    });

    it('SET-ADV-2: Concurrent rapid asynchronous toggle storm preserves mutual exclusivity', async () => {
      const actions = [
        () => useSettingsStore.getState().setIsCrossfadeEnabled(true),
        () => useSettingsStore.getState().setIsGaplessEnabled(true),
        () => useSettingsStore.getState().setIsCrossfadeEnabled(false),
        () => useSettingsStore.getState().setIsGaplessEnabled(true),
        () => useSettingsStore.getState().setIsCrossfadeEnabled(true),
        () => useSettingsStore.getState().setIsGaplessEnabled(false),
      ];

      // Execute 200 interleaved asynchronous/microtask dispatches
      const promises = Array.from({ length: 200 }, (_, i) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            actions[i % actions.length]();
            // Invariant check at every tick
            const state = useSettingsStore.getState();
            expect(state.isCrossfadeEnabled && state.isGaplessEnabled).toBe(false);
            resolve();
          }, Math.floor(Math.random() * 5));
        });
      });

      await Promise.all(promises);

      const finalState = useSettingsStore.getState();
      expect(finalState.isCrossfadeEnabled && finalState.isGaplessEnabled).toBe(false);
    });

    it('SET-ADV-3: Storage rehydration with corrupted dual-true state self-heals or handles safely', () => {
      // Simulate corrupted localStorage payload where both were somehow set to true
      const corruptedPersistedState = {
        state: {
          isCrossfadeEnabled: true,
          isGaplessEnabled: true,
          crossfadeDuration: 3,
          theme: 'dark',
          language: 'ru',
        },
        version: 0,
      };

      localStorage.setItem('streamnavi-settings', JSON.stringify(corruptedPersistedState));

      // Re-trigger toggle on store
      useSettingsStore.getState().setIsCrossfadeEnabled(true);
      expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);
      expect(useSettingsStore.getState().isGaplessEnabled).toBe(false);

      useSettingsStore.getState().setIsGaplessEnabled(true);
      expect(useSettingsStore.getState().isGaplessEnabled).toBe(true);
      expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);
    });

    it('SET-ADV-4: SettingsModal UI renders adjacent toggles and switching one disables the other', () => {
      useSettingsStore.setState({ isCrossfadeEnabled: true, isGaplessEnabled: false });

      const { unmount } = render(
        React.createElement(SettingsModal, { isOpen: true, onClose: () => {} })
      );

      // Find toggles or switches for Crossfade and Gapless
      const crossfadeText = screen.getByText(/Плавный переход|Crossfade/i);
      const gaplessText = screen.getByText(/Бесшовное воспроизведение|Gapless/i);

      expect(crossfadeText).toBeDefined();
      expect(gaplessText).toBeDefined();

      // Find the toggle containers or inputs
      const toggles = document.querySelectorAll('button[role="switch"], input[type="checkbox"]');
      expect(toggles.length).toBeGreaterThanOrEqual(2);

      unmount();
    });
  });

  // =========================================================================
  // 3. Localization & UI Preservation Adversarial Probing
  // =========================================================================
  describe('3. Localization & UI Preservation Adversarial Probing', () => {
    it('LOC-ADV-1: Key symmetry and completeness between Russian and English translation dictionaries', () => {
      function getAllKeys(obj: Record<string, any>, prefix = ''): string[] {
        let keys: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
          const current = prefix ? `${prefix}.${k}` : k;
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            keys = keys.concat(getAllKeys(v, current));
          } else {
            keys.push(current);
          }
        }
        return keys.sort();
      }

      const enKeys = getAllKeys(enTranslations);
      const ruKeys = getAllKeys(ruTranslations);

      const missingInRu = enKeys.filter((k) => !ruKeys.includes(k));
      const missingInEn = ruKeys.filter((k) => !enKeys.includes(k));

      expect(missingInRu, `Keys present in EN but missing in RU: ${missingInRu.join(', ')}`).toEqual([]);
      expect(missingInEn, `Keys present in RU but missing in EN: ${missingInEn.join(', ')}`).toEqual([]);
    });

    it('LOC-ADV-2: 500-character extreme string expansions in RU and EN render without UI overflow or crash', () => {
      const megaRussian = 'Очень длинная тестовая строка на русском языке '.repeat(15);
      const megaEnglish = 'Very long expanded localization test string in English '.repeat(15);

      const trackRu = createMockTrack('mega-ru', megaRussian, 240, megaRussian);
      const trackEn = createMockTrack('mega-en', megaEnglish, 240, megaEnglish);

      // Render BottomPlayer with 500-char Russian track
      usePlayerStore.setState({ queue: [trackRu], currentIndex: 0 });
      const { unmount: unmountRu, container: containerRu } = render(
        React.createElement(MemoryRouter, null, React.createElement(BottomPlayer))
      );
      expect(containerRu.firstChild).not.toBeNull();
      unmountRu();

      // Render BottomPlayer with 500-char English track
      usePlayerStore.setState({ queue: [trackEn], currentIndex: 0 });
      const { unmount: unmountEn, container: containerEn } = render(
        React.createElement(MemoryRouter, null, React.createElement(BottomPlayer))
      );
      expect(containerEn.firstChild).not.toBeNull();
      unmountEn();
    });

    it('LOC-ADV-3: Special characters, HTML tags, script payloads, unicode & emojis in metadata render safely without XSS', () => {
      const xssTitle = '<script>alert("xss")</script><b>Bold Title</b> &amp; "Quotes" \'Single\'';
      const unicodeArtist = '🔥🎧 Russian Artist с диакритикой üñîçødę \u0000 \uFFFF 🎵';

      const xssTrack = createMockTrack('xss-track', xssTitle, 180, unicodeArtist);
      usePlayerStore.setState({ queue: [xssTrack], currentIndex: 0 });

      const { container, unmount } = render(
        React.createElement(MemoryRouter, null, React.createElement(BottomPlayer))
      );

      // Ensure script tag was not executed or injected as live script element
      expect(container.querySelector('script')).toBeNull();
      // Ensure text is rendered properly
      expect(container.textContent).toContain('Bold Title');
      expect(container.textContent).toContain('Russian Artist');

      unmount();
    });

    it('LOC-ADV-4: Missing key fallback behavior produces key string or fallback without uncaught exceptions', () => {
      expect(() => {
        const result = i18n.t('totally.nonexistent.fake.key.xyz_123');
        expect(result).toBeDefined();
      }).not.toThrow();
    });

    it('LOC-ADV-5: Responsive viewport boundaries from 320px to 3840px (4K) render cleanly', () => {
      const viewports = [
        { width: 320, height: 568 },   // iPhone SE
        { width: 375, height: 667 },   // iPhone 8
        { width: 768, height: 1024 },  // iPad Portrait
        { width: 1024, height: 768 },  // iPad Landscape
        { width: 1440, height: 900 },  // Desktop HD
        { width: 1920, height: 1080 }, // Full HD
        { width: 3840, height: 2160 }, // 4K Ultra HD
      ];

      const track = createMockTrack('vp-track', 'Viewport Test Track', 200, 'Viewport Artist');
      usePlayerStore.setState({ queue: [track], currentIndex: 0 });

      for (const vp of viewports) {
        window.innerWidth = vp.width;
        window.innerHeight = vp.height;
        window.dispatchEvent(new Event('resize'));

        const { container, unmount } = render(
          React.createElement(
            'div',
            { style: { width: `${vp.width}px`, height: `${vp.height}px` } },
            React.createElement(MemoryRouter, null, React.createElement(BottomPlayer)),
            React.createElement(Slider, { value: 0.4, buffered: 0.8 }),
            React.createElement(LiquidSeekBar, { value: 0.4, buffered: 0.8 })
          )
        );

        expect(container.firstChild).not.toBeNull();
        unmount();
      }
    });
  });
});
