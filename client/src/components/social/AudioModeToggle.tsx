import { useTranslation } from 'react-i18next';
import { Speaker, Headphones, Check } from 'lucide-react';

export interface AudioModeToggleProps {
  audioMode: 'speaker_dj' | 'synced_audio';
  onSetAudioMode: (mode: 'speaker_dj' | 'synced_audio') => void;
  variant?: 'sidebar' | 'view' | 'modal';
}

export default function AudioModeToggle({
  audioMode,
  onSetAudioMode,
  variant = 'view',
}: AudioModeToggleProps) {
  const { t } = useTranslation();

  if (variant === 'sidebar') {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => onSetAudioMode('speaker_dj')}
          className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start gap-2.5 ${
            audioMode === 'speaker_dj'
              ? 'bg-primary/15 text-foreground ring-1 ring-primary/30 font-semibold shadow-sm'
              : 'bg-neutral-200/60 dark:bg-[#1c1c1c] hover:bg-neutral-200 dark:hover:bg-[#222222] text-secondary hover:text-foreground'
          }`}
        >
          <div
            className={`p-2 rounded-xl shrink-0 ${
              audioMode === 'speaker_dj'
                ? 'bg-primary/25 text-primary'
                : 'bg-neutral-300/50 dark:bg-white/5 text-secondary'
            }`}
          >
            <Speaker size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold ${
                  audioMode === 'speaker_dj' ? 'text-primary' : 'text-foreground'
                }`}
              >
                {t('social.mode_speaker')}
              </span>
              {audioMode === 'speaker_dj' && <Check size={13} className="text-primary shrink-0" />}
            </div>
            <p className="text-[11px] text-secondary leading-snug mt-0.5">
              {t('social.mode_speaker_desc')}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSetAudioMode('synced_audio')}
          className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start gap-2.5 ${
            audioMode === 'synced_audio'
              ? 'bg-primary/15 text-foreground ring-1 ring-primary/30 font-semibold shadow-sm'
              : 'bg-neutral-200/60 dark:bg-[#1c1c1c] hover:bg-neutral-200 dark:hover:bg-[#222222] text-secondary hover:text-foreground'
          }`}
        >
          <div
            className={`p-2 rounded-xl shrink-0 ${
              audioMode === 'synced_audio'
                ? 'bg-primary/25 text-primary'
                : 'bg-neutral-300/50 dark:bg-white/5 text-secondary'
            }`}
          >
            <Headphones size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold ${
                  audioMode === 'synced_audio' ? 'text-primary' : 'text-foreground'
                }`}
              >
                {t('social.mode_headphones')}
              </span>
              {audioMode === 'synced_audio' && <Check size={13} className="text-primary shrink-0" />}
            </div>
            <p className="text-[11px] text-secondary leading-snug mt-0.5">
              {t('social.mode_headphones_desc')}
            </p>
          </div>
        </button>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={() => onSetAudioMode('speaker_dj')}
          className={`w-full p-3 rounded-xl text-left transition-all flex items-start gap-3 ${
            audioMode === 'speaker_dj'
              ? 'bg-primary/20 text-foreground ring-1 ring-primary/40 font-semibold'
              : 'bg-[#262626] hover:bg-[#2c2c2c] text-secondary hover:text-foreground'
          }`}
        >
          <div
            className={`p-2 rounded-xl shrink-0 ${
              audioMode === 'speaker_dj' ? 'bg-primary text-black' : 'bg-white/5 text-secondary'
            }`}
          >
            <Speaker size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold ${
                  audioMode === 'speaker_dj' ? 'text-primary' : 'text-foreground'
                }`}
              >
                {t('social.mode_speaker', 'Режим колонки (DJ)')}
              </span>
              {audioMode === 'speaker_dj' && <Check size={14} className="text-primary shrink-0" />}
            </div>
            <p className="text-[11px] text-secondary leading-snug mt-0.5">
              {t('social.mode_speaker_desc', 'Звук играет у хоста, участники управляют треками')}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSetAudioMode('synced_audio')}
          className={`w-full p-3 rounded-xl text-left transition-all flex items-start gap-3 ${
            audioMode === 'synced_audio'
              ? 'bg-primary/20 text-foreground ring-1 ring-primary/40 font-semibold'
              : 'bg-[#262626] hover:bg-[#2c2c2c] text-secondary hover:text-foreground'
          }`}
        >
          <div
            className={`p-2 rounded-xl shrink-0 ${
              audioMode === 'synced_audio' ? 'bg-primary text-black' : 'bg-white/5 text-secondary'
            }`}
          >
            <Headphones size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold ${
                  audioMode === 'synced_audio' ? 'text-primary' : 'text-foreground'
                }`}
              >
                {t('social.mode_headphones', 'Синхронное вещание')}
              </span>
              {audioMode === 'synced_audio' && <Check size={14} className="text-primary shrink-0" />}
            </div>
            <p className="text-[11px] text-secondary leading-snug mt-0.5">
              {t('social.mode_headphones_desc', 'Звук синхронно играет у всех в наушниках')}
            </p>
          </div>
        </button>
      </div>
    );
  }

  // variant === 'view'
  return (
    <div className="space-y-2.5 pt-1">
      <button
        type="button"
        onClick={() => onSetAudioMode('speaker_dj')}
        className={`w-full p-3.5 rounded-xl text-left transition-all flex items-start gap-3 ${
          audioMode === 'speaker_dj'
            ? 'bg-primary/20 text-foreground ring-1 ring-primary/40 font-semibold'
            : 'bg-foreground/5 hover:bg-foreground/10 text-secondary hover:text-foreground'
        }`}
      >
        <div
          className={`p-2.5 rounded-xl shrink-0 ${
            audioMode === 'speaker_dj' ? 'bg-primary text-black' : 'bg-foreground/5 text-secondary'
          }`}
        >
          <Speaker size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-bold ${
                audioMode === 'speaker_dj' ? 'text-primary' : 'text-foreground'
              }`}
            >
              {t('social.mode_speaker', 'Режим колонки (DJ)')}
            </span>
            {audioMode === 'speaker_dj' && <Check size={16} className="text-primary shrink-0" />}
          </div>
          <p className="text-xs text-secondary leading-snug mt-1">
            {t('social.mode_speaker_desc', 'Звук играет у хоста, участники управляют треками')}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onSetAudioMode('synced_audio')}
        className={`w-full p-3.5 rounded-xl text-left transition-all flex items-start gap-3 ${
          audioMode === 'synced_audio'
            ? 'bg-primary/20 text-foreground ring-1 ring-primary/40 font-semibold'
            : 'bg-foreground/5 hover:bg-foreground/10 text-secondary hover:text-foreground'
        }`}
      >
        <div
          className={`p-2.5 rounded-xl shrink-0 ${
            audioMode === 'synced_audio' ? 'bg-primary text-black' : 'bg-foreground/5 text-secondary'
          }`}
        >
          <Headphones size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-bold ${
                audioMode === 'synced_audio' ? 'text-primary' : 'text-foreground'
              }`}
            >
              {t('social.mode_headphones', 'Синхронное вещание')}
            </span>
            {audioMode === 'synced_audio' && <Check size={16} className="text-primary shrink-0" />}
          </div>
          <p className="text-xs text-secondary leading-snug mt-1">
            {t('social.mode_headphones_desc', 'Звук синхронно играет у всех в наушниках')}
          </p>
        </div>
      </button>
    </div>
  );
}
