import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHoladStore, type HoladDevice } from '../../../store/holadStore';
import ConnectDeviceItem from './ConnectDeviceItem';

export interface ConnectDeviceListProps {
  devices?: HoladDevice[];
  activeDeviceId?: string | null;
  localDeviceId?: string;
  connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectError?: string | null;
  roomId?: string | null;
  showJamHeader?: boolean;
  onSelectDevice: (deviceId: string) => void;
  onRetry?: () => void;
}

export default function ConnectDeviceList({
  devices: propDevices,
  activeDeviceId: propActiveDeviceId,
  localDeviceId: propLocalDeviceId,
  connectionStatus: propConnectionStatus,
  connectError: propConnectError,
  roomId: propRoomId,
  showJamHeader = false,
  onSelectDevice,
  onRetry,
}: ConnectDeviceListProps) {
  const { t } = useTranslation();
  const storeDevices = useHoladStore(s => s.devices);
  const storeActiveDeviceId = useHoladStore(s => s.activeDeviceId);
  const storeLocalDeviceId = useHoladStore(s => s.deviceId);
  const storeConnectionStatus = useHoladStore(s => s.connectionStatus);
  const storeConnectError = useHoladStore(s => s.connectError);
  const storeRoomId = useHoladStore(s => s.roomId);
  const storeConnect = useHoladStore(s => s.connect);

  const devices = propDevices ?? storeDevices;
  const activeDeviceId = propActiveDeviceId !== undefined ? propActiveDeviceId : storeActiveDeviceId;
  const localDeviceId = propLocalDeviceId ?? storeLocalDeviceId;
  const connectionStatus = propConnectionStatus ?? storeConnectionStatus;
  const connectError = propConnectError !== undefined ? propConnectError : storeConnectError;
  const roomId = propRoomId !== undefined ? propRoomId : storeRoomId;

  const handleRetry = onRetry ?? (() => {
    if (roomId) storeConnect(roomId);
  });

  return (
    <>
      {showJamHeader && (
        <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-secondary uppercase tracking-wider">
          {t('player.connect_to_device')}
        </div>
      )}
      <div className="flex flex-col gap-1 max-h-60 overflow-y-auto px-2 pt-2">
        {devices.map((device) => (
          <ConnectDeviceItem
            key={device.id}
            device={device}
            isActive={device.id === activeDeviceId}
            isThisDevice={device.id === localDeviceId}
            onSelect={onSelectDevice}
          />
        ))}

        {connectionStatus === 'connecting' && (
          <div className="px-3 py-4 flex items-center justify-center gap-2 text-sm text-secondary">
            <Loader2 size={16} className="animate-spin text-primary" />
            <span>{t('player.connecting')}</span>
          </div>
        )}

        {connectionStatus === 'error' && (
          <div className="px-3 py-3 flex flex-col items-center gap-2 text-center text-xs text-red-400">
            <span>{t('player.connection_failed')}</span>
            {connectError && (
              <span className="text-[10px] text-red-400/70 max-w-[220px] break-words">
                {connectError}
              </span>
            )}
            {roomId && (
              <button
                type="button"
                onClick={handleRetry}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 text-foreground rounded-lg transition-colors text-xs font-semibold"
              >
                {t('player.retry')}
              </button>
            )}
          </div>
        )}

        {connectionStatus !== 'connecting' && connectionStatus !== 'error' && devices.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-secondary">
            {t('player.devices_not_found')}
          </div>
        )}
      </div>
    </>
  );
}
