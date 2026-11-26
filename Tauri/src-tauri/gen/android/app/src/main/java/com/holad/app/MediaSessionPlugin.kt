package com.holad.app

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.Locale

@InvokeArg
class MediaMetadataArgs {
    var title: String? = null
    var artist: String? = null
    var album: String? = null
    var artwork: String? = null
    var duration: Double? = null // seconds
}

@InvokeArg
class PlaybackStateArgs {
    var isPlaying: Boolean = false
    var position: Double? = null // seconds
    var playbackRate: Float? = null
    var isStreaming: Boolean = true
}

@InvokeArg
class RegisterMediaListenerArgs {
    lateinit var handler: Channel
}

@TauriPlugin
class MediaSessionPlugin(private val activity: Activity) : Plugin(activity), MediaService.MediaActionListener {

    companion object {
        private const val TAG = "MediaSessionPlugin"

        var instance: MediaSessionPlugin? = null
            private set
    }

    private var mediaService: MediaService? = null
    private var isBound: Boolean = false
    private var mediaChannel: Channel? = null

    private var pendingTitle: String? = null
    private var pendingArtist: String? = null
    private var pendingAlbum: String? = null
    private var pendingDurationMs: Long = 0L
    private var pendingArtworkUrl: String? = null
    private var pendingIsPlaying: Boolean = false
    private var pendingPositionMs: Long = 0L
    private var pendingSpeed: Float = 1.0f
    private var pendingIsStreaming: Boolean = true

    private var webView: WebView? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    // Audio device & Bluetooth tracking
    private var audioManager: AudioManager? = null
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var a2dpProfile: BluetoothA2dp? = null
    private var headsetProfile: BluetoothHeadset? = null
    private var profileListener: BluetoothProfile.ServiceListener? = null
    private var deviceChangeReceiver: BroadcastReceiver? = null
    private var audioDeviceCallback: AudioDeviceCallback? = null

    @Volatile
    private var wasHeadphones: Boolean = false

    @Volatile
    private var lastConnectedBtDeviceName: String? = null

    @Volatile
    private var isAppActive: Boolean = true

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            Log.i(TAG, "MediaService connected successfully via ServiceConnection!")
            val binder = service as? MediaService.LocalBinder
            val svc = binder?.getService()
            mediaService = svc
            svc?.setMediaActionListener(this@MediaSessionPlugin)

            if (pendingTitle != null) {
                svc?.updateMetadata(pendingTitle ?: "", pendingArtist ?: "", pendingAlbum ?: "", pendingDurationMs, pendingArtworkUrl)
            }
            if (pendingIsPlaying || pendingPositionMs > 0) {
                svc?.updatePlaybackState(pendingIsPlaying, pendingPositionMs, pendingSpeed, pendingIsStreaming)
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.w(TAG, "MediaService disconnected from ServiceConnection")
            mediaService?.setMediaActionListener(null)
            mediaService = null
        }
    }

    init {
        instance = this
        Log.i(TAG, "MediaSessionPlugin instantiated! Starting bindMediaService & audio device tracking...")
        bindMediaService()
        initAudioDeviceTracking()
    }

    override fun load(webView: WebView) {
        super.load(webView)
        this.webView = webView
        Log.i(TAG, "load called with webView: $webView")
    }

    private fun getActiveWebView(): WebView? {
        if (webView != null) return webView
        try {
            val decorView = activity.window?.decorView
            if (decorView is ViewGroup) {
                val found = findWebView(decorView)
                if (found != null) {
                    webView = found
                    return found
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to find WebView in hierarchy", e)
        }
        return null
    }

    private fun findWebView(group: ViewGroup): WebView? {
        for (i in 0 until group.childCount) {
            val child = group.getChildAt(i)
            if (child is WebView) return child
            if (child is ViewGroup) {
                val nested = findWebView(child)
                if (nested != null) return nested
            }
        }
        return null
    }

    fun evaluateJs(js: String) {
        val wv = getActiveWebView()
        if (wv != null) {
            wv.post {
                try {
                    wv.evaluateJavascript(js, null)
                } catch (e: Exception) {
                    Log.e(TAG, "evaluateJavascript post failed", e)
                }
            }
        } else {
            activity.runOnUiThread {
                try {
                    getActiveWebView()?.evaluateJavascript(js, null)
                } catch (e: Exception) {
                    Log.e(TAG, "evaluateJavascript runOnUiThread failed", e)
                }
            }
        }
    }

    private fun dispatchCustomEvent(eventName: String, detailJson: String? = null) {
        val js = if (detailJson != null) {
            "(function(){try{window.dispatchEvent(new CustomEvent('$eventName',{detail:$detailJson}));}catch(e){console.error('[$TAG] event error:',e);}})();"
        } else {
            "(function(){try{window.dispatchEvent(new CustomEvent('$eventName'));}catch(e){console.error('[$TAG] event error:',e);}})();"
        }
        evaluateJs(js)
    }

    private fun bindMediaService() {
        try {
            val intent = Intent(activity, MediaService::class.java)
            activity.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            isBound = true
            Log.i(TAG, "bindService initiated successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind MediaService", e)
        }
    }

    // --- Lifecycle ---

    override fun onResume() {
        super.onResume()
        dispatchAppStateChange(true)
    }

    override fun onPause() {
        super.onPause()
        dispatchAppStateChange(false)
    }

    override fun onStop() {
        super.onStop()
        dispatchAppStateChange(false)
    }

    private fun dispatchAppStateChange(isActive: Boolean) {
        if (isAppActive == isActive) return
        isAppActive = isActive
        val payload = JSObject().apply { put("isActive", isActive) }
        try {
            trigger("appStateChange", payload)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger appStateChange", e)
        }
        dispatchCustomEvent("holad:appstatechange", """{"isActive":$isActive}""")
    }

    override fun onDestroy(activity: AppCompatActivity) {
        if (isBound) {
            mediaService?.setMediaActionListener(null)
            try {
                this.activity.unbindService(serviceConnection)
            } catch (_: Exception) {}
            isBound = false
        }
        cleanupAudioDeviceTracking()
        if (instance === this) {
            instance = null
        }
        super.onDestroy(activity)
    }

    // --- Audio Device & Bluetooth Tracking ---

    private fun initAudioDeviceTracking() {
        audioManager = activity.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        initBluetooth()
        registerDeviceChangeReceiver()
        registerAudioDeviceCallback()

        val initialDevice = getOutputDeviceJs()
        wasHeadphones = initialDevice.optBoolean("isHeadphones", false)
        MediaService.isHeadphonesActive = wasHeadphones
        Log.i(TAG, "Audio device tracking initialized. Initial isHeadphones=$wasHeadphones")
    }

    private fun initBluetooth() {
        try {
            val bm = activity.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            bluetoothAdapter = bm?.adapter ?: @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()

            bluetoothAdapter?.let { adapter ->
                profileListener = object : BluetoothProfile.ServiceListener {
                    override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                        if (profile == BluetoothProfile.A2DP) {
                            a2dpProfile = proxy as? BluetoothA2dp
                            Log.d(TAG, "Bluetooth A2DP profile proxy connected")
                            handleDeviceStateChange("a2dp_profile_connected")
                        } else if (profile == BluetoothProfile.HEADSET) {
                            headsetProfile = proxy as? BluetoothHeadset
                            Log.d(TAG, "Bluetooth Headset profile proxy connected")
                            handleDeviceStateChange("headset_profile_connected")
                        }
                    }

                    override fun onServiceDisconnected(profile: Int) {
                        if (profile == BluetoothProfile.A2DP) {
                            a2dpProfile = null
                            Log.d(TAG, "Bluetooth A2DP profile proxy disconnected")
                        } else if (profile == BluetoothProfile.HEADSET) {
                            headsetProfile = null
                            Log.d(TAG, "Bluetooth Headset profile proxy disconnected")
                        }
                    }
                }
                adapter.getProfileProxy(activity, profileListener, BluetoothProfile.A2DP)
                adapter.getProfileProxy(activity, profileListener, BluetoothProfile.HEADSET)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to initialize Bluetooth profile proxies", e)
        }
    }

    private fun registerDeviceChangeReceiver() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val action = intent?.action ?: return
                Log.d(TAG, "deviceChangeReceiver action: $action")

                when (action) {
                    AudioManager.ACTION_AUDIO_BECOMING_NOISY -> {
                        Log.i(TAG, "ACTION_AUDIO_BECOMING_NOISY received in plugin")
                        triggerEmergencyPause("audio_becoming_noisy")
                        handleDeviceStateChange("audio_becoming_noisy")
                    }
                    BluetoothDevice.ACTION_ACL_CONNECTED,
                    BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED,
                    BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED -> {
                        val device = extractBluetoothDevice(intent)
                        if (device != null) {
                            val name = getDeviceName(device)
                            if (isValidDeviceName(name)) {
                                lastConnectedBtDeviceName = name
                            }
                        }
                        if (BluetoothDevice.ACTION_ACL_CONNECTED == action) {
                            MediaService.lastBluetoothAclConnectedTime = SystemClock.uptimeMillis()
                            notifyHeadphonesConnected("bluetooth_acl_connected")
                        }
                        handleDeviceStateChange("bluetooth_connected")
                        mainHandler.postDelayed({ handleDeviceStateChange("bluetooth_connected_delayed") }, 200L)
                    }
                    BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                        Log.i(TAG, "ACTION_ACL_DISCONNECTED received")
                        val device = extractBluetoothDevice(intent)
                        if (device != null) {
                            val name = getDeviceName(device)
                            if (name != null && name == lastConnectedBtDeviceName) {
                                lastConnectedBtDeviceName = null
                            }
                        }
                        if (wasHeadphones) {
                            Log.i(TAG, "ACL disconnected while wasHeadphones=true -> emergency pause")
                            triggerEmergencyPause("bluetooth_acl_disconnected")
                        }
                        handleDeviceStateChange("bluetooth_acl_disconnected")
                        mainHandler.postDelayed({ handleDeviceStateChange("bluetooth_acl_disconnected_verify") }, 150L)
                    }
                    Intent.ACTION_HEADSET_PLUG -> {
                        val state = intent.getIntExtra("state", -1)
                        Log.d(TAG, "ACTION_HEADSET_PLUG state=$state")
                        if (state == 0 && wasHeadphones) {
                            Log.i(TAG, "Wired headset unplugged while wasHeadphones=true -> emergency pause")
                            triggerEmergencyPause("headset_unplugged")
                        } else if (state == 1) {
                            Log.i(TAG, "Wired headset plugged in -> notify headphones connected")
                            notifyHeadphonesConnected("headset_plugged")
                        }
                        handleDeviceStateChange("headset_plug_changed")
                    }
                    else -> handleDeviceStateChange("generic_change")
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            addAction(Intent.ACTION_HEADSET_PLUG)
            addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
            addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
            addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED)
        }

        try {
            ContextCompat.registerReceiver(activity, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
            deviceChangeReceiver = receiver
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register deviceChangeReceiver", e)
        }
    }

    private fun registerAudioDeviceCallback() {
        val am = audioManager ?: return
        val callback = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
                Log.d(TAG, "onAudioDevicesAdded")
                handleDeviceStateChange("audio_devices_added")
            }

            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
                Log.d(TAG, "onAudioDevicesRemoved")
                val current = getOutputDeviceJs()
                val isNowHeadphones = current.optBoolean("isHeadphones", false)
                if (wasHeadphones && !isNowHeadphones) {
                    Log.i(TAG, "Audio devices removed and output switched to speaker -> emergency pause")
                    triggerEmergencyPause("audio_devices_removed")
                }
                wasHeadphones = isNowHeadphones
                MediaService.isHeadphonesActive = isNowHeadphones
                emitOutputDeviceChanged(current)
            }
        }
        audioDeviceCallback = callback
        am.registerAudioDeviceCallback(callback, mainHandler)
    }

    private fun cleanupAudioDeviceTracking() {
        deviceChangeReceiver?.let {
            try { activity.unregisterReceiver(it) } catch (_: Exception) {}
            deviceChangeReceiver = null
        }
        audioDeviceCallback?.let { cb ->
            try { audioManager?.unregisterAudioDeviceCallback(cb) } catch (_: Exception) {}
            audioDeviceCallback = null
        }
        bluetoothAdapter?.let { adapter ->
            try {
                a2dpProfile?.let { adapter.closeProfileProxy(BluetoothProfile.A2DP, it) }
                headsetProfile?.let { adapter.closeProfileProxy(BluetoothProfile.HEADSET, it) }
            } catch (_: Exception) {}
            a2dpProfile = null
            headsetProfile = null
        }
    }

    @Synchronized
    private fun handleDeviceStateChange(triggerReason: String) {
        val currentDevice = getOutputDeviceJs()
        val isNowHeadphones = currentDevice.optBoolean("isHeadphones", false)

        if (wasHeadphones && !isNowHeadphones) {
            Log.i(TAG, "Device state transition from headphones to speaker [reason: $triggerReason] -> emergency pause")
            triggerEmergencyPause(triggerReason)
        }
        wasHeadphones = isNowHeadphones
        MediaService.isHeadphonesActive = isNowHeadphones
        emitOutputDeviceChanged(currentDevice)
    }

    private fun emitOutputDeviceChanged(device: JSObject) {
        try {
            trigger("outputDeviceChanged", device)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger outputDeviceChanged", e)
        }
        dispatchCustomEvent("holad:outputdevicechanged", device.toString())
    }

    private fun notifyHeadphonesConnected(reason: String) {
        Log.i(TAG, "Headphones connected, reason: $reason")
        val currentDevice = getOutputDeviceJs()
        val data = JSObject().apply {
            put("reason", reason)
            put("device", currentDevice)
        }
        try {
            trigger("headphonesConnected", data)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger headphonesConnected", e)
        }
        val detail = JSONObject().apply {
            put("reason", reason)
            put("device", JSONObject(currentDevice.toString()))
        }
        dispatchCustomEvent("holad:headphonesconnected", detail.toString())
    }

    private fun triggerEmergencyPause(reason: String) {
        if (wasHeadphones || MediaService.isHeadphonesActive) {
            MediaService.markPlaybackPaused()
        }
        Log.i(TAG, "Triggering emergency pause, reason: $reason")
        val data = JSObject().apply { put("reason", reason) }
        try {
            trigger("audioBecomingNoisy", data)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger audioBecomingNoisy", e)
        }
        val detail = JSONObject().apply { put("reason", reason) }
        dispatchCustomEvent("holad:audiobecomingnoisy", detail.toString())
    }

    private fun extractBluetoothDevice(intent: Intent): BluetoothDevice? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error extracting BluetoothDevice from intent", e)
            null
        }
    }

    private fun hasBluetoothConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun getDeviceName(device: BluetoothDevice?): String? {
        if (device == null || !hasBluetoothConnectPermission()) return null
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val alias = device.alias
                if (!alias.isNullOrBlank()) return alias.trim()
            }
            val name = device.name
            if (!name.isNullOrBlank()) name.trim() else null
        } catch (e: SecurityException) {
            Log.w(TAG, "SecurityException reading Bluetooth device name", e)
            null
        } catch (e: Exception) {
            Log.w(TAG, "Error reading Bluetooth device name", e)
            null
        }
    }

    private fun isGenericDriverName(name: String?): Boolean {
        if (name.isNullOrBlank()) return true
        val lower = name.trim().lowercase(Locale.ROOT)
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
            lower == "phone" ||
            lower == "android"
    }

    private fun isValidDeviceName(name: String?): Boolean {
        return !name.isNullOrBlank() && !isGenericDriverName(name)
    }

    private fun getConnectedBluetoothDeviceName(activeDev: AudioDeviceInfo?): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && activeDev != null && bluetoothAdapter != null && hasBluetoothConnectPermission()) {
            try {
                val address = activeDev.address
                if (!address.isNullOrEmpty() && BluetoothAdapter.checkBluetoothAddress(address)) {
                    val dev = bluetoothAdapter?.getRemoteDevice(address)
                    val name = getDeviceName(dev)
                    if (isValidDeviceName(name)) return name!!
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error resolving remote device by address", e)
            }
        }

        if (hasBluetoothConnectPermission() && a2dpProfile != null) {
            try {
                a2dpProfile?.connectedDevices?.forEach { dev ->
                    val name = getDeviceName(dev)
                    if (isValidDeviceName(name)) return name!!
                }
            } catch (e: SecurityException) {
                Log.w(TAG, "SecurityException getting A2DP devices", e)
            } catch (e: Exception) {
                Log.w(TAG, "Error getting A2DP devices", e)
            }
        }

        if (hasBluetoothConnectPermission() && headsetProfile != null) {
            try {
                headsetProfile?.connectedDevices?.forEach { dev ->
                    val name = getDeviceName(dev)
                    if (isValidDeviceName(name)) return name!!
                }
            } catch (e: SecurityException) {
                Log.w(TAG, "SecurityException getting Headset devices", e)
            } catch (e: Exception) {
                Log.w(TAG, "Error getting Headset devices", e)
            }
        }

        if (isValidDeviceName(lastConnectedBtDeviceName)) {
            return lastConnectedBtDeviceName!!
        }

        val prodStr = activeDev?.productName?.toString()?.trim()
        if (isValidDeviceName(prodStr)) {
            return prodStr!!
        }

        return "Bluetooth-наушники"
    }

    fun getOutputDeviceJs(): JSObject {
        val ret = JSObject()
        try {
            val am = audioManager ?: (activity.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.also {
                audioManager = it
            }
            if (am == null) {
                return ret.apply {
                    put("name", "Динамик телефона")
                    put("type", "speaker")
                    put("isHeadphones", false)
                }
            }

            val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)

            // 1. Bluetooth Audio (A2DP, BLE Headset, BLE Speaker, SCO)
            for (dev in devices) {
                val type = dev.type
                var isBt = type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                    type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    isBt = isBt ||
                        type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                        type == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
                        type == AudioDeviceInfo.TYPE_BLE_BROADCAST
                }
                if (isBt) {
                    return ret.apply {
                        put("name", getConnectedBluetoothDeviceName(dev))
                        put("type", "bluetooth")
                        put("isHeadphones", true)
                    }
                }
            }

            // 2. Wired Headphones / Headset / USB Headset
            for (dev in devices) {
                val type = dev.type
                var isWired = type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                    type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    isWired = isWired || type == AudioDeviceInfo.TYPE_USB_HEADSET
                }
                if (isWired) {
                    val prodStr = dev.productName?.toString()?.trim()
                    val name = if (isValidDeviceName(prodStr)) prodStr!! else "Проводные наушники"
                    return ret.apply {
                        put("name", name)
                        put("type", "wired")
                        put("isHeadphones", true)
                    }
                }
            }

            // 3. USB Audio Device
            for (dev in devices) {
                if (dev.type == AudioDeviceInfo.TYPE_USB_DEVICE) {
                    val prodStr = dev.productName?.toString()?.trim()
                    val name = if (isValidDeviceName(prodStr)) prodStr!! else "USB Audio"
                    return ret.apply {
                        put("name", name)
                        put("type", "wired")
                        put("isHeadphones", true)
                    }
                }
            }

            return ret.apply {
                put("name", "Динамик телефона")
                put("type", "speaker")
                put("isHeadphones", false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error resolving output device", e)
            return ret.apply {
                put("name", "Динамик телефона")
                put("type", "speaker")
                put("isHeadphones", false)
            }
        }
    }

    // --- MediaService.MediaActionListener ---

    override fun onMediaAction(action: String, extras: Long?) {
        Log.i(TAG, "onMediaAction received: action=$action, extras=$extras")
        val payload = JSObject().apply {
            put("action", action)
            if (extras != null) {
                put("seekTime", extras / 1000.0)
            }
        }

        try {
            mediaChannel?.send(payload)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send through mediaChannel", e)
        }

        try {
            trigger("mediaAction", payload)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger mediaAction", e)
        }

        val seekArg = if (extras != null) "${extras / 1000.0}" else "undefined"
        val js = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('holad:mediasession:action', { detail: { action: '$action', seekTime: $seekArg } }));
                    if ('$action' === 'play') window.dispatchEvent(new CustomEvent('holad:mediasession:play'));
                    if ('$action' === 'pause') window.dispatchEvent(new CustomEvent('holad:mediasession:pause'));
                    if ('$action' === 'nexttrack') window.dispatchEvent(new CustomEvent('holad:mediasession:nexttrack'));
                    if ('$action' === 'previoustrack') window.dispatchEvent(new CustomEvent('holad:mediasession:previoustrack'));
                } catch (e) {
                    console.error('[MediaSessionPlugin] eval error:', e);
                }
            })();
        """.trimIndent()

        evaluateJs(js)
    }

    // --- Tauri Commands ---

    @Command
    fun registerMediaListener(invoke: Invoke) {
        val args = invoke.parseArgs(RegisterMediaListenerArgs::class.java)
        mediaChannel = args.handler
        Log.i(TAG, "registerMediaListener: Channel registered successfully!")
        invoke.resolve()
    }

    @Command
    fun setMetadata(invoke: Invoke) {
        val args = invoke.parseArgs(MediaMetadataArgs::class.java)
        val title = args.title ?: ""
        val artist = args.artist ?: ""
        val album = args.album ?: ""
        val durationMs = ((args.duration ?: 0.0) * 1000).toLong()
        val artworkUrl = args.artwork

        Log.i(TAG, "setMetadata command: title='$title', artist='$artist', duration=${durationMs}ms, artwork=$artworkUrl")

        pendingTitle = title
        pendingArtist = artist
        pendingAlbum = album
        pendingDurationMs = durationMs
        pendingArtworkUrl = artworkUrl

        val svc = mediaService ?: MediaService.instance
        svc?.updateMetadata(title, artist, album, durationMs, artworkUrl)
        invoke.resolve()
    }

    @Command
    fun setPlaybackState(invoke: Invoke) {
        val args = invoke.parseArgs(PlaybackStateArgs::class.java)
        val isPlaying = args.isPlaying
        val positionMs = ((args.position ?: 0.0) * 1000).toLong()
        val speed = args.playbackRate ?: 1.0f
        val isStreaming = args.isStreaming

        Log.i(TAG, "setPlaybackState command: isPlaying=$isPlaying, position=${positionMs}ms, speed=$speed, isStreaming=$isStreaming")

        pendingIsPlaying = isPlaying
        pendingPositionMs = positionMs
        pendingSpeed = speed
        pendingIsStreaming = isStreaming

        if (isPlaying && !MediaService.isAppInForeground) {
            try {
                val intent = Intent(activity, MediaService::class.java).apply {
                    putExtra("extra_title", pendingTitle)
                    putExtra("extra_artist", pendingArtist)
                    putExtra("extra_album", pendingAlbum)
                    putExtra("extra_duration", pendingDurationMs)
                    putExtra("extra_artwork", pendingArtworkUrl)
                }
                ContextCompat.startForegroundService(activity, intent)
                Log.i(TAG, "ContextCompat.startForegroundService invoked for MediaService with metadata: title='$pendingTitle', artist='$pendingArtist'")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to startForegroundService", e)
            }
        }

        val svc = mediaService ?: MediaService.instance
        svc?.updatePlaybackState(isPlaying, positionMs, speed, isStreaming)
        invoke.resolve()
    }

    @Command
    fun stop(invoke: Invoke) {
        Log.i(TAG, "stop command invoked")
        pendingTitle = null
        pendingIsPlaying = false
        mediaService?.handleStop()
        invoke.resolve()
    }

    @Command
    fun getOutputDevice(invoke: Invoke) {
        invoke.resolve(getOutputDeviceJs())
    }

    @Command
    fun moveToBackground(invoke: Invoke) {
        activity.moveTaskToBack(true)
        invoke.resolve()
    }
}
