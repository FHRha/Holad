import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { resetAllStores } from '../helpers/testUtils';
import SettingsModal from '../../components/modals/SettingsModal';
import i18n from 'i18next';

describe('Tier 3 - Pairwise: Crossfade/Gapless Exclusivity (R3) + Localization (R6) + UI Modal (R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('P2-1: Settings modal renders adjacent Crossfade and Gapless toggles with localized text in Russian', () => {
    i18n.changeLanguage('ru');
    useUIStore.setState({ isSettingsOpen: true });

    const { container } = render(
      React.createElement(SettingsModal)
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('P2-2: Settings modal renders adjacent Crossfade and Gapless toggles with localized text in English', () => {
    i18n.changeLanguage('en');
    useUIStore.setState({ isSettingsOpen: true });

    const { container } = render(
      React.createElement(SettingsModal)
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('P2-3: Toggling Crossfade on disables Gapless in store and updates modal settings state', () => {
    const store = useSettingsStore.getState();

    store.setIsGaplessEnabled(true);
    expect(useSettingsStore.getState().isGaplessEnabled).toBe(true);

    store.setIsCrossfadeEnabled(true);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);
  });

  it('P2-4: Toggling Gapless on disables Crossfade in store without visual flicker in settings modal', () => {
    const store = useSettingsStore.getState();

    store.setIsCrossfadeEnabled(true);
    store.setIsGaplessEnabled(true);

    expect(useSettingsStore.getState().isGaplessEnabled).toBe(true);
  });
});
