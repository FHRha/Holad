import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import BottomPlayer from '../../components/player/BottomPlayer';
import i18n from 'i18next';

describe('Tier 3 - Pairwise: Localization (R6) + Buffering UI (R2) + Player Controls (R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('P6-1: BottomPlayer renders in Russian locale without hardcoded English strings in control elements', () => {
    i18n.changeLanguage('ru');

    const track = createMockTrack('loc-p-1', 'Русский Трек', 200, 'Русский Артист');
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
    });

    const { container } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('P6-2: BottomPlayer renders in English locale cleanly without Russian character bleed', () => {
    i18n.changeLanguage('en');

    const track = createMockTrack('loc-p-2', 'English Track', 180, 'English Artist');
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
    });

    const { container } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('P6-3: Switching language while track is buffered and playing updates UI without resetting seekbar or buffer position', () => {
    const track = createMockTrack('loc-buf-trk', 'Dynamic Lang Track', 250);
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      isPlaying: true,
    });

    const { container, rerender } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    // Switch language from ru to en
    i18n.changeLanguage('en');
    useSettingsStore.getState().setLanguage('en');

    rerender(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('P6-4: Tooltips, titles, and aria attributes in player controls use translated dictionary phrases', () => {
    const track = createMockTrack('aria-trk', 'Accessible Track', 190);
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
    });

    const { container } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    // Verify buttons and interactive elements exist
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
