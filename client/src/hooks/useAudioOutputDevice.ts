import { useState, useEffect } from 'react';
import { isCapacitor, isTauri } from '../utils/StorageManager';
import { usePlayerStore } from '../store/playerStore';
import { getAudioEngine } from '../audio/AudioEngine';

export interface AudioOutputDevice {
  name: string;
  type: 'bluetooth' | 'wired' | 'speaker' | 'remote' | 'default';
  isHeadphones: boolean;
}

export const isMobilePlatform = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !isTauri() && (isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
};

let globalOutputDevice: AudioOutputDevice = {
  name: '',
  type: 'speaker',
  isHeadphones: false
};

const listeners = new Set<(device: AudioOutputDevice) => void>();

function updateGlobalDevice(device: AudioOutputDevice) {
  if (
    globalOutputDevice.name !== device.name ||
    globalOutputDevice.type !== device.type ||
    globalOutputDevice.isHeadphones !== device.isHeadphones
  ) {
    globalOutputDevice = device;
    listeners.forEach((fn) => fn(device));
  }
}

export function cleanRawDeviceLabel(raw: string): string {
  let cleaned = (raw || '').trim();
  const prefixes = [
    /^default\s*-\s*/i,
    /^по умолчанию\s*-\s*/i,
    /^связь по умолчанию\s*-\s*/i,
    /^communications\s*-\s*/i,
    /^system default\s*-\s*/i,
  ];
  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '').trim();
  }
  return cleaned;
}

export function getDeviceDisplayName(device: AudioOutputDevice, t: any): string {
  const trimmed = cleanRawDeviceLabel(device.name || '');
  const genericNames = [
    'динамик телефона',
    'динамики',
    'динамики компьютера',
    'наушники',
    'phone speaker',
    'speakers',
    'computer speakers',
    'headphones',
    'default',
    'по умолчанию',
    'связь по умолчанию',
    'unknown',
    'audiooutput'
  ];
  if (trimmed && !genericNames.includes(trimmed.toLowerCase())) {
    return trimmed;
  }

  if (device.isHeadphones) {
    if (device.type === 'bluetooth') {
      return t('player.bluetooth_headphones', 'Bluetooth-наушники');
    }
    return t('player.wired_headphones', 'Проводные наушники');
  }

  if (isMobilePlatform()) {
    return t('player.phone_speaker', 'Динамик телефона');
  }
  return t('player.computer_speakers', 'Динамики компьютера');
}

export async function promptSelectAudioOutput(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    if ('selectAudioOutput' in navigator.mediaDevices && typeof (navigator.mediaDevices as any).selectAudioOutput === 'function') {
      try {
        const dev = await (navigator.mediaDevices as any).selectAudioOutput();
        if (dev && dev.label) {
          const rawLabel = cleanRawDeviceLabel(dev.label);
          const label = rawLabel.toLowerCase();
          const isBt = /bluetooth|wireless|airpods|buds|freebuds|wh-|wf-|bose|sony|cloud/i.test(label);
          const isHp = isBt || /headphone|headset|earphone|наушник|гарнитур/i.test(label);
          updateGlobalDevice({
            name: rawLabel,
            type: isBt ? 'bluetooth' : (isHp ? 'wired' : 'speaker'),
            isHeadphones: isHp
          });
          return true;
        }
      } catch {
        // User cancelled or dismissed picker
      }
    }
  }
  return false;
}

export function getAudioOutputDevice(): AudioOutputDevice {
  return globalOutputDevice;
}

/**
 * Global pause handler when headphones are disconnected / unplugged
 */
export function handleHeadphonesDisconnected() {
  console.log('[AudioDevice] Headphones disconnected - pausing playback immediately');
  const store = usePlayerStore.getState();
  if (store.isPlaying) {
    store.setIsPlaying(false);
  }
  const engine = getAudioEngine();
  if (engine) {
    engine.pause();
  }
}

export function useAudioOutputDevice() {
  const [device, setDevice] = useState<AudioOutputDevice>(globalOutputDevice);

  useEffect(() => {
    const onChange = (d: AudioOutputDevice) => setDevice(d);
    listeners.add(onChange);

    // 1. Android Capacitor Native Bridge
    let unlistenNoisy: (() => void) | null = null;
    let unlistenDevice: (() => void) | null = null;

    if (isCapacitor()) {
      import('@capacitor/core').then(({ registerPlugin }) => {
        const AudioDevice = registerPlugin<any>('AudioDevice');
        if (AudioDevice) {
          AudioDevice.getOutputDevice()
            .then((res: any) => {
              if (res && res.name) {
                updateGlobalDevice({
                  name: res.name,
                  type: res.type || 'speaker',
                  isHeadphones: Boolean(res.isHeadphones)
                });
              }
            })
            .catch(() => {});

          AudioDevice.addListener('audioBecomingNoisy', () => {
            handleHeadphonesDisconnected();
          }).then((handle: any) => {
            unlistenNoisy = () => {
              if (handle && typeof handle.remove === 'function') handle.remove();
            };
          }).catch(() => {});

          AudioDevice.addListener('outputDeviceChanged', (res: any) => {
            if (res && res.name) {
              updateGlobalDevice({
                name: res.name,
                type: res.type || 'speaker',
                isHeadphones: Boolean(res.isHeadphones)
              });
            }
          }).then((handle: any) => {
            unlistenDevice = () => {
              if (handle && typeof handle.remove === 'function') handle.remove();
            };
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    // 2. DOM Custom Event fallback (sent directly by Android WebView)
    const onDomNoisy = () => {
      handleHeadphonesDisconnected();
    };
    window.addEventListener('holad:audiobecomingnoisy', onDomNoisy);

    // 3. Web & Desktop MediaDevices detection (devicechange)
    const updateWebDevices = async () => {
      if (isTauri()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const nativeDev = await invoke<any>('get_audio_output_device');
          if (nativeDev && nativeDev.name) {
            updateGlobalDevice({
              name: cleanRawDeviceLabel(nativeDev.name),
              type: nativeDev.device_type || 'speaker',
              isHeadphones: Boolean(nativeDev.is_headphones)
            });
            return;
          }
        } catch {
          // Fallback to web mediaDevices below
        }
      }

      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices()
          .then((devs) => {
            const outputs = devs.filter(d => d.kind === 'audiooutput');
            if (outputs.length > 0) {
              const active = outputs.find(d => d.deviceId === 'default') || outputs[0];
              const rawLabel = cleanRawDeviceLabel(active?.label || '');
              const label = rawLabel.toLowerCase();
              const isBt = /bluetooth|wireless|airpods|buds|freebuds|wh-|wf-|bose|sony|cloud/i.test(label);
              const isHp = isBt || /headphone|headset|earphone|наушник|гарнитур/i.test(label);

              updateGlobalDevice({
                name: rawLabel,
                type: isBt ? 'bluetooth' : (isHp ? 'wired' : 'speaker'),
                isHeadphones: isHp
              });
            }
          })
          .catch(() => {});
      }
    };

    updateWebDevices();

    const onDeviceChange = () => {
      const wasHeadphones = globalOutputDevice.isHeadphones;
      updateWebDevices();
      setTimeout(() => {
        // If we were on headphones and now on speakers while playing on web, pause safely
        if (wasHeadphones && !globalOutputDevice.isHeadphones && usePlayerStore.getState().isPlaying) {
          handleHeadphonesDisconnected();
        }
      }, 300);
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    }

    return () => {
      listeners.delete(onChange);
      window.removeEventListener('holad:audiobecomingnoisy', onDomNoisy);
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      }
      if (unlistenNoisy) unlistenNoisy();
      if (unlistenDevice) unlistenDevice();
    };
  }, []);

  return device;
}
