package com.holad.app;

import android.Manifest;
import android.bluetooth.BluetoothA2dp;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothHeadset;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "AudioDevice")
public class AudioDevicePlugin extends Plugin implements AudioManager.OnAudioFocusChangeListener {
    private static final String TAG = "AudioDevicePlugin";

    private AudioManager audioManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothA2dp a2dpProfile;
    private BluetoothHeadset headsetProfile;
    private BluetoothProfile.ServiceListener profileListener;

    private BroadcastReceiver noisyReceiver;
    private BroadcastReceiver deviceChangeReceiver;
    private AudioDeviceCallback audioDeviceCallback;

    private AudioFocusRequest audioFocusRequest;
    private Handler mainHandler;

    private volatile boolean wasHeadphones = false;
    private volatile String lastConnectedBtDeviceName = null;

    @Override
    public void load() {
        super.load();
        Context context = getContext();
        mainHandler = new Handler(Looper.getMainLooper());
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

        initBluetooth(context);
        registerNoisyReceiver(context);
        registerDeviceChangeReceiver(context);
        registerAudioDeviceCallback();

        JSObject initialDevice = getOutputDeviceJs();
        wasHeadphones = initialDevice.optBoolean("isHeadphones", false);
        Log.i(TAG, "AudioDevicePlugin initialized. Initial isHeadphones=" + wasHeadphones);
    }

    private void initBluetooth(Context context) {
        try {
            BluetoothManager bm = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
            bluetoothAdapter = bm != null ? bm.getAdapter() : BluetoothAdapter.getDefaultAdapter();

            if (bluetoothAdapter != null) {
                profileListener = new BluetoothProfile.ServiceListener() {
                    @Override
                    public void onServiceConnected(int profile, BluetoothProfile proxy) {
                        if (profile == BluetoothProfile.A2DP) {
                            a2dpProfile = (BluetoothA2dp) proxy;
                            Log.d(TAG, "Bluetooth A2DP profile proxy connected");
                            handleDeviceStateChange("a2dp_profile_connected");
                        } else if (profile == BluetoothProfile.HEADSET) {
                            headsetProfile = (BluetoothHeadset) proxy;
                            Log.d(TAG, "Bluetooth Headset profile proxy connected");
                            handleDeviceStateChange("headset_profile_connected");
                        }
                    }

                    @Override
                    public void onServiceDisconnected(int profile) {
                        if (profile == BluetoothProfile.A2DP) {
                            a2dpProfile = null;
                            Log.d(TAG, "Bluetooth A2DP profile proxy disconnected");
                        } else if (profile == BluetoothProfile.HEADSET) {
                            headsetProfile = null;
                            Log.d(TAG, "Bluetooth Headset profile proxy disconnected");
                        }
                    }
                };

                bluetoothAdapter.getProfileProxy(context, profileListener, BluetoothProfile.A2DP);
                bluetoothAdapter.getProfileProxy(context, profileListener, BluetoothProfile.HEADSET);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to initialize Bluetooth profile proxies", e);
        }
    }

    private void registerReceiverCompat(Context context, BroadcastReceiver receiver, IntentFilter filter) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            context.registerReceiver(receiver, filter);
        }
    }

    private void registerNoisyReceiver(Context context) {
        noisyReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                    Log.i(TAG, "ACTION_AUDIO_BECOMING_NOISY received - pausing audio");
                    triggerEmergencyPause("audio_becoming_noisy");
                    handleDeviceStateChange("audio_becoming_noisy");
                }
            }
        };

        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        registerReceiverCompat(context, noisyReceiver, filter);
    }

    private void registerDeviceChangeReceiver(Context context) {
        deviceChangeReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String action = intent != null ? intent.getAction() : null;
                if (action == null) return;

                Log.d(TAG, "deviceChangeReceiver action: " + action);

                if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(action) ||
                    BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED.equals(action) ||
                    BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED.equals(action)) {

                    BluetoothDevice device = extractBluetoothDevice(intent);
                    if (device != null) {
                        String name = getDeviceName(device);
                        if (isValidDeviceName(name)) {
                            lastConnectedBtDeviceName = name;
                        }
                    }
                    handleDeviceStateChange("bluetooth_connected");
                    mainHandler.postDelayed(() -> handleDeviceStateChange("bluetooth_connected_delayed"), 200);

                } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) {
                    Log.i(TAG, "ACTION_ACL_DISCONNECTED received");
                    BluetoothDevice device = extractBluetoothDevice(intent);
                    if (device != null) {
                        String name = getDeviceName(device);
                        if (name != null && name.equals(lastConnectedBtDeviceName)) {
                            lastConnectedBtDeviceName = null;
                        }
                    }

                    // TWS earbud placed in case / powered off:
                    // If output was headphones, immediately trigger emergency pause
                    if (wasHeadphones) {
                        Log.i(TAG, "ACL disconnected while wasHeadphones=true -> emergency pause");
                        triggerEmergencyPause("bluetooth_acl_disconnected");
                    }
                    handleDeviceStateChange("bluetooth_acl_disconnected");
                    mainHandler.postDelayed(() -> handleDeviceStateChange("bluetooth_acl_disconnected_verify"), 150);

                } else if (Intent.ACTION_HEADSET_PLUG.equals(action)) {
                    int state = intent.getIntExtra("state", -1);
                    Log.d(TAG, "ACTION_HEADSET_PLUG state=" + state);
                    if (state == 0 && wasHeadphones) {
                        Log.i(TAG, "Wired headset unplugged while wasHeadphones=true -> emergency pause");
                        triggerEmergencyPause("headset_unplugged");
                    }
                    handleDeviceStateChange("headset_plug_changed");
                } else {
                    handleDeviceStateChange("generic_change");
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_HEADSET_PLUG);
        filter.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        filter.addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED);
        filter.addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED);
        registerReceiverCompat(context, deviceChangeReceiver, filter);
    }

    private BluetoothDevice extractBluetoothDevice(Intent intent) {
        if (intent == null) return null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
            } else {
                return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error extracting BluetoothDevice from intent", e);
            return null;
        }
    }

    private void registerAudioDeviceCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && audioManager != null) {
            audioDeviceCallback = new AudioDeviceCallback() {
                @Override
                public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                    Log.d(TAG, "onAudioDevicesAdded");
                    handleDeviceStateChange("audio_devices_added");
                }

                @Override
                public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                    Log.d(TAG, "onAudioDevicesRemoved");
                    JSObject current = getOutputDeviceJs();
                    boolean isNowHeadphones = current.optBoolean("isHeadphones", false);
                    if (wasHeadphones && !isNowHeadphones) {
                        Log.i(TAG, "Audio devices removed and output switched to speaker -> emergency pause");
                        triggerEmergencyPause("audio_devices_removed");
                    }
                    wasHeadphones = isNowHeadphones;
                    notifyListeners("outputDeviceChanged", current);
                }
            };
            audioManager.registerAudioDeviceCallback(audioDeviceCallback, null);
        }
    }

    private synchronized void handleDeviceStateChange(String triggerReason) {
        JSObject currentDevice = getOutputDeviceJs();
        boolean isNowHeadphones = currentDevice.optBoolean("isHeadphones", false);

        if (wasHeadphones && !isNowHeadphones) {
            Log.i(TAG, "Device state transition from headphones to speaker [reason: " + triggerReason + "] -> emergency pause");
            triggerEmergencyPause(triggerReason);
        }
        wasHeadphones = isNowHeadphones;
        notifyListeners("outputDeviceChanged", currentDevice);
    }

    private void triggerEmergencyPause(String reason) {
        Log.i(TAG, "Triggering emergency pause, reason: " + reason);
        JSObject data = new JSObject();
        data.put("reason", reason);
        notifyListeners("audioBecomingNoisy", data);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                try {
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('holad:audiobecomingnoisy', { detail: { reason: '" + reason + "' } }));",
                        null
                    );
                } catch (Exception e) {
                    Log.e(TAG, "Error evaluating noisy javascript", e);
                }
            });
        }
    }

    private boolean hasBluetoothConnectPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private String getDeviceName(BluetoothDevice device) {
        if (device == null || !hasBluetoothConnectPermission()) {
            return null;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                String alias = device.getAlias();
                if (alias != null && !alias.trim().isEmpty()) {
                    return alias.trim();
                }
            }
            String name = device.getName();
            if (name != null && !name.trim().isEmpty()) {
                return name.trim();
            }
        } catch (SecurityException e) {
            Log.w(TAG, "SecurityException reading Bluetooth device name", e);
        } catch (Exception e) {
            Log.w(TAG, "Error reading Bluetooth device name", e);
        }
        return null;
    }

    private boolean isGenericDriverName(String name) {
        if (name == null || name.trim().isEmpty()) {
            return true;
        }
        String lower = name.trim().toLowerCase(Locale.ROOT);
        return lower.contains("a2dp") ||
               lower.contains("primary-out") ||
               lower.contains("primary_out") ||
               lower.contains("primary out") ||
               lower.contains("speaker") ||
               lower.contains("динамик") ||
               lower.contains("audio out") ||
               lower.contains("audio_out") ||
               lower.contains("audio mixer") ||
               lower.contains("mixer") ||
               lower.contains("микшер") ||
               lower.contains("media audio") ||
               lower.contains("submix") ||
               lower.contains("telephony") ||
               lower.contains("builtin") ||
               lower.contains("built-in") ||
               lower.contains("default") ||
               lower.contains("unknown") ||
               lower.contains("audiooutput") ||
               lower.equals("phone") ||
               lower.equals("android");
    }

    private boolean isValidDeviceName(String name) {
        return name != null && !name.trim().isEmpty() && !isGenericDriverName(name);
    }

    private String getConnectedBluetoothDeviceName(AudioDeviceInfo activeDev) {
        // 1. Try from AudioDeviceInfo MAC address (Android 9+ / API 28+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && activeDev != null && bluetoothAdapter != null && hasBluetoothConnectPermission()) {
            try {
                String address = activeDev.getAddress();
                if (address != null && BluetoothAdapter.checkBluetoothAddress(address)) {
                    BluetoothDevice dev = bluetoothAdapter.getRemoteDevice(address);
                    if (dev != null) {
                        String name = getDeviceName(dev);
                        if (isValidDeviceName(name)) {
                            return name;
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Error resolving remote device by address", e);
            }
        }

        // 2. Try A2DP connected devices
        if (hasBluetoothConnectPermission() && a2dpProfile != null) {
            try {
                List<BluetoothDevice> devs = a2dpProfile.getConnectedDevices();
                if (devs != null && !devs.isEmpty()) {
                    for (BluetoothDevice dev : devs) {
                        String name = getDeviceName(dev);
                        if (isValidDeviceName(name)) {
                            return name;
                        }
                    }
                }
            } catch (SecurityException e) {
                Log.w(TAG, "SecurityException getting A2DP devices", e);
            } catch (Exception e) {
                Log.w(TAG, "Error getting A2DP devices", e);
            }
        }

        // 3. Try Headset connected devices
        if (hasBluetoothConnectPermission() && headsetProfile != null) {
            try {
                List<BluetoothDevice> devs = headsetProfile.getConnectedDevices();
                if (devs != null && !devs.isEmpty()) {
                    for (BluetoothDevice dev : devs) {
                        String name = getDeviceName(dev);
                        if (isValidDeviceName(name)) {
                            return name;
                        }
                    }
                }
            } catch (SecurityException e) {
                Log.w(TAG, "SecurityException getting Headset devices", e);
            } catch (Exception e) {
                Log.w(TAG, "Error getting Headset devices", e);
            }
        }

        // 4. Cached name from last connected intent
        if (isValidDeviceName(lastConnectedBtDeviceName)) {
            return lastConnectedBtDeviceName;
        }

        // 5. Try activeDev.getProductName() if it's not a driver string
        if (activeDev != null) {
            CharSequence prod = activeDev.getProductName();
            if (prod != null) {
                String prodStr = prod.toString().trim();
                if (isValidDeviceName(prodStr)) {
                    return prodStr;
                }
            }
        }

        return "Bluetooth-наушники";
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
                        String name = getConnectedBluetoothDeviceName(dev);
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
                        String prodStr = prodName != null ? prodName.toString().trim() : "";
                        String name = isValidDeviceName(prodStr) ? prodStr : "Проводные наушники";
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
                        String prodStr = prodName != null ? prodName.toString().trim() : "";
                        String name = isValidDeviceName(prodStr) ? prodStr : "USB Audio";
                        ret.put("name", name);
                        ret.put("type", "wired");
                        ret.put("isHeadphones", true);
                        return ret;
                    }
                }
            } else {
                if (audioManager.isBluetoothA2dpOn()) {
                    String name = getConnectedBluetoothDeviceName(null);
                    ret.put("name", name);
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

    @PluginMethod
    public void requestAudioFocus(PluginCall call) {
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManager == null) {
                call.reject("AudioManager not available");
                return;
            }

            int result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (audioFocusRequest == null) {
                    AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build();

                    audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(playbackAttributes)
                        .setAcceptsDelayedFocusGain(true)
                        .setOnAudioFocusChangeListener(this)
                        .build();
                }
                result = audioManager.requestAudioFocus(audioFocusRequest);
            } else {
                result = audioManager.requestAudioFocus(
                    this,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
                );
            }

            boolean granted = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
            JSObject ret = new JSObject();
            ret.put("granted", granted);
            ret.put("result", result);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error requesting audio focus", e);
            call.reject("Error requesting audio focus: " + e.getMessage());
        }
    }

    @PluginMethod
    public void abandonAudioFocus(PluginCall call) {
        try {
            if (audioManager != null) {
                int result;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                    result = audioManager.abandonAudioFocusRequest(audioFocusRequest);
                } else {
                    result = audioManager.abandonAudioFocus(this);
                }
                JSObject ret = new JSObject();
                ret.put("granted", result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
                ret.put("result", result);
                call.resolve(ret);
            } else {
                call.resolve();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error abandoning audio focus", e);
            call.reject("Error abandoning audio focus: " + e.getMessage());
        }
    }

    @Override
    public void onAudioFocusChange(int focusChange) {
        Log.i(TAG, "onAudioFocusChange: " + focusChange);
        JSObject data = new JSObject();
        data.put("focusChange", focusChange);

        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
                data.put("type", "loss");
                notifyListeners("audioFocusLoss", data);
                triggerEmergencyPause("audio_focus_loss");
                break;

            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                data.put("type", "loss_transient");
                notifyListeners("audioFocusLoss", data);
                triggerEmergencyPause("audio_focus_loss_transient");
                break;

            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                data.put("type", "loss_transient_can_duck");
                notifyListeners("audioFocusLoss", data);
                triggerEmergencyPause("audio_focus_loss_transient_duck");
                break;

            case AudioManager.AUDIOFOCUS_GAIN:
                data.put("type", "gain");
                notifyListeners("audioFocusGain", data);
                break;
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                try {
                    String js = String.format(
                        Locale.ROOT,
                        "window.dispatchEvent(new CustomEvent('holad:audiofocuschange', { detail: { focusChange: %d } }));",
                        focusChange
                    );
                    getBridge().getWebView().evaluateJavascript(js, null);
                } catch (Exception e) {
                    Log.e(TAG, "Error evaluating audiofocuschange js", e);
                }
            });
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        Context context = getContext();

        if (audioManager != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                    audioManager.abandonAudioFocusRequest(audioFocusRequest);
                } else {
                    audioManager.abandonAudioFocus(this);
                }
            } catch (Exception ignored) {}
        }

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

        if (bluetoothAdapter != null) {
            try {
                if (a2dpProfile != null) {
                    bluetoothAdapter.closeProfileProxy(BluetoothProfile.A2DP, a2dpProfile);
                    a2dpProfile = null;
                }
                if (headsetProfile != null) {
                    bluetoothAdapter.closeProfileProxy(BluetoothProfile.HEADSET, headsetProfile);
                    headsetProfile = null;
                }
            } catch (Exception ignored) {}
        }
    }
}
