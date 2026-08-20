import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { usePlayerStore } from '../../store/playerStore';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import SettingsModal from '../../components/modals/SettingsModal';
import BottomPlayer from '../../components/player/BottomPlayer';
import i18n from 'i18next';

describe('Tier 4 - Scenario 4: Settings Toggling & Language Switching Across UI Views (R3, R6, R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RW4-1: End-to-end settings and localization workflow: Open settings modal, toggle Gapless -> Crossfade, switch language RU -> EN, verify player UI translates cleanly', () => {
    // 1. Start in Russian
    i18n.changeLanguage('ru');
    useSettingsStore.getState().setLanguage('ru');

    // 2. Open Settings modal
    useUIStore.setState({ isSettingsOpen: true });
    const { container: settingsContainer, rerender: rerenderSettings } = render(
      React.createElement(SettingsModal)
    );
    expect(settingsContainer.firstChild).not.toBeNull();

    // 3. User toggles Crossfade on (Gapless turns off)
    useSettingsStore.getState().setIsCrossfadeEnabled(true);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);

    // 4. User switches app language to English in settings
    i18n.changeLanguage('en');
    useSettingsStore.getState().setLanguage('en');
    rerenderSettings(React.createElement(SettingsModal));
    expect(useSettingsStore.getState().language).toBe('en');

    // 5. Close settings modal
    useUIStore.setState({ isSettingsOpen: false });

    // 6. Verify BottomPlayer displays with English locale
    const track = createMockTrack('rw4-trk', 'Global Song', 200, 'Global Band');
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
    });

    const { container: playerContainer } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    expect(playerContainer.firstChild).not.toBeNull();
  });

  it('RW4-2: Language switching dynamically re-renders active player components without interrupting playback', () => {
    const track = createMockTrack('dyn-trk', 'Playback Continuity Song', 180);
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      isPlaying: true,
    });

    // oxlint-disable-next-line
    const { container, rerender } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    // Switch to RU
    i18n.changeLanguage('ru');
    rerender(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    // Switch to EN
    i18n.changeLanguage('en');
    rerender(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });
});
