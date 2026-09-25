import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { PlayerRatingStars } from '../../components/player/PlayerRatingStars';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../types';

describe('PlayerRatingStars Component & Layout Classes', () => {
  const mockTrack: Track = {
    id: 'test-track-stars-1',
    title: 'Star Track',
    artist: 'Star Artist',
    album: 'Star Album',
    coverArt: '',
    duration: 210,
    userRating: 3,
  };

  beforeEach(() => {
    usePlayerStore.setState({
      queue: [mockTrack],
      currentIndex: 0,
      role: 'host',
    });
  });

  it('renders container with player-stars class and 5 star buttons with player-star-btn class', () => {
    const { container } = render(<PlayerRatingStars />);
    const starsContainer = container.querySelector('.player-stars');
    expect(starsContainer).not.toBeNull();

    const starButtons = container.querySelectorAll('.player-star-btn');
    expect(starButtons.length).toBe(5);
  });

  it('correctly sets rating when a star is clicked', () => {
    const setRatingSpy = vi.fn();
    usePlayerStore.setState({ setTrackRating: setRatingSpy });

    const { container } = render(<PlayerRatingStars />);
    const starButtons = container.querySelectorAll('.player-star-btn');

    // Click 4th star
    fireEvent.click(starButtons[3]);
    expect(setRatingSpy).toHaveBeenCalledWith('test-track-stars-1', 4);
  });

  it('toggles rating to 0 when currently selected star is clicked again', () => {
    const setRatingSpy = vi.fn();
    usePlayerStore.setState({ setTrackRating: setRatingSpy });

    const { container } = render(<PlayerRatingStars />);
    const starButtons = container.querySelectorAll('.player-star-btn');

    // Track currently has userRating: 3 -> click 3rd star
    fireEvent.click(starButtons[2]);
    expect(setRatingSpy).toHaveBeenCalledWith('test-track-stars-1', 0);
  });

  it('applies pointer-events-none and opacity-50 when role is listener', () => {
    usePlayerStore.setState({ role: 'listener' });

    const { container } = render(<PlayerRatingStars />);
    const starsContainer = container.querySelector('.player-stars');
    expect(starsContainer?.className).toContain('pointer-events-none');
    expect(starsContainer?.className).toContain('opacity-50');
  });
});
