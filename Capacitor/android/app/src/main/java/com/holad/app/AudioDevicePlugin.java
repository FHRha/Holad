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
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
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
public class AudioDevicePlugin extends Plugin {
    private static final String TAG = "AudioDevicePlugin";
    public static volatile long lastBluetoothAclConnectedTime = 0L;
    public static volatile long lastHeadphonesPauseTime = 0L;
    public static volatile boolean wasPlayingBeforeHeadphonesPause = false;
    public static volatile boolean isHeadphonesActive = false;

    public static boolean isBluetoothConnecting() {
        long now = android.os.SystemClock.uptimeMillis();
        // If music was actively playing through headphones and paused recently (within 45s),
        // any incoming play/resume event is an in-ear wear detection resume, NOT a cold connect!
        if (wasPlayingBeforeHeadphonesPause && (now - lastHeadphonesPauseTime <= 45000L)) {
            Log.d(TAG, "isBluetoothConnecting: false (in-ear wear detection resume window active: " + (now - lastHeadphonesPauseTime) + "ms)");
            return false;
        }
        // During cold connection (idle or paused > 45s), block spurious peripheral startup play signals for 3 seconds.
        boolean connecting = (now - lastBluetoothAclConnectedTime < 3000L);
        if (connecting) {
            Log.i(TAG, "isBluetoothConnecting: true (cold connection grace period active)");
        }
        return connecting;
    }

    public static void markPlaybackStarted() {
        wasPlayingBeforeHeadphonesPause = false;
        lastHeadphonesPauseTime = 0L;
        Log.d(TAG, "markPlaybackStarted: cleared in-ear wear detection window");
    }

    public static void markPlaybackPaused() {
        if (isHeadphonesActive) {
            lastHeadphonesPauseTime = android.os.SystemClock.uptimeMillis();
            wasPlayingBeforeHeadphonesPause = true;
            Log.i(TAG, "markPlaybackPaused: in-ear wear detection window opened for 45s");
        }
    }

    private AudioManager audioManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothA2dp a2dpProfile;
    private BluetoothHeadset headsetProfile;
    private BluetoothProfile.ServiceListener profileListener;

    private BroadcastReceiver noisyReceiver;
    private BroadcastReceiver deviceChangeReceiver;
    private AudioDeviceCallback audioDeviceCallback;

    private Handler mainHandler;

    private PowerManager.WakeLock wakeLock;
    private static final long WAKE_LOCK_TIMEOUT_MS = 45000L;

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
        isHeadphonesActive = wasHeadphones;
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
                    acquireWakeLock();
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
                    if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(action)) {
                        lastBluetoothAclConnectedTime = android.os.SystemClock.uptimeMillis();
                        notifyHeadphonesConnected("bluetooth_acl_connected");
                    }
                    handleDeviceStateChange("bluetooth_connected");
                    mainHandler.postDelayed(() -> handleDeviceStateChange("bluetooth_connected_delayed"), 200);

                } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) {
                    Log.i(TAG, "ACTION_ACL_DISCONNECTED received");
                    acquireWakeLock();
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
                    } else if (state == 1) {
                        Log.i(TAG, "Wired headset plugged in -> notify headphones connected");
                        notifyHeadphonesConnected("headset_plugged");
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
        isHeadphonesActive = isNowHeadphones;
        notifyListeners("outputDeviceChanged", currentDevice);
    }

    private synchronized void acquireWakeLock() {
        try {
            Context context = getContext();
            if (context == null) return;
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Holad:AudioDeviceEmergencyPause");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null) {
                wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
                Log.i(TAG, "Acquired temporary WakeLock (45s timeout)");
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to acquire WakeLock", e);
        }
    }

    private synchronized void releaseWakeLockInternal() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                Log.i(TAG, "Released WakeLock");
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to release WakeLock", e);
        }
    }

    private void notifyHeadphonesConnected(String reason) {
        Log.i(TAG, "Headphones connected, reason: " + reason);
        JSObject data = new JSObject();
        data.put("reason", reason);
        JSObject currentDevice = getOutputDeviceJs();
        data.put("device", currentDevice);
        notifyListeners("headphonesConnected", data);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                try {
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('holad:headphonesconnected', { detail: { reason: '" + reason + "' } }));",
                        null
                    );
                } catch (Exception e) {
                    Log.e(TAG, "Error evaluating headphonesconnected javascript", e);
                }
            });
        }
    }

    private void triggerEmergencyPause(String reason) {
        acquireWakeLock();
        if (wasHeadphones || isHeadphonesActive) {
            lastHeadphonesPauseTime = android.os.SystemClock.uptimeMillis();
            wasPlayingBeforeHeadphonesPause = true;
            Log.i(TAG, "Emergency pause: in-ear wear detection window opened for 45s");
        }
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
    public void notifyPlaybackState(PluginCall call) {
        String state = call.getString("state", "paused");
        if ("playing".equalsIgnoreCase(state)) {
            markPlaybackStarted();
        } else if ("paused".equalsIgnoreCase(state)) {
            markPlaybackPaused();
        }
        call.resolve();
    }

    @PluginMethod
    public void releaseWakeLock(PluginCall call) {
        releaseWakeLockInternal();
        if (call != null) {
            call.resolve();
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        Context context = getContext();

        releaseWakeLockInternal();
        wakeLock = null;

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
