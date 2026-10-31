import React from 'react';
import { Shuffle, SkipBack, Play, Pause, SkipForward, Repeat, Repeat1 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface PlayerTransportBarProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: string;
  onCycleRepeat: () => void;
  disabled?: boolean;
  isListener?: boolean;
  className?: string;
}

export const PlayerTransportBar: React.FC<PlayerTransportBarProps> = ({
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  isShuffle,
  onToggleShuffle,
  repeatMode,
  onCycleRepeat,
  disabled = false,
  isListener = false,
  className = 'flex items-center justify-between w-full px-2',
}) => {
  const { t } = useTranslation();
  const isDisabled = disabled || isListener;

  return (
    <div className={className}>
      <button 
        type="button"
        onClick={onToggleShuffle} 
        disabled={isDisabled}
        aria-label={t('player.shuffle', 'В случайном порядке')}
        className={`transition-colors active:scale-95 disabled:opacity-50 p-2.5 rounded-full flex items-center justify-center ${isShuffle ? 'text-primary bg-primary/20 shadow-sm shadow-primary/10' : 'text-secondary hover:bg-foreground/10'}`}
      >
        <Shuffle size={20} />
      </button>

      <button 
        type="button"
        onClick={onPrev} 
        disabled={isDisabled} 
        aria-label={t('player.previous', 'Предыдущий трек')}
        className="text-secondary hover:text-foreground active:scale-95 transition-colors disabled:opacity-50 p-2"
      >
        <SkipBack size={32} fill="currentColor" />
      </button>

      <button 
        type="button"
        onClick={onPlayPause} 
        disabled={isDisabled}
        aria-label={isPlaying ? t('player.pause', 'Пауза') : t('player.play', 'Воспроизведение')}
        className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
      >
        {isPlaying ? (
          <Pause fill="currentColor" size={28} className="stroke-none" />
        ) : (
          <Play fill="currentColor" size={28} className="stroke-none translate-x-[2px]" />
        )}
      </button>

      <button 
        type="button"
        onClick={onNext} 
        disabled={isDisabled} 
        aria-label={t('player.next', 'Следующий трек')}
        className="text-secondary hover:text-foreground active:scale-95 transition-colors disabled:opacity-50 p-2"
      >
        <SkipForward size={32} fill="currentColor" />
      </button>

      <button 
        type="button"
        onClick={onCycleRepeat} 
        disabled={isDisabled}
        aria-label={repeatMode === 'one' ? t('player.repeat_one', 'Повтор одного трека') : repeatMode === 'all' ? t('player.repeat_all', 'Повтор всех треков') : t('player.repeat', 'Повтор')}
        className={`transition-colors active:scale-95 disabled:opacity-50 p-2.5 rounded-full flex items-center justify-center ${repeatMode !== 'none' ? 'text-primary bg-primary/20 shadow-sm shadow-primary/10' : 'text-secondary hover:bg-foreground/10'}`}
      >
        {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
      </button>
    </div>
  );
};

export default PlayerTransportBar;
