import { Radio, Speaker, Headphones, Check, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../../store/playerStore';
import { useSocialStore, type JamAudioMode } from '../../../store/socialStore';

export interface ConnectJamSectionProps {
  participantsCount?: number;
  audioMode?: JamAudioMode;
  onSetAudioMode?: (mode: JamAudioMode) => void;
}

export default function ConnectJamSection({
  participantsCount: propParticipantsCount,
  audioMode: propAudioMode,
  onSetAudioMode: propOnSetAudioMode,
}: ConnectJamSectionProps) {
  const { t } = useTranslation();
  const storeParticipants = usePlayerStore(s => s.participants);
  const storeAudioMode = useSocialStore(s => s.audioMode);
  const storeSetAudioMode = useSocialStore(s => s.setAudioMode);

  const participantsCount = propParticipantsCount ?? (storeParticipants.length || 1);
  const audioMode = propAudioMode ?? storeAudioMode;
  const setAudioMode = propOnSetAudioMode ?? storeSetAudioMode;

  return (
    <div className="px-3 pb-3 border-b border-black/10 dark:border-white/10 mb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
          <Radio size={14} className="animate-pulse" />
          <span>{t('social.in_jam_with', { count: participantsCount })}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-1 bg-foreground/5 rounded-xl border border-black/10 dark:border-white/10 mb-2">
        <button
          type="button"
          onClick={() => setAudioMode('speaker_dj')}
          className={`w-full px-3 py-2 rounded-lg text-left transition-all flex items-center justify-between gap-2 ${
            audioMode === 'speaker_dj'
              ? 'bg-primary text-black font-bold shadow-sm'
              : 'text-secondary hover:text-foreground hover:bg-foreground/5'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Speaker size={15} className="shrink-0" />
            <span className="text-xs font-semibold">{t('social.mode_speaker')}</span>
          </div>
          {audioMode === 'speaker_dj' && <Check size={14} className="shrink-0" />}
        </button>
        <button
          type="button"
          onClick={() => setAudioMode('synced_audio')}
          className={`w-full px-3 py-2 rounded-lg text-left transition-all flex items-center justify-between gap-2 ${
            audioMode === 'synced_audio'
              ? 'bg-primary text-black font-bold shadow-sm'
              : 'text-secondary hover:text-foreground hover:bg-foreground/5'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Headphones size={15} className="shrink-0" />
            <span className="text-xs font-semibold">{t('social.mode_headphones')}</span>
          </div>
          {audioMode === 'synced_audio' && <Check size={14} className="shrink-0" />}
        </button>
      </div>

      {audioMode === 'speaker_dj' && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-2.5 flex items-start gap-2 text-xs text-foreground/90 mt-1">
          <Info size={16} className="text-primary shrink-0 mt-0.5" />
          <p className="leading-snug text-[11px]">{t('social.mobile_speaker_hint')}</p>
        </div>
      )}
    </div>
  );
}
