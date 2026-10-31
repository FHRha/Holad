import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../types';
import RatingStars from '../common/RatingStars';

interface PlayerRatingStarsProps {
  track?: Track | null;
  className?: string;
}

export const PlayerRatingStars: React.FC<PlayerRatingStarsProps> = ({ track, className = '' }) => {
  const { t } = useTranslation();
  const { queue, currentIndex, role, setTrackRating } = usePlayerStore();
  const currentTrack = track !== undefined ? track : queue[currentIndex];

  if (!currentTrack) return null;

  const currentRating = currentTrack.userRating || 0;

  return (
    <div 
      className={`player-stars ${role === 'listener' ? 'pointer-events-none opacity-50' : ''} ${className}`}
      title={currentRating ? t('player.tooltip_rate_current', { rating: currentRating }) : t('player.tooltip_rate_empty')}
    >
      <RatingStars
        rating={currentRating}
        size={16}
        asButton
        interactive={role !== 'listener'}
        buttonClassName={(_star, isFilled) => `player-star-btn ${isFilled ? 'text-primary' : 'text-foreground/40 hover:text-foreground/80'}`}
        getStarAriaLabel={(star) => currentRating === star ? t('player.tooltip_rate_reset') : t('player.tooltip_rate_star', { star })}
        getStarTitle={(star) => currentRating === star ? t('player.tooltip_rate_reset') : t('player.tooltip_rate_star', { star })}
        onRate={(star) => {
          if (!currentTrack) return;
          const newRating = currentRating === star ? 0 : star;
          setTrackRating(currentTrack.id, newRating);
        }}
      />
    </div>
  );
};

export default PlayerRatingStars;
