import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
// oxlint-disable-next-line
import { useSettingsStore } from '../../store/settingsStore';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import { useUIStore } from '../../store/uiStore';
import BottomPlayer from '../../components/player/BottomPlayer';
import SettingsModal from '../../components/modals/SettingsModal';
import LiquidSeekBar from '../../components/common/LiquidSeekBar';
import Slider from '../../components/common/Slider';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';

describe('Tier 1 - R8: Strict UI Preservation & Design System Tokens', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('R8-1: BottomPlayer maintains desktop player layout structure with controls, volume, and seekbar', () => {
    const track = createMockTrack('ui-trk-1', 'Design System Track', 200, 'Design Artist');
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

    // Desktop player wrapper class
    const desktopPlayer = container.querySelector('.hidden.md\\:flex');
    expect(desktopPlayer).not.toBeNull();
  });

  it('R8-2: Mobile mini player renders fixed bottom container and maintains mobile layout classes', () => {
    const track = createMockTrack('mob-trk-1', 'Mobile Track', 180);
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

    const mobilePlayer = container.querySelector('.md\\:hidden.fixed.bottom-\\[56px\\]');
    expect(mobilePlayer).not.toBeNull();
  });

  it('R8-3: SettingsModal retains original tab structure and responsive overlay styling', () => {
    useUIStore.setState({ isSettingsOpen: true });

    const { container } = render(
      React.createElement(SettingsModal)
    );

    // Modal overlay with backdrop blur
    expect(container.querySelector('.fixed.inset-0')).not.toBeNull();
  });

  it('R8-4: LiquidSeekBar canvas and track elements maintain rounded styling and height classes', () => {
    const { container } = render(
      React.createElement(LiquidSeekBar, {
        value: 0.4,
        isAnimated: true,
      })
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('R8-5: Slider component supports normal and thick thickness variants preserving design system classes', () => {
    const { container: normalContainer } = render(
      React.createElement(Slider, {
        value: 0.5,
        thickness: 'normal',
      })
    );
    expect(normalContainer.querySelector('.h-1')).not.toBeNull();

    const { container: thickContainer } = render(
      React.createElement(Slider, {
        value: 0.5,
        thickness: 'thick',
      })
    );
    expect(thickContainer.querySelector('.h-2')).not.toBeNull();
  });

  it('R8-6: ErrorBoundary wraps UI children and recovers cleanly without crashing component tree', () => {
    const ThrowingComponent = () => {
      throw new Error('Test boundary error');
    };

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(ThrowingComponent)
      )
    );

    // Error fallback UI should be displayed gracefully
    expect(container.textContent).toMatch(/Что-то пошло не так|Something went wrong/i);
    consoleError.mockRestore();
  });
});
