import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { 
  SeekControls, 
  RewindButton, 
  FastForwardButton,
  PlaybackRateButton, 
  SleepTimerMenu, 
  SleepTimerButton,
  PlayerTransportBar 
} from '../../components/player/controls';
import { usePlayerStore } from '../../store/playerStore';
import { jamSocket } from '../../api/socket';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: string) => fallback || key,
    }),
  };
});

// Mock getAudioEngine
const mockSeek = vi.fn();
const mockGetCurrentTime = vi.fn().mockReturnValue(50);
const mockGetDuration = vi.fn().mockReturnValue(200);
const mockResume = vi.fn().mockResolvedValue(undefined);

vi.mock('../../audio/AudioEngine', () => ({
  getAudioEngine: () => ({
    seek: mockSeek,
    getCurrentTime: mockGetCurrentTime,
    getDuration: mockGetDuration,
    resume: mockResume,
  }),
}));

// Mock jamSocket
vi.mock('../../api/socket', () => ({
  jamSocket: {
    syncSeek: vi.fn(),
  },
}));

describe('Stage 5: Player Controls Decomposition', () => {
  const dummyTrack = {
    id: 'track-1',
    title: 'Decomposed Beat',
    artist: 'Modular Artist',
    duration: 200,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usePlayerStore.setState({
      queue: [dummyTrack],
      currentIndex: 0,
      isPlaying: false,
      role: 'host',
      roomId: null,
      isShuffle: false,
      repeatMode: 'none',
      playbackRate: 1,
      sleepTimer: { type: null, endTime: null },
    });
  });

  describe('SeekControls', () => {
    it('renders rewind (15s) and forward (30s) buttons with correct badges', () => {
      render(<SeekControls currentTrack={dummyTrack} role="host" />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
      expect(screen.getByText('15')).toBeDefined();
      expect(screen.getByText('30')).toBeDefined();
    });

    it('performs rewind by 15 seconds safely via getAudioEngine', () => {
      mockGetCurrentTime.mockReturnValue(50);
      render(<SeekControls currentTrack={dummyTrack} role="host" />);

      const rewindBtn = screen.getByText('15').closest('button')!;
      fireEvent.click(rewindBtn);

      expect(mockSeek).toHaveBeenCalledWith(35); // 50 - 15 = 35
    });

    it('clamps rewind at 0 seconds', () => {
      mockGetCurrentTime.mockReturnValue(5);
      render(<SeekControls currentTrack={dummyTrack} role="host" />);

      const rewindBtn = screen.getByText('15').closest('button')!;
      fireEvent.click(rewindBtn);

      expect(mockSeek).toHaveBeenCalledWith(0);
    });

    it('performs fast forward by 30 seconds safely via getAudioEngine', () => {
      mockGetCurrentTime.mockReturnValue(50);
      mockGetDuration.mockReturnValue(200);
      render(<SeekControls currentTrack={dummyTrack} role="host" />);

      const ffBtn = screen.getByText('30').closest('button')!;
      fireEvent.click(ffBtn);

      expect(mockSeek).toHaveBeenCalledWith(80); // 50 + 30 = 80
    });

    it('clamps fast forward at track duration', () => {
      mockGetCurrentTime.mockReturnValue(190);
      mockGetDuration.mockReturnValue(200);
      render(<SeekControls currentTrack={dummyTrack} role="host" />);

      const ffBtn = screen.getByText('30').closest('button')!;
      fireEvent.click(ffBtn);

      expect(mockSeek).toHaveBeenCalledWith(200);
    });

    it('broadcasts jamSocket.syncSeek when in room as host/cohost', () => {
      usePlayerStore.setState({ roomId: 'room-123', role: 'host' });
      mockGetCurrentTime.mockReturnValue(60);
      render(<SeekControls currentTrack={dummyTrack} role="host" />);

      const ffBtn = screen.getByText('30').closest('button')!;
      fireEvent.click(ffBtn);

      expect(mockSeek).toHaveBeenCalledWith(90);
      expect(jamSocket.syncSeek).toHaveBeenCalledWith(90);
    });

    it('disables controls for listeners', () => {
      render(<SeekControls currentTrack={dummyTrack} role="listener" />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(btn => {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      });

      fireEvent.click(buttons[0]);
      expect(mockSeek).not.toHaveBeenCalled();
    });

    it('renders children between rewind and forward buttons', () => {
      render(
        <SeekControls currentTrack={dummyTrack} role="host">
          <span data-testid="middle-child">Middle</span>
        </SeekControls>
      );

      expect(screen.getByTestId('middle-child')).toBeDefined();
    });

    it('supports standalone RewindButton and FastForwardButton', () => {
      mockGetCurrentTime.mockReturnValue(40);
      render(
        <div>
          <RewindButton currentTrack={dummyTrack} role="host" seconds={10} />
          <FastForwardButton currentTrack={dummyTrack} role="host" seconds={20} />
        </div>
      );

      expect(screen.getByText('10')).toBeDefined();
      expect(screen.getByText('20')).toBeDefined();

      fireEvent.click(screen.getByText('10').closest('button')!);
      expect(mockSeek).toHaveBeenCalledWith(30);

      fireEvent.click(screen.getByText('20').closest('button')!);
      expect(mockSeek).toHaveBeenCalledWith(60);
    });
  });

  describe('PlaybackRateButton', () => {
    it('displays the current rate and calls onCycle when clicked', () => {
      const onCycle = vi.fn();
      render(<PlaybackRateButton playbackRate={1} onCycle={onCycle} />);

      const btn = screen.getByRole('button', { name: /1x/i });
      expect(btn).toBeDefined();
      expect(btn.classList.contains('text-primary')).toBe(false);

      fireEvent.click(btn);
      expect(onCycle).toHaveBeenCalledTimes(1);
    });

    it('highlights with text-primary when rate !== 1', () => {
      const onCycle = vi.fn();
      render(<PlaybackRateButton playbackRate={1.5} onCycle={onCycle} />);

      const btn = screen.getByRole('button', { name: /1.5x/i });
      expect(btn.classList.contains('text-primary')).toBe(true);
    });

    it('honors disabled prop', () => {
      const onCycle = vi.fn();
      render(<PlaybackRateButton playbackRate={1} onCycle={onCycle} disabled={true} />);

      const btn = screen.getByRole('button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      fireEvent.click(btn);
      expect(onCycle).not.toHaveBeenCalled();
    });
  });

  describe('SleepTimerMenu', () => {
    it('does not render when isOpen is false', () => {
      render(<SleepTimerMenu isOpen={false} onClose={vi.fn()} />);
      expect(screen.queryByText('Таймер сна')).toBeNull();
    });

    it('renders all presets when isOpen is true', () => {
      render(<SleepTimerMenu isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText((c) => c === '5 минут')).toBeDefined();
      expect(screen.getByText((c) => c === '10 минут')).toBeDefined();
      expect(screen.getByText((c) => c === '15 минут')).toBeDefined();
      expect(screen.getByText((c) => c === '30 минут')).toBeDefined();
      expect(screen.getByText((c) => c === '45 минут')).toBeDefined();
      expect(screen.getByText((c) => c === '1 час')).toBeDefined();
      expect(screen.getByText('Конец трека')).toBeDefined();
      expect(screen.getByText('Выключить')).toBeDefined();
    });

    it('sets timed sleep timer and closes on preset click', () => {
      const onClose = vi.fn();
      render(<SleepTimerMenu isOpen={true} onClose={onClose} />);

      const preset15 = screen.getByText((c) => c === '15 минут').closest('button')!;
      fireEvent.click(preset15);

      const state = usePlayerStore.getState();
      expect(state.sleepTimer.type).toBe('time');
      expect(state.sleepTimer.endTime).toBeGreaterThan(Date.now());
      expect(onClose).toHaveBeenCalled();
    });

    it('sets track_end sleep timer and closes on click', () => {
      const onClose = vi.fn();
      render(<SleepTimerMenu isOpen={true} onClose={onClose} />);

      const trackEndBtn = screen.getByText('Конец трека').closest('button')!;
      fireEvent.click(trackEndBtn);

      const state = usePlayerStore.getState();
      expect(state.sleepTimer.type).toBe('track_end');
      expect(onClose).toHaveBeenCalled();
    });

    it('cancels sleep timer on "off" click', () => {
      usePlayerStore.setState({ sleepTimer: { type: 'track_end', endTime: null } });
      const onClose = vi.fn();
      render(<SleepTimerMenu isOpen={true} onClose={onClose} />);

      const offBtn = screen.getByText('Выключить').closest('button')!;
      fireEvent.click(offBtn);

      const state = usePlayerStore.getState();
      expect(state.sleepTimer.type).toBeNull();
      expect(onClose).toHaveBeenCalled();
    });

    it('renders SleepTimerButton with active state when timer is set', () => {
      const onClick = vi.fn();
      const { rerender } = render(<SleepTimerButton onClick={onClick} isActive={false} />);
      const btn = screen.getByRole('button');
      expect(btn.classList.contains('text-primary')).toBe(false);

      rerender(<SleepTimerButton onClick={onClick} isActive={true} />);
      expect(screen.getByRole('button').classList.contains('text-primary')).toBe(true);

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe('PlayerTransportBar', () => {
    it('renders all 5 transport controls (Shuffle, Prev, Play/Pause, Next, Repeat)', () => {
      const onPlayPause = vi.fn();
      const onNext = vi.fn();
      const onPrev = vi.fn();
      const onToggleShuffle = vi.fn();
      const onCycleRepeat = vi.fn();

      render(
        <PlayerTransportBar
          isPlaying={false}
          onPlayPause={onPlayPause}
          onNext={onNext}
          onPrev={onPrev}
          isShuffle={false}
          onToggleShuffle={onToggleShuffle}
          repeatMode="none"
          onCycleRepeat={onCycleRepeat}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);

      // Play/Pause
      fireEvent.click(buttons[2]);
      expect(onPlayPause).toHaveBeenCalledTimes(1);

      // Previous
      fireEvent.click(buttons[1]);
      expect(onPrev).toHaveBeenCalledTimes(1);

      // Next
      fireEvent.click(buttons[3]);
      expect(onNext).toHaveBeenCalledTimes(1);

      // Shuffle
      fireEvent.click(buttons[0]);
      expect(onToggleShuffle).toHaveBeenCalledTimes(1);

      // Repeat
      fireEvent.click(buttons[4]);
      expect(onCycleRepeat).toHaveBeenCalledTimes(1);
    });

    it('displays active styling when shuffle or repeat is active', () => {
      const { rerender } = render(
        <PlayerTransportBar
          isPlaying={true}
          onPlayPause={vi.fn()}
          onNext={vi.fn()}
          onPrev={vi.fn()}
          isShuffle={true}
          onToggleShuffle={vi.fn()}
          repeatMode="all"
          onCycleRepeat={vi.fn()}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons[0].classList.contains('text-primary')).toBe(true);
      expect(buttons[4].classList.contains('text-primary')).toBe(true);

      // Test repeatMode="one"
      rerender(
        <PlayerTransportBar
          isPlaying={true}
          onPlayPause={vi.fn()}
          onNext={vi.fn()}
          onPrev={vi.fn()}
          isShuffle={false}
          onToggleShuffle={vi.fn()}
          repeatMode="one"
          onCycleRepeat={vi.fn()}
        />
      );
      const updatedButtons = screen.getAllByRole('button');
      expect(updatedButtons[0].classList.contains('text-primary')).toBe(false);
      expect(updatedButtons[4].classList.contains('text-primary')).toBe(true);
    });

    it('disables all buttons when isListener is true', () => {
      render(
        <PlayerTransportBar
          isPlaying={false}
          onPlayPause={vi.fn()}
          onNext={vi.fn()}
          onPrev={vi.fn()}
          isShuffle={false}
          onToggleShuffle={vi.fn()}
          repeatMode="none"
          onCycleRepeat={vi.fn()}
          isListener={true}
        />
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(btn => {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      });
    });
  });
});
