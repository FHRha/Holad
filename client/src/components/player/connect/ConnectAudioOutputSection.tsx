import { Headphones, Speaker } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAudioOutputDevice, getDeviceDisplayName, promptSelectAudioOutput, type AudioOutputDevice } from '../../../hooks/useAudioOutputDevice';

export interface ConnectAudioOutputSectionProps {
  isRemoteActive?: boolean;
  outputDevice?: AudioOutputDevice;
  onSelectOutput?: () => void;
}

export default function ConnectAudioOutputSection({
  isRemoteActive = false,
  outputDevice: propOutputDevice,
  onSelectOutput,
}: ConnectAudioOutputSectionProps) {
  const { t } = useTranslation();
  const hookOutputDevice = useAudioOutputDevice();
  const outputDevice = propOutputDevice ?? hookOutputDevice;

  if (isRemoteActive) {
    return null;
  }

  const handleClick = () => {
    if (onSelectOutput) {
      onSelectOutput();
    } else {
      promptSelectAudioOutput().catch(() => {});
    }
  };

  return (
    <div
      onClick={handleClick}
      className="px-4 py-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between text-xs text-secondary cursor-pointer hover:bg-foreground/5 transition-colors select-none"
      title={t('player.current_output')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <span className="flex items-center gap-2">
        {outputDevice.isHeadphones ? <Headphones size={15} className="text-primary shrink-0" /> : <Speaker size={15} className="shrink-0" />}
        <span className="leading-none">{t('player.current_output')}:</span>
      </span>
      <span className="font-semibold text-foreground truncate max-w-[170px] leading-none">
        {getDeviceDisplayName(outputDevice, t)}
      </span>
    </div>
  );
}
