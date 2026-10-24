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

export function updateGlobalDevice(device: AudioOutputDevice) {
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
  const prefixRegex = /^(default|по умолчанию|связь по умолчанию|communications|system default|standard|standart)\s*-\s*/i;
  while (prefixRegex.test(cleaned)) {
    cleaned = cleaned.replace(prefixRegex, '').trim();
  }
  return cleaned;
}

export const DRIVER_JUNK_REGEX = /(микшер|mixer|a2dp|primary-out|audio out|soundcard|realtek audio|realtek|conexant|high definition audio|устройство с поддержкой|sound blaster|generic audio)/i;

export const GENERIC_DEVICE_REGEX = /^(динамик(и)?(\s+(телефона|компьютера))?|наушники|гарнитур[аы]?|головные телефоны|speakers?|headphones?|headset|earphones?|phone speaker|computer speakers?|default|по умолчанию|связь по умолчанию|unknown|audiooutput|primary sound driver|haut-parleur(s)?|écouteurs|casque|altavoz|altavoces|auriculares|lautsprecher|kopfhörer)$/i;

export const BLUETOOTH_KEYWORDS_REGEX = /\b(bluetooth|wireless|bt)\b|bluetooth|wireless/i;
export const HEADPHONES_KEYWORDS_REGEX = /(headphone|headset|earphone|earbuds?|in-ear|iem|pods?|buds?|наушник|гарнитур)/i;

export function isBluetoothLabel(label: string): boolean {
  return BLUETOOTH_KEYWORDS_REGEX.test(label);
}

export function isHeadphonesLabel(label: string): boolean {
  return isBluetoothLabel(label) || HEADPHONES_KEYWORDS_REGEX.test(label);
}

export function isGenericOrDriverJunk(name: string): boolean {
  const trimmed = cleanRawDeviceLabel(name || '');
  if (!trimmed) return true;
  if (GENERIC_DEVICE_REGEX.test(trimmed)) return true;
  if (DRIVER_JUNK_REGEX.test(trimmed)) return true;
  return false;
}

export function getDeviceDisplayName(device: AudioOutputDevice, t: any): string {
  const cleaned = cleanRawDeviceLabel(device.name || '');

  if (isGenericOrDriverJunk(cleaned)) {
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

  return cleaned;
}

export async function promptSelectAudioOutput(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    if ('selectAudioOutput' in navigator.mediaDevices && typeof (navigator.mediaDevices as any).selectAudioOutput === 'function') {
      try {
        const dev = await (navigator.mediaDevices as any).selectAudioOutput();
        if (dev) {
          if (dev.deviceId) {
            try {
              const engine = getAudioEngine();
              if (engine && typeof (engine as any).setSinkId === 'function') {
                await (engine as any).setSinkId(dev.deviceId);
              }
            } catch (err) {
              console.warn('[AudioDevice] Failed to set sinkId on audio engine:', err);
            }
          }
          if (dev.label) {
            const rawLabel = cleanRawDeviceLabel(dev.label);
            const isBt = isBluetoothLabel(rawLabel);
            const isHp = isHeadphonesLabel(rawLabel);
            updateGlobalDevice({
              name: rawLabel,
              type: isBt ? 'bluetooth' : (isHp ? 'wired' : 'speaker'),
              isHeadphones: isHp
            });
          }
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

let isInitialized = false;
let cleanupFn: (() => void) | null = null;

export function initAudioDeviceManager(): void {
  if (isInitialized) return;
  isInitialized = true;

  const cleanups: (() => void)[] = [];

  // 1. Android Capacitor Native Bridge
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
          cleanups.push(() => {
            if (handle && typeof handle.remove === 'function') handle.remove();
          });
        }).catch(() => {});

        AudioDevice.addListener('outputDeviceChanged', (res: any) => {
          if (res && res.name) {
            const wasHeadphones = globalOutputDevice.isHeadphones;
            const isHp = Boolean(res.isHeadphones);
            updateGlobalDevice({
              name: res.name,
              type: res.type || 'speaker',
              isHeadphones: isHp
            });
            if (wasHeadphones && !isHp && usePlayerStore.getState().isPlaying) {
              handleHeadphonesDisconnected();
            }
          }
        }).then((handle: any) => {
          cleanups.push(() => {
            if (handle && typeof handle.remove === 'function') handle.remove();
          });
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  // 2. DOM Custom Event fallback (sent directly by Android WebView)
  const onDomNoisy = () => {
    handleHeadphonesDisconnected();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('holad:audiobecomingnoisy', onDomNoisy);
    cleanups.push(() => {
      window.removeEventListener('holad:audiobecomingnoisy', onDomNoisy);
    });
  }

  // Helper to query and update web & desktop devices
  const updateDevices = async () => {
    const wasHeadphones = globalOutputDevice.isHeadphones;

    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const nativeDev = await invoke<any>('get_audio_output_device');
        if (nativeDev && nativeDev.name) {
          const rawLabel = cleanRawDeviceLabel(nativeDev.name);
          const isHp = Boolean(nativeDev.is_headphones);
          updateGlobalDevice({
            name: rawLabel,
            type: nativeDev.device_type || 'speaker',
            isHeadphones: isHp
          });
          if (wasHeadphones && !isHp && usePlayerStore.getState().isPlaying) {
            handleHeadphonesDisconnected();
          }
          return;
        }
      } catch {
        // Fallback to mediaDevices below
      }
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const outputs = devs.filter((d) => d.kind === 'audiooutput');
        if (outputs.length > 0) {
          const active = outputs.find((d) => d.deviceId === 'default') || outputs[0];
          const rawLabel = cleanRawDeviceLabel(active?.label || '');
          const isBt = isBluetoothLabel(rawLabel);
          const isHp = isHeadphonesLabel(rawLabel);

          updateGlobalDevice({
            name: rawLabel,
            type: isBt ? 'bluetooth' : (isHp ? 'wired' : 'speaker'),
            isHeadphones: isHp
          });
          if (wasHeadphones && !isHp && usePlayerStore.getState().isPlaying) {
            handleHeadphonesDisconnected();
          }
        }
      } catch {
        // Ignore
      }
    }
  };

  // 3. Tauri Native Bridge & Event Listeners
  if (isTauri()) {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<any>('audio-becoming-noisy', () => {
        handleHeadphonesDisconnected();
      }).then((unlisten) => {
        cleanups.push(unlisten);
      }).catch(() => {});

      listen<any>('audio-device-changed', async (event) => {
        const wasHeadphones = globalOutputDevice.isHeadphones;
        const payload = event?.payload;
        if (payload && payload.name) {
          const isHp = Boolean(payload.is_headphones ?? payload.isHeadphones);
          updateGlobalDevice({
            name: cleanRawDeviceLabel(payload.name),
            type: payload.device_type || payload.type || 'speaker',
            isHeadphones: isHp
          });
          if (wasHeadphones && !isHp && usePlayerStore.getState().isPlaying) {
            handleHeadphonesDisconnected();
          }
        } else {
          await updateDevices();
        }
      }).then((unlisten) => {
        cleanups.push(unlisten);
      }).catch(() => {});
    }).catch(() => {});
  }

  // 4. Web MediaDevices initial detection & event listener
  updateDevices();

  let debounceTimer: any = null;
  const onDeviceChange = () => {
    const wasHeadphones = globalOutputDevice.isHeadphones;
    updateDevices();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (wasHeadphones) {
        await updateDevices();
        if (!globalOutputDevice.isHeadphones && usePlayerStore.getState().isPlaying) {
          handleHeadphonesDisconnected();
        }
      }
    }, 250);
  };

  if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    cleanups.push(() => {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  }

  cleanupFn = () => {
    cleanups.forEach((fn) => {
      try { fn(); } catch {}
    });
    cleanups.length = 0;
  };
}

export function cleanupAudioDeviceManager(): void {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
  isInitialized = false;
}

export function useAudioOutputDevice(): AudioOutputDevice {
  if (!isInitialized && typeof window !== 'undefined') {
    initAudioDeviceManager();
  }

  const [device, setDevice] = useState<AudioOutputDevice>(globalOutputDevice);

  useEffect(() => {
    const onChange = (d: AudioOutputDevice) => setDevice(d);
    listeners.add(onChange);
    setDevice(globalOutputDevice);

    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return device;
}
