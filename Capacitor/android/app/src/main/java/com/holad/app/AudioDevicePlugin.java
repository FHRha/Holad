package com.holad.app;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothHeadset;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioDevice")
public class AudioDevicePlugin extends Plugin {
    private static final String TAG = "AudioDevicePlugin";

    private AudioManager audioManager;
    private BroadcastReceiver noisyReceiver;
    private BroadcastReceiver deviceChangeReceiver;
    private AudioDeviceCallback audioDeviceCallback;

    @Override
    public void load() {
        super.load();
        Context context = getContext();
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

        registerNoisyReceiver(context);
        registerDeviceChangeReceiver(context);
        registerAudioDeviceCallback();
    }

    private void registerNoisyReceiver(Context context) {
        noisyReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                    Log.i(TAG, "ACTION_AUDIO_BECOMING_NOISY received - pausing audio");

                    JSObject data = new JSObject();
                    data.put("reason", "audio_becoming_noisy");
                    notifyListeners("audioBecomingNoisy", data);

                    // Also dispatch native DOM event directly into WebView for immediate response
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().post(() -> {
                            getBridge().getWebView().evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('holad:audiobecomingnoisy'));",
                                null
                            );
                        });
                    }

                    // Update output device state
                    notifyListeners("outputDeviceChanged", getOutputDeviceJs());
                }
            }
        };

        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        context.registerReceiver(noisyReceiver, filter);
    }

    private void registerDeviceChangeReceiver(Context context) {
        deviceChangeReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                notifyListeners("outputDeviceChanged", getOutputDeviceJs());
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_HEADSET_PLUG);
        filter.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        filter.addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED);
        context.registerReceiver(deviceChangeReceiver, filter);
    }

    private void registerAudioDeviceCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && audioManager != null) {
            audioDeviceCallback = new AudioDeviceCallback() {
                @Override
                public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                    notifyListeners("outputDeviceChanged", getOutputDeviceJs());
                }

                @Override
                public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                    notifyListeners("outputDeviceChanged", getOutputDeviceJs());
                }
            };
            audioManager.registerAudioDeviceCallback(audioDeviceCallback, null);
        }
    }

    public JSObject getOutputDeviceJs() {
        JSObject ret = new JSObject();
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManager == null) {
                ret.put("name", "Динамик телефона");
                ret.put("type", "speaker");
                ret.put("isHeadphones", false);
                return ret;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);

                // 1. Bluetooth Audio (A2DP, BLE Headset, BLE Speaker, SCO)
                for (AudioDeviceInfo dev : devices) {
                    int type = dev.getType();
                    boolean isBt = (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                                    type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        isBt = isBt || (type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                                        type == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
                                        type == AudioDeviceInfo.TYPE_BLE_BROADCAST);
                    }
                    if (isBt) {
                        CharSequence prodName = dev.getProductName();
                        String name = (prodName != null && prodName.length() > 0)
                            ? prodName.toString()
                            : "Bluetooth-наушники";
                        ret.put("name", name);
                        ret.put("type", "bluetooth");
                        ret.put("isHeadphones", true);
                        return ret;
                    }
                }

                // 2. Wired Headphones / Headset / USB Headset
                for (AudioDeviceInfo dev : devices) {
                    int type = dev.getType();
                    boolean isWired = (type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                                       type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        isWired = isWired || (type == AudioDeviceInfo.TYPE_USB_HEADSET);
                    }
                    if (isWired) {
                        CharSequence prodName = dev.getProductName();
                        String name = (prodName != null && prodName.length() > 0 && !prodName.toString().equalsIgnoreCase("default"))
                            ? prodName.toString()
                            : "Проводные наушники";
                        ret.put("name", name);
                        ret.put("type", "wired");
                        ret.put("isHeadphones", true);
                        return ret;
                    }
                }

                // 3. USB Audio Device
                for (AudioDeviceInfo dev : devices) {
                    if (dev.getType() == AudioDeviceInfo.TYPE_USB_DEVICE) {
                        CharSequence prodName = dev.getProductName();
                        String name = (prodName != null && prodName.length() > 0)
                            ? prodName.toString()
                            : "USB Audio";
                        ret.put("name", name);
                        ret.put("type", "wired");
                        ret.put("isHeadphones", true);
                        return ret;
                    }
                }
            } else {
                if (audioManager.isBluetoothA2dpOn()) {
                    ret.put("name", "Bluetooth-наушники");
                    ret.put("type", "bluetooth");
                    ret.put("isHeadphones", true);
                    return ret;
                }
                if (audioManager.isWiredHeadsetOn()) {
                    ret.put("name", "Проводные наушники");
                    ret.put("type", "wired");
                    ret.put("isHeadphones", true);
                    return ret;
                }
            }

            ret.put("name", "Динамик телефона");
            ret.put("type", "speaker");
            ret.put("isHeadphones", false);
        } catch (Exception e) {
            Log.e(TAG, "Error resolving output device", e);
            ret.put("name", "Динамик телефона");
            ret.put("type", "speaker");
            ret.put("isHeadphones", false);
        }
        return ret;
    }

    @PluginMethod
    public void getOutputDevice(PluginCall call) {
        call.resolve(getOutputDeviceJs());
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        Context context = getContext();
        if (noisyReceiver != null) {
            try {
                context.unregisterReceiver(noisyReceiver);
            } catch (Exception ignored) {}
            noisyReceiver = null;
        }
        if (deviceChangeReceiver != null) {
            try {
                context.unregisterReceiver(deviceChangeReceiver);
            } catch (Exception ignored) {}
            deviceChangeReceiver = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && audioManager != null && audioDeviceCallback != null) {
            try {
                audioManager.unregisterAudioDeviceCallback(audioDeviceCallback);
            } catch (Exception ignored) {}
            audioDeviceCallback = null;
        }
    }
}
