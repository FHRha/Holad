import { useHoladStore } from '../store/holadStore';

export function useIsActiveDevice(): boolean {
  const isConnected = useHoladStore(s => s.roomId !== null);
  const activeDeviceId = useHoladStore(s => s.activeDeviceId);
  const localDeviceId = useHoladStore(s => s.deviceId);
  return !isConnected || activeDeviceId === null || activeDeviceId === localDeviceId;
}
