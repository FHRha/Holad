import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import MobilePlayerUI from '../../components/player/MobilePlayerUI';
import MobileSettingsView from '../../components/views/MobileSettingsView';
import { isMobileDevice } from '../../App';

// Mock Subsonic API preserving all exports
vi.mock('../../api/subsonic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/subsonic')>();
  return {
    ...actual,
    getCoverArtUrl: vi.fn(() => 'http://localhost/mock-cover.jpg'),
    starItem: vi.fn(),
    unstarItem: vi.fn(),
    getLyrics: vi.fn().mockResolvedValue(''),
    getLyricsBySongId: vi.fn().mockResolvedValue([]),
    getArtistInfo: vi.fn().mockResolvedValue({ biography: 'Test Bio' }),
    getPlayQueue: vi.fn().mockResolvedValue({ entry: [] }),
    savePlayQueue: vi.fn().mockResolvedValue({}),
  };
});

// Mock AudioEngine
vi.mock('../../audio/AudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    getCurrentTime: () => 30,
    getDuration: () => 180,
    seek: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock socket
vi.mock('../../api/socket', () => ({
  jamSocket: {
    syncSeek: vi.fn(),
  },
}));

describe('Mobile Theme & Player Controls Enhancement', () => {
  beforeEach(() => {
    cleanup();
    usePlayerStore.setState({
      queue: [
        {
          id: 'test-track-1',
          title: 'Test Song 1',
          artist: 'Test Artist',
          album: 'Test Album',
          albumId: 'alb-1',
          duration: 200,
          coverArt: 'cover-1',
        },
        {
          id: 'test-track-2',
          title: 'Test Song 2',
          artist: 'Test Artist',
          album: 'Test Album',
          albumId: 'alb-1',
          duration: 220,
          coverArt: 'cover-2',
        },
      ],
      currentIndex: 0,
      isPlaying: false,
      likedTrackIds: [],
      excludedTrackIds: [],
      role: 'host',
      isShuffle: false,
      repeatMode: 'none',
      playbackRate: 1,
      sleepTimer: { type: null, endTime: null },
    });

    useAudioStore.setState({
      progress: 25,
      duration: 200,
      buffered: 50,
      isSeeking: false,
      audioElement: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. MobilePlayerUI: Controls visibility across tabs', () => {
    it('renders full playback controls and seekbar when on Player tab', () => {
      const { container } = render(
        <MemoryRouter>
          <MobilePlayerUI onClose={() => {}} />
        </MemoryRouter>
      );

      // On 'player' tab: track title is visible in main controls area
      expect(screen.getByText('Test Song 1')).toBeTruthy();
      expect(screen.getByText('Test Artist')).toBeTruthy();

      // LiquidSeekBar canvas should be present
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();

      // Skip and rate controls are present
      expect(screen.getByText('1x')).toBeTruthy();
      expect(screen.getByText('15')).toBeTruthy();
      expect(screen.getByText('30')).toBeTruthy();
    });

    it('hides playback controls and seekbar when switching to Queue tab', () => {
      const { container } = render(
        <MemoryRouter>
          <MobilePlayerUI onClose={() => {}} />
        </MemoryRouter>
      );

      // Buttons in the very bottom bar (Player, Queue, Info, Lyrics)
      const tabButtons = container.querySelectorAll('.h-\\[72px\\] button');
      expect(tabButtons.length).toBe(4);

      // Click Queue tab (2nd button)
      fireEvent.click(tabButtons[1]);

      // Seekbar canvas should be removed
      expect(container.querySelector('canvas')).toBeNull();

      // Secondary controls row should be removed
      expect(screen.queryByText('1x')).toBeNull();
      expect(screen.queryByText('15')).toBeNull();
      expect(screen.queryByText('30')).toBeNull();
    });

    it('hides playback controls and seekbar when switching to Info tab', () => {
      const { container } = render(
        <MemoryRouter>
          <MobilePlayerUI onClose={() => {}} />
        </MemoryRouter>
      );

      const tabButtons = container.querySelectorAll('.h-\\[72px\\] button');

      // Click Info tab (3rd button)
      fireEvent.click(tabButtons[2]);

      // Seekbar canvas should be removed
      expect(container.querySelector('canvas')).toBeNull();
      expect(screen.queryByText('1x')).toBeNull();
    });

    it('hides playback controls and seekbar when switching to Lyrics tab', () => {
      const { container } = render(
        <MemoryRouter>
          <MobilePlayerUI onClose={() => {}} />
        </MemoryRouter>
      );

      const tabButtons = container.querySelectorAll('.h-\\[72px\\] button');

      // Click Lyrics tab (4th button)
      fireEvent.click(tabButtons[3]);

      // Controls removed
      expect(container.querySelector('canvas')).toBeNull();
      expect(screen.queryByText('1x')).toBeNull();
    });

    it('restores playback controls when switching back to Player tab', () => {
      const { container } = render(
        <MemoryRouter>
          <MobilePlayerUI onClose={() => {}} />
        </MemoryRouter>
      );

      const tabButtons = container.querySelectorAll('.h-\\[72px\\] button');

      // Switch to Lyrics tab
      fireEvent.click(tabButtons[3]);
      expect(container.querySelector('canvas')).toBeNull();

      // Switch back to Player tab (1st button)
      fireEvent.click(tabButtons[0]);
      expect(container.querySelector('canvas')).not.toBeNull();
      expect(screen.getByText('1x')).toBeTruthy();
    });
  });

  describe('2. MobileSettingsView: Dark-only theme indicator', () => {
    it('displays dark theme as locked with mobile dark-only indicator', () => {
      const { container } = render(
        <MemoryRouter>
          <MobileSettingsView />
        </MemoryRouter>
      );

      // Find the Appearance accordion section and click to expand it
      const appearanceCard = container.querySelector('.lucide-palette')?.closest('.cursor-pointer');
      expect(appearanceCard).toBeTruthy();
      fireEvent.click(appearanceCard!);

      // Check for mobile dark-only indicator
      expect(screen.getByText('Только тёмная тема')).toBeTruthy();
    });
  });

  describe('3. isMobileDevice helper', () => {
    it('identifies mobile viewports under 768px', () => {
      const originalInnerWidth = window.innerWidth;
      try {
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
        expect(isMobileDevice()).toBe(true);

        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
        // Since we are not on Capacitor and ua is jsdom (not mobile ua)
        expect(isMobileDevice()).toBe(false);
      } finally {
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
      }
    });
  });
});
