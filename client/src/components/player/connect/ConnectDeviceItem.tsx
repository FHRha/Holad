import { Smartphone, Tv2, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HoladDevice } from '../../../store/holadStore';

export interface ConnectDeviceItemProps {
  device: HoladDevice;
  isActive: boolean;
  isThisDevice: boolean;
  onSelect: (deviceId: string) => void;
}

export function getDeviceIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('mobile') || n.includes('iphone') || n.includes('android')) return <Smartphone size={16} />;
  if (n.includes('tv')) return <Tv2 size={16} />;
  return <Monitor size={16} />;
}

export default function ConnectDeviceItem({
  device,
  isActive,
  isThisDevice,
  onSelect,
}: ConnectDeviceItemProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(device.id);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left group
        ${isActive ? 'bg-primary/20 text-primary' : 'hover:bg-foreground/5 text-secondary hover:text-foreground'}
      `}
    >
      <div className={`p-2 rounded-full ${isActive ? 'bg-primary text-black' : 'bg-foreground/5 group-hover:bg-foreground/10 text-foreground'}`}>
        {getDeviceIcon(device.name)}
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className={`font-semibold text-sm truncate ${isActive ? 'text-primary' : 'text-foreground'}`}>
          {isThisDevice ? t('player.this_browser') : device.name}
        </span>
        <span className="text-xs opacity-70 truncate">
          {isActive ? t('player.listening_here') : 'Holad Connect'}
        </span>
      </div>
    </button>
  );
}
