import React from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../types';

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
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= currentRating;
        return (
          <button
            key={star}
            type="button"
            className={`player-star-btn ${isFilled ? 'text-primary' : 'text-foreground/40 hover:text-foreground/80'}`}
            onClick={() => {
              if (!currentTrack) return;
              const newRating = currentRating === star ? 0 : star;
              setTrackRating(currentTrack.id, newRating);
            }}
            aria-label={currentRating === star ? t('player.tooltip_rate_reset') : t('player.tooltip_rate_star', { star })}
            title={currentRating === star ? t('player.tooltip_rate_reset') : t('player.tooltip_rate_star', { star })}
          >
            <Star size={16} strokeWidth={2} fill={isFilled ? 'currentColor' : 'none'} />
          </button>
        );
      })}
    </div>
  );
};

export default PlayerRatingStars;
