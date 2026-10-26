import { Tv2, Monitor, Smartphone, MonitorSpeaker, Radio, Headphones, Speaker } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHoladStore, type HoladDevice } from '../../../store/holadStore';
import { usePlayerStore } from '../../../store/playerStore';
import { useAudioOutputDevice, getDeviceDisplayName, type AudioOutputDevice } from '../../../hooks/useAudioOutputDevice';

export interface ConnectTriggerButtonProps {
  variant?: 'icon' | 'pill';
  transparent?: boolean;
  isActive?: boolean;
  isRemoteActive?: boolean;
  activeRemoteDevice?: HoladDevice | null;
  jamRoomId?: string | null;
  outputDevice?: AudioOutputDevice;
  onClick: () => void;
  className?: string;
}

export default function ConnectTriggerButton({
  variant = 'icon',
  transparent = false,
  isActive: propIsActive,
  isRemoteActive: propIsRemoteActive,
  activeRemoteDevice: propActiveRemoteDevice,
  jamRoomId: propJamRoomId,
  outputDevice: propOutputDevice,
  onClick,
  className,
}: ConnectTriggerButtonProps) {
  const { t } = useTranslation();
  const storeDevices = useHoladStore(s => s.devices);
  const storeActiveDeviceId = useHoladStore(s => s.activeDeviceId);
  const storeLocalDeviceId = useHoladStore(s => s.deviceId);
  const storeIsConnected = useHoladStore(s => s.roomId !== null);
  const storeJamRoomId = usePlayerStore(s => s.roomId);
  const hookOutputDevice = useAudioOutputDevice();

  const jamRoomId = propJamRoomId !== undefined ? propJamRoomId : storeJamRoomId;
  const outputDevice = propOutputDevice ?? hookOutputDevice;

  const isRemoteActive = propIsRemoteActive !== undefined
    ? propIsRemoteActive
    : (storeIsConnected && storeActiveDeviceId !== null && storeActiveDeviceId !== storeLocalDeviceId);

  const activeRemoteDevice = propActiveRemoteDevice !== undefined
    ? propActiveRemoteDevice
    : (isRemoteActive ? storeDevices.find(d => d.id === storeActiveDeviceId) || null : null);

  const isThisDeviceActive = storeActiveDeviceId === storeLocalDeviceId || (storeActiveDeviceId === null && storeDevices.some(d => d.id === storeLocalDeviceId));
  const isActive = propIsActive !== undefined ? propIsActive : (isThisDeviceActive && storeDevices.length > 0);

  const getPillIcon = () => {
    if (jamRoomId) return <Radio size={14} className="animate-pulse text-primary shrink-0" />;
    if (isRemoteActive) {
      const n = (activeRemoteDevice?.name || '').toLowerCase();
      if (n.includes('mobile') || n.includes('iphone') || n.includes('android')) return <Smartphone size={14} className="text-primary shrink-0" />;
      if (n.includes('tv')) return <Tv2 size={14} className="text-primary shrink-0" />;
      return <Monitor size={14} className="text-primary shrink-0" />;
    }
    if (outputDevice.type === 'bluetooth' || outputDevice.isHeadphones) {
      return <Headphones size={14} className="text-primary shrink-0" />;
    }
    return <Speaker size={14} className="text-secondary shrink-0" />;
  };

  const getPillLabel = () => {
    if (jamRoomId) return t('social.active_jam');
    if (isRemoteActive) {
      return activeRemoteDevice ? activeRemoteDevice.name : t('player.playing_on_device');
    }
    return getDeviceDisplayName(outputDevice, t);
  };

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={t('player.connect_to_device', 'Подключиться к устройству')}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-all text-xs font-semibold max-w-full truncate active:scale-95 ${
          transparent
            ? isRemoteActive || jamRoomId
              ? 'bg-primary/20 text-primary hover:bg-primary/30 border-0'
              : 'bg-white/10 hover:bg-white/20 text-white/90 border-0 backdrop-blur-sm'
            : isRemoteActive || jamRoomId
              ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
              : 'bg-foreground/5 hover:bg-foreground/10 text-secondary hover:text-foreground border border-black/10 dark:border-white/10'
        } ${className || ''}`}
        title={getPillLabel()}
      >
        {getPillIcon()}
        <span className="truncate max-w-[180px]">{getPillLabel()}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('player.connect_to_device', 'Подключиться к устройству')}
      className={`transition-colors flex items-center justify-center w-7 h-7 rounded-lg hover:bg-foreground/5 ${
        isActive ? 'text-primary' : 'text-secondary hover:text-foreground'
      } ${className || ''}`}
      title={t('player.connect_to_device')}
    >
      <MonitorSpeaker size={16} />
    </button>
  );
}
