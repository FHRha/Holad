import React from 'react';
import { useTranslation } from 'react-i18next';

export interface PlaybackRateButtonProps {
  playbackRate: number;
  onCycle: () => void;
  disabled?: boolean;
  className?: string;
}

export const PlaybackRateButton: React.FC<PlaybackRateButtonProps> = ({
  playbackRate,
  onCycle,
  disabled = false,
  className = '',
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onCycle}
      disabled={disabled}
      aria-label={t('player.playback_speed', `Скорость воспроизведения ${playbackRate}x`, { speed: playbackRate })}
      className={`hover:text-foreground transition-colors active:scale-95 font-bold text-sm tracking-wider disabled:opacity-50 ${playbackRate !== 1 ? 'text-primary' : ''} ${className}`}
    >
      {playbackRate}x
    </button>
  );
};

export default PlaybackRateButton;
