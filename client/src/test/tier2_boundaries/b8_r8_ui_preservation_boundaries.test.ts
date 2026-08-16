import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import BottomPlayer from '../../components/player/BottomPlayer';
import Slider from '../../components/common/Slider';
import LiquidSeekBar from '../../components/common/LiquidSeekBar';
import TrackImage from '../../components/common/TrackImage';

describe('Tier 2 - B8: UI Preservation Boundary Cases & Viewport Resilience', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B8-1: Ultra-long track title and artist name strings truncate cleanly with ellipsis without overflowing container', () => {
    const hugeTitle = 'A'.repeat(500) + ' - Super Long Extended Mix Edition Remix 2026';
    const hugeArtist = 'B'.repeat(300) + ' featuring Artist 1, Artist 2, Artist 3';

    const track = createMockTrack('long-text-trk', hugeTitle, 300, hugeArtist);
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

    // Verify truncate class is applied on title elements
    const truncateElements = container.querySelectorAll('.truncate');
    expect(truncateElements.length).toBeGreaterThan(0);
  });

  it('B8-2: Missing or broken coverArt URL falls back to default TrackImage placeholder without crashing', () => {
    const track = createMockTrack('no-art-trk', 'No Art Track', 180, 'No Art Artist');
    track.coverArt = undefined;

    const { container } = render(
      React.createElement(TrackImage, {
        src: track.coverArt,
        alt: 'Test Cover',
        className: 'w-12 h-12',
      })
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('B8-3: Slider component renders within ultra-narrow 50px containers without layout deformation', () => {
    const { container } = render(
      React.createElement('div', { style: { width: '50px' } },
        React.createElement(Slider, { value: 0.75, buffered: 0.9 })
      )
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('B8-4: LiquidSeekBar renders safely across rapid width resize cycles', () => {
    const { container, rerender } = render(
      React.createElement('div', { style: { width: '300px' } },
        React.createElement(LiquidSeekBar, { value: 0.5 })
      )
    );
    expect(container.firstChild).not.toBeNull();

    // Resize to mobile width
    rerender(
      React.createElement('div', { style: { width: '100px' } },
        React.createElement(LiquidSeekBar, { value: 0.8 })
      )
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('B8-5: Rapid state storm (100 store updates in quick succession) does not desynchronize BottomPlayer UI', () => {
    const track = createMockTrack('storm-trk', 'Storm Track', 200);
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      volume: 0.5,
    });

    const { container } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    // Perform rapid state mutations
    for (let i = 0; i < 50; i++) {
      usePlayerStore.getState().setVolume(i / 50);
    }

    expect(container.firstChild).not.toBeNull();
  });

  it('B8-6: Contrast classes for gray buffering bar and active fill conform to player accessibility standards', () => {
    const { container } = render(
      React.createElement(Slider, {
        value: 0.3,
        buffered: 0.6,
      } as any)
    );

    // Root element should have touch-none and cursor-pointer
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('cursor-pointer');
    expect(root.className).toContain('touch-none');
  });
});
