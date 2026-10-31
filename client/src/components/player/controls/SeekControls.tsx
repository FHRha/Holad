import React from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAudioEngine } from '../../../audio/AudioEngine';
import { jamSocket } from '../../../api/socket';
import { usePlayerStore } from '../../../store/playerStore';

export interface SeekControlsProps {
  currentTrack?: any;
  role?: string | null;
  className?: string;
  iconSize?: number;
  seekBackSeconds?: number;
  seekForwardSeconds?: number;
  children?: React.ReactNode;
}

export interface SeekButtonProps {
  currentTrack?: any;
  role?: string | null;
  seconds?: number;
  iconSize?: number;
  className?: string;
  disabled?: boolean;
}

export function RewindButton({
  currentTrack,
  role,
  seconds = 15,
  iconSize = 20,
  className = '',
  disabled,
}: SeekButtonProps) {
  const { t } = useTranslation();
  const isDisabled = disabled !== undefined ? disabled : role === 'listener';

  const handleRewind = () => {
    if (isDisabled) return;
    if (currentTrack) {
      const engine = getAudioEngine();
      const newTime = Math.max(0, engine.getCurrentTime() - seconds);
      engine.seek(newTime);
      const pState = usePlayerStore.getState();
      if (pState.roomId && (pState.role === 'host' || pState.role === 'cohost')) {
        jamSocket.syncSeek(newTime);
      }
    }
  };

  return (
    <button 
      type="button"
      onClick={handleRewind} 
      disabled={isDisabled}
      aria-label={t('player.rewind', `Перемотать на ${seconds} сек назад`)}
      className={`hover:text-foreground transition-colors active:scale-95 relative flex items-center justify-center disabled:opacity-50 ${className}`}
    >
      <RotateCcw size={iconSize} />
      <span className="absolute text-[8px] font-bold mt-0.5">{seconds}</span>
    </button>
  );
}

export function FastForwardButton({
  currentTrack,
  role,
  seconds = 30,
  iconSize = 20,
  className = '',
  disabled,
}: SeekButtonProps) {
  const { t } = useTranslation();
  const isDisabled = disabled !== undefined ? disabled : role === 'listener';

  const handleFastForward = () => {
    if (isDisabled) return;
    if (currentTrack) {
      const engine = getAudioEngine();
      const dur = engine.getDuration() || currentTrack.duration || 0;
      const newTime = Math.min(dur, engine.getCurrentTime() + seconds);
      engine.seek(newTime);
      const pState = usePlayerStore.getState();
      if (pState.roomId && (pState.role === 'host' || pState.role === 'cohost')) {
        jamSocket.syncSeek(newTime);
      }
    }
  };

  return (
    <button 
      type="button"
      onClick={handleFastForward} 
      disabled={isDisabled}
      aria-label={t('player.fast_forward', `Перемотать на ${seconds} сек вперед`)}
      className={`hover:text-foreground transition-colors active:scale-95 relative flex items-center justify-center disabled:opacity-50 ${className}`}
    >
      <RotateCw size={iconSize} />
      <span className="absolute text-[8px] font-bold mt-0.5">{seconds}</span>
    </button>
  );
}

export const SeekControls: React.FC<SeekControlsProps> = ({
  currentTrack,
  role,
  className,
  iconSize = 20,
  seekBackSeconds = 15,
  seekForwardSeconds = 30,
  children,
}) => {
  const rewind = (
    <RewindButton 
      currentTrack={currentTrack} 
      role={role} 
      seconds={seekBackSeconds} 
      iconSize={iconSize} 
    />
  );

  const forward = (
    <FastForwardButton 
      currentTrack={currentTrack} 
      role={role} 
      seconds={seekForwardSeconds} 
      iconSize={iconSize} 
    />
  );

  if (className) {
    return (
      <div className={className}>
        {rewind}
        {children}
        {forward}
      </div>
    );
  }

  return (
    <>
      {rewind}
      {children}
      {forward}
    </>
  );
};

export default SeekControls;
