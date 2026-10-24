import { isCapacitor } from './StorageManager';

/**
 * Requests native Android audio focus via AudioDevicePlugin when playback starts.
 */
export async function requestNativeAudioFocus(): Promise<boolean> {
  if (isCapacitor()) {
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const AudioDevice = registerPlugin<any>('AudioDevice');
      if (AudioDevice && typeof AudioDevice.requestAudioFocus === 'function') {
        const res = await AudioDevice.requestAudioFocus();
        return Boolean(res?.granted);
      }
    } catch (e) {
      console.warn('[AudioFocus] Failed to request native audio focus', e);
    }
  }
  return true;
}

/**
 * Abandons native Android audio focus via AudioDevicePlugin when playback pauses or stops.
 */
export async function abandonNativeAudioFocus(): Promise<void> {
  if (isCapacitor()) {
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const AudioDevice = registerPlugin<any>('AudioDevice');
      if (AudioDevice && typeof AudioDevice.abandonAudioFocus === 'function') {
        await AudioDevice.abandonAudioFocus();
      }
    } catch (e) {
      console.warn('[AudioFocus] Failed to abandon native audio focus', e);
    }
  }
}
