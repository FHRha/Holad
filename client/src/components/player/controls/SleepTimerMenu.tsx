import React from 'react';
import { Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../../store/playerStore';

export interface SleepTimerMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESETS = [
  { minutes: 5, labelKey: 'player.timer.5m', defaultLabel: '5 минут' },
  { minutes: 10, labelKey: 'player.timer.10m', defaultLabel: '10 минут' },
  { minutes: 15, labelKey: 'player.timer.15m', defaultLabel: '15 минут' },
  { minutes: 30, labelKey: 'player.timer.30m', defaultLabel: '30 минут' },
  { minutes: 45, labelKey: 'player.timer.45m', defaultLabel: '45 минут' },
  { minutes: 60, labelKey: 'player.timer.60m', defaultLabel: '1 час' },
];

export function SleepTimerButton({
  onClick,
  isActive = false,
  size = 20,
  className = '',
}: {
  onClick: () => void;
  isActive?: boolean;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hover:text-foreground transition-colors active:scale-95 ${isActive ? 'text-primary' : ''} ${className}`}
      aria-label={t('player.sleepTimer', 'Таймер сна')}
    >
      <Moon size={size} />
    </button>
  );
}

export const SleepTimerMenu: React.FC<SleepTimerMenuProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { sleepTimer, setSleepTimer } = usePlayerStore();

  if (!isOpen) return null;

  const handleSetSleepTimer = (val: number | 'track_end' | null) => {
    setSleepTimer(val);
    onClose();
  };

  const isPresetActive = (mins: number) => {
    if (sleepTimer.type !== 'time' || !sleepTimer.endTime) return false;
    const remaining = Math.round((sleepTimer.endTime - Date.now()) / 60000);
    if (remaining <= 0) return false;

    // Find the closest preset among available presets
    let closest = PRESETS[0].minutes;
    let minDiff = Math.abs(remaining - closest);
    for (const p of PRESETS) {
      const diff = Math.abs(remaining - p.minutes);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p.minutes;
      }
    }
    return closest === mins;
  };

  return (
    <div className="absolute inset-0 z-[200] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full sm:w-[400px] max-h-[90vh] overflow-y-auto bg-background/90 backdrop-blur-xl transform-gpu border border-border rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-2 animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Moon size={24} className="text-primary" />
            {t('player.sleepTimer', 'Таймер сна')}
          </h3>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 text-secondary hover:text-foreground transition-colors rounded-full active:scale-95"
            aria-label={t('common.close', 'Закрыть')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        {PRESETS.map((p) => (
          <button 
            key={p.minutes}
            type="button"
            onClick={() => handleSetSleepTimer(p.minutes)} 
            className="w-full text-left px-4 py-3 rounded-xl hover:bg-foreground/10 transition-colors flex justify-between items-center text-foreground"
          >
            <span>{t(p.labelKey, p.defaultLabel)}</span>
            {isPresetActive(p.minutes) && <span className="w-2 h-2 rounded-full bg-primary" />}
          </button>
        ))}
        
        <button 
          type="button"
          onClick={() => handleSetSleepTimer('track_end')} 
          className="w-full text-left px-4 py-3 rounded-xl hover:bg-foreground/10 transition-colors flex justify-between items-center text-foreground"
        >
          <span>{t('player.timer.trackEnd', 'Конец трека')}</span>
          {sleepTimer.type === 'track_end' && <span className="w-2 h-2 rounded-full bg-primary" />}
        </button>
        
        <div className="w-full h-px bg-foreground/10 my-2" />
        
        <button 
          type="button"
          onClick={() => handleSetSleepTimer(null)} 
          className="w-full text-left px-4 py-3 rounded-xl hover:bg-foreground/10 transition-colors flex justify-between items-center text-red-400"
        >
          <span>{t('player.timer.off', 'Выключить')}</span>
        </button>
      </div>
      <div className="absolute inset-0 z-[-1]" onClick={onClose} />
    </div>
  );
};

export default SleepTimerMenu;
