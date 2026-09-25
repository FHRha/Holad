import { useState, useEffect } from 'react';
import { isCapacitor } from '../utils/StorageManager';
import { usePlayerStore } from '../store/playerStore';
import { getAudioEngine } from '../audio/AudioEngine';

export interface AudioOutputDevice {
  name: string;
  type: 'bluetooth' | 'wired' | 'speaker' | 'remote' | 'default';
  isHeadphones: boolean;
}

let globalOutputDevice: AudioOutputDevice = {
  name: 'Динамик телефона',
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
    const updateWebDevices = () => {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices()
          .then((devs) => {
            const outputs = devs.filter(d => d.kind === 'audiooutput');
            if (outputs.length > 0) {
              const active = outputs.find(d => d.deviceId === 'default') || outputs[0];
              const label = (active?.label || '').toLowerCase();
              const isBt = /bluetooth|wireless|airpods|buds|freebuds|wh-|wf-|bose|sony/i.test(label);
              const isHp = isBt || /headphone|headset|earphone|наушник/i.test(label);

              updateGlobalDevice({
                name: active.label || (isHp ? 'Наушники' : 'Динамики'),
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
