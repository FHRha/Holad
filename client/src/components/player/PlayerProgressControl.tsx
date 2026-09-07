import React from 'react';
import { useAudioStore } from '../../store/audioStore';
import LiquidSeekBar from '../common/LiquidSeekBar';
import { formatTime } from '../../utils/timeFormat';

interface PlayerProgressControlProps {
  isPlaying: boolean;
  role?: string | null;
  className?: string;
}

export const PlayerProgressControl = React.memo(function PlayerProgressControl({
  isPlaying,
  role,
  className = ''
}: PlayerProgressControlProps) {
  const progress = useAudioStore(s => s.progress);
  const duration = useAudioStore(s => s.duration);
  const buffered = useAudioStore(s => s.buffered);
  const handleSeekChange = useAudioStore(s => s.handleSeekChange);
  const handleSeekEnd = useAudioStore(s => s.handleSeekEnd);

  const currentTimeSeconds = (progress / 100) * (duration || 0);

  return (
    <div className={`w-full flex items-center gap-3 text-[11px] text-secondary font-medium px-4 ${className}`}>
      <span className="min-w-[35px] text-right">{formatTime(currentTimeSeconds)}</span>
      <LiquidSeekBar 
        value={progress / 100} 
        buffered={buffered / 100}
        onChange={handleSeekChange} 
        onDragEnd={handleSeekEnd} 
        className={`flex-1 ${role === 'listener' ? 'pointer-events-none' : ''}`}
        isAnimated={isPlaying}
      />
      <span className="min-w-[35px] text-left">{formatTime(duration)}</span>
    </div>
  );
});

export default PlayerProgressControl;
