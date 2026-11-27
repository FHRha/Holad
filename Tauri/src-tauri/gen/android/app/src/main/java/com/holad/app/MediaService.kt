package com.holad.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.view.KeyEvent
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import android.util.Log
import androidx.media.app.NotificationCompat as MediaNotificationCompat
import androidx.media.session.MediaButtonReceiver

class MediaService : Service(), AudioManager.OnAudioFocusChangeListener {

    companion object {
        const val CHANNEL_ID = "holad_playback_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_PLAY = "com.holad.app.ACTION_PLAY"
        const val ACTION_PAUSE = "com.holad.app.ACTION_PAUSE"
        const val ACTION_PREVIOUS = "com.holad.app.ACTION_PREVIOUS"
        const val ACTION_NEXT = "com.holad.app.ACTION_NEXT"
        const val ACTION_STOP = "com.holad.app.ACTION_STOP"
        const val ACTION_SEEK_TO = "com.holad.app.ACTION_SEEK_TO"
        const val EXTRA_SEEK_POSITION = "extra_seek_position"

        var instance: MediaService? = null
            private set

        @Volatile
        var isRunning: Boolean = false
            private set

        var isAppInForeground: Boolean = true
            private set

        @Volatile
        var lastBluetoothAclConnectedTime: Long = 0L

        @Volatile
        var lastHeadphonesPauseTime: Long = 0L

        @Volatile
        var wasPlayingBeforeHeadphonesPause: Boolean = false

        @Volatile
        var isHeadphonesActive: Boolean = false

        fun isBluetoothConnecting(): Boolean {
            val now = SystemClock.uptimeMillis()
            if (wasPlayingBeforeHeadphonesPause && (now - lastHeadphonesPauseTime <= 45_000L)) {
                Log.d("MediaService", "isBluetoothConnecting: false (in-ear wear detection resume window active: ${now - lastHeadphonesPauseTime}ms)")
                return false
            }
            val connecting = (now - lastBluetoothAclConnectedTime < 3_000L)
            if (connecting) {
                Log.i("MediaService", "isBluetoothConnecting: true (cold connection grace period active)")
            }
            return connecting
        }

        fun markPlaybackStarted() {
            wasPlayingBeforeHeadphonesPause = false
            lastHeadphonesPauseTime = 0L
        }

        fun markPlaybackPaused() {
            if (isHeadphonesActive) {
                lastHeadphonesPauseTime = SystemClock.uptimeMillis()
                wasPlayingBeforeHeadphonesPause = true
                Log.i("MediaService", "markPlaybackPaused: in-ear wear detection window opened for 45s")
            }
        }

        fun setAppInForeground(inForeground: Boolean) {
            Log.i("MediaService", "setAppInForeground: inForeground=$inForeground")
            isAppInForeground = inForeground
            instance?.handleForegroundStateChange(inForeground)
        }
    }

    interface MediaActionListener {
        fun onMediaAction(action: String, extras: Long? = null)
    }

    private val binder = LocalBinder()
    private var mediaSession: MediaSessionCompat? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null

    private var currentTitle: String = ""
    private var currentArtist: String = ""
    private var currentAlbum: String = ""
    private var currentArtworkUrl: String? = null
    private var currentArtworkBitmap: Bitmap? = null
    private var currentDurationMs: Long = 0L
    private var currentPositionMs: Long = 0L
    private var isPlayingState: Boolean = false
    private var isStreamingState: Boolean = true
    private var playbackSpeed: Float = 1.0f

    private var hasAudioFocus: Boolean = false
    private var resumeOnFocusGain: Boolean = false
    private var isForegroundService: Boolean = false

    private var actionListener: MediaActionListener? = null
    private var lastMediaButtonTime: Long = 0L
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY == intent?.action) {
                // Headphone unplugged / bluetooth disconnected
                markPlaybackPaused()
                if (isPlayingState) {
                    updatePlaybackState(false, currentPositionMs, 0f, isStreamingState)
                }
                // Short 10s grace wake so JS/WebView can process the pause cleanly
                try {
                    wakeLock?.acquire(10_000L)
                } catch (_: Exception) {}
                handlePause()
            }
        }
    }
    private var isNoisyReceiverRegistered = false

    inner class LocalBinder : Binder() {
        fun getService(): MediaService = this@MediaService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onCreate() {
        super.onCreate()
        Log.i("MediaService", "MediaService onCreate called")
        instance = this
        isRunning = true
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
        wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "holad:MediaServiceWakeLock")?.apply {
            setReferenceCounted(false)
        }
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val wifiMode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            WifiManager.WIFI_MODE_FULL_LOW_LATENCY
        } else {
            @Suppress("DEPRECATION")
            WifiManager.WIFI_MODE_FULL_HIGH_PERF
        }
        wifiLock = wm?.createWifiLock(wifiMode, "holad:MediaServiceWifiLock")?.apply {
            setReferenceCounted(false)
        }

        createNotificationChannel()
        initMediaSession()
        registerNoisyReceiver()
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        releaseWifiLock()
        unregisterNoisyReceiver()
        abandonAudioFocus()
        mediaSession?.isActive = false
        mediaSession?.release()
        mediaSession = null
        instance = null
        isRunning = false
    }

    fun setMediaActionListener(listener: MediaActionListener?) {
        this.actionListener = listener
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Music playback controls and information"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun isMediaButtonDebounced(): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (now - lastMediaButtonTime > 250L) {
            lastMediaButtonTime = now
            return false
        }
        return true
    }

    private fun initMediaSession() {
        val mbrPendingIntent = MediaButtonReceiver.buildMediaButtonPendingIntent(
            this,
            PlaybackStateCompat.ACTION_PLAY_PAUSE
        )

        mediaSession = MediaSessionCompat(this, "HoladMediaSession", null, mbrPendingIntent).apply {
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            setMediaButtonReceiver(mbrPendingIntent)
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    Log.i("MediaService", "MediaSessionCompat.Callback.onPlay")
                    if (isBluetoothConnecting()) {
                        Log.i("MediaService", "Blocked spurious onPlay() during Bluetooth cold connection grace period")
                        return
                    }
                    handlePlay()
                }

                override fun onPause() {
                    Log.i("MediaService", "MediaSessionCompat.Callback.onPause")
                    handlePause()
                }

                override fun onSkipToNext() {
                    Log.i("MediaService", "MediaSessionCompat.Callback.onSkipToNext")
                    handleNext()
                }

                override fun onSkipToPrevious() {
                    Log.i("MediaService", "MediaSessionCompat.Callback.onSkipToPrevious")
                    handlePrevious()
                }

                override fun onStop() {
                    Log.i("MediaService", "MediaSessionCompat.Callback.onStop")
                    handleStop()
                }

                override fun onSeekTo(pos: Long) {
                    Log.i("MediaService", "MediaSessionCompat.Callback.onSeekTo: pos=$pos")
                    handleSeekTo(pos)
                }

                override fun onMediaButtonEvent(mediaButtonEvent: Intent?): Boolean {
                    val keyEvent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        mediaButtonEvent?.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        mediaButtonEvent?.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
                    }
                    Log.i("MediaService", "onMediaButtonEvent: keyCode=${keyEvent?.keyCode}, action=${keyEvent?.action}")
                    if (keyEvent != null && keyEvent.action == KeyEvent.ACTION_DOWN) {
                        when (keyEvent.keyCode) {
                            KeyEvent.KEYCODE_MEDIA_PLAY -> {
                                if (isBluetoothConnecting()) {
                                    Log.i("MediaService", "Blocked spurious KEYCODE_MEDIA_PLAY during Bluetooth cold connection")
                                    return true
                                }
                                handlePlay()
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                                handlePause()
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> {
                                if (!isMediaButtonDebounced()) {
                                    if (isPlayingState) {
                                        handlePause()
                                    } else {
                                        if (isBluetoothConnecting()) {
                                            Log.i("MediaService", "Blocked spurious play/pause during Bluetooth cold connection")
                                            return true
                                        }
                                        handlePlay()
                                    }
                                }
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                                if (!isMediaButtonDebounced()) {
                                    handleNext()
                                }
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_MEDIA_REWIND -> {
                                if (!isMediaButtonDebounced()) {
                                    handlePrevious()
                                }
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_STOP -> {
                                handleStop()
                                return true
                            }
                        }
                    }
                    if (keyEvent != null && keyEvent.action == KeyEvent.ACTION_UP) {
                        when (keyEvent.keyCode) {
                            KeyEvent.KEYCODE_MEDIA_PLAY,
                            KeyEvent.KEYCODE_MEDIA_PAUSE,
                            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                            KeyEvent.KEYCODE_HEADSETHOOK,
                            KeyEvent.KEYCODE_MEDIA_NEXT,
                            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD,
                            KeyEvent.KEYCODE_MEDIA_PREVIOUS,
                            KeyEvent.KEYCODE_MEDIA_REWIND,
                            KeyEvent.KEYCODE_MEDIA_STOP -> return true
                        }
                    }
                    return super.onMediaButtonEvent(mediaButtonEvent)
                }
            })

            val actions = PlaybackStateCompat.ACTION_PLAY or
                    PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_PLAY_PAUSE or
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                    PlaybackStateCompat.ACTION_STOP or
                    PlaybackStateCompat.ACTION_SEEK_TO

            val initialPlaybackState = PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(PlaybackStateCompat.STATE_NONE, 0L, 1.0f)
                .build()
            setPlaybackState(initialPlaybackState)

            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i("MediaService", "MediaService onStartCommand: action=${intent?.action}")
        MediaButtonReceiver.handleIntent(mediaSession, intent)

        val intentTitle = intent?.getStringExtra("extra_title")
        val intentArtist = intent?.getStringExtra("extra_artist")
        val intentAlbum = intent?.getStringExtra("extra_album")
        val intentDuration = intent?.getLongExtra("extra_duration", -1L) ?: -1L
        val intentArtwork = intent?.getStringExtra("extra_artwork")

        if (!intentTitle.isNullOrEmpty()) {
            currentTitle = intentTitle
        }
        if (!intentArtist.isNullOrEmpty()) {
            currentArtist = intentArtist
        }
        if (!intentAlbum.isNullOrEmpty()) {
            currentAlbum = intentAlbum
        }
        if (intentDuration >= 0L) {
            currentDurationMs = intentDuration
        }
        if (!intentArtwork.isNullOrEmpty() && intentArtwork != currentArtworkUrl) {
            currentArtworkUrl = intentArtwork
            currentArtworkBitmap = null
            ArtworkLoader.loadBitmap(intentArtwork) { bitmap ->
                currentArtworkBitmap = bitmap
                applyMetadataToSession()
                refreshNotification()
            }
        }

        applyMetadataToSession()

        // Always satisfy the Foreground Service contract immediately when started
        startForegroundInternal()
        if (isAppInForeground) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            isForegroundService = false
        }

        intent?.action?.let { action ->
            when (action) {
                ACTION_PLAY -> handlePlay()
                ACTION_PAUSE -> handlePause()
                ACTION_PREVIOUS -> handlePrevious()
                ACTION_NEXT -> handleNext()
                ACTION_STOP -> handleStop()
                ACTION_SEEK_TO -> {
                    val pos = intent.getLongExtra(EXTRA_SEEK_POSITION, 0L)
                    handleSeekTo(pos)
                }
            }
        }

        return START_NOT_STICKY
    }

    private fun registerNoisyReceiver() {
        if (!isNoisyReceiverRegistered) {
            val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            try {
                ContextCompat.registerReceiver(
                    this,
                    noisyReceiver,
                    filter,
                    ContextCompat.RECEIVER_EXPORTED
                )
                isNoisyReceiverRegistered = true
            } catch (e: Exception) {
                Log.e("MediaService", "Failed to register noisy receiver", e)
            }
        }
    }

    private fun unregisterNoisyReceiver() {
        if (isNoisyReceiverRegistered) {
            try {
                unregisterReceiver(noisyReceiver)
            } catch (_: Exception) {}
            isNoisyReceiverRegistered = false
        }
    }

    // --- Audio Focus Management ---

    private fun requestAudioFocus(): Boolean {
        if (hasAudioFocus) return true
        val am = audioManager ?: return false

        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener(this)
                .build()
            audioFocusRequest = focusRequest
            am.requestAudioFocus(focusRequest)
        } else {
            @Suppress("DEPRECATION")
            am.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }

        hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
        return hasAudioFocus
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return
        val am = audioManager ?: return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
            audioFocusRequest = null
        } else {
            @Suppress("DEPRECATION")
            am.abandonAudioFocus(this)
        }
        hasAudioFocus = false
        resumeOnFocusGain = false
    }

    override fun onAudioFocusChange(focusChange: Int) {
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                // Permanent loss of audio focus (e.g. another media app started)
                resumeOnFocusGain = false
                if (isPlayingState) {
                    updatePlaybackState(false, currentPositionMs, 0f)
                }
                handlePause()
                abandonAudioFocus()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                // Transient loss of audio focus (e.g. incoming phone call)
                if (isPlayingState) {
                    resumeOnFocusGain = true
                    updatePlaybackState(false, currentPositionMs, 0f)
                    handlePause()
                }
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                // Lower volume or pause (forward duck to webview/audio engine)
                if (isPlayingState) {
                    resumeOnFocusGain = true
                    actionListener?.onMediaAction("duck")
                }
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                // Audio focus restored
                actionListener?.onMediaAction("unduck")
                if (resumeOnFocusGain) {
                    resumeOnFocusGain = false
                    handlePlay()
                }
            }
        }
    }

    fun handleForegroundStateChange(inForeground: Boolean) {
        if (inForeground) {
            Log.i("MediaService", "handleForegroundStateChange(true): app is in foreground, removing notification from shade")
            if (isForegroundService) {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                isForegroundService = false
            } else {
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.cancel(NOTIFICATION_ID)
            }
        } else {
            Log.i("MediaService", "handleForegroundStateChange(false): app moved to background, isPlayingState=$isPlayingState")
            if (isPlayingState) {
                startForegroundInternal()
            }
        }
    }

    // --- Internal Action Dispatchers ---

    fun handlePlay() {
        Log.i("MediaService", "handlePlay invoked")
        if (!hasAudioFocus) {
            if (!requestAudioFocus()) {
                Log.w("MediaService", "handlePlay: AudioFocus denied (e.g. active phone call), aborting play")
                return
            }
        }
        val listener = actionListener ?: MediaSessionPlugin.instance
        listener?.onMediaAction("play")
    }

    fun handlePause() {
        Log.i("MediaService", "handlePause invoked")
        val listener = actionListener ?: MediaSessionPlugin.instance
        listener?.onMediaAction("pause")
    }

    fun handlePrevious() {
        Log.i("MediaService", "handlePrevious invoked")
        val listener = actionListener ?: MediaSessionPlugin.instance
        listener?.onMediaAction("previoustrack")
    }

    fun handleNext() {
        Log.i("MediaService", "handleNext invoked")
        val listener = actionListener ?: MediaSessionPlugin.instance
        listener?.onMediaAction("nexttrack")
    }

    fun handleStop() {
        Log.i("MediaService", "handleStop invoked")
        isPlayingState = false
        releaseWakeLock()
        releaseWifiLock()
        val listener = actionListener ?: MediaSessionPlugin.instance
        listener?.onMediaAction("stop")
        stopForegroundInternal()
    }

    fun handleSeekTo(posMs: Long) {
        Log.i("MediaService", "handleSeekTo invoked: posMs=$posMs")
        val listener = actionListener ?: MediaSessionPlugin.instance
        listener?.onMediaAction("seekto", posMs)
    }

    // --- Public State and Metadata API ---

    fun updateMetadata(
        title: String,
        artist: String,
        album: String,
        durationMs: Long,
        artworkUrl: String?
    ) {
        Log.i("MediaService", "updateMetadata: title='$title', artist='$artist', duration=${durationMs}ms")
        currentTitle = title
        currentArtist = artist
        currentAlbum = album
        currentDurationMs = durationMs

        if (artworkUrl != currentArtworkUrl) {
            currentArtworkUrl = artworkUrl
            currentArtworkBitmap = null

            ArtworkLoader.loadBitmap(artworkUrl) { bitmap ->
                currentArtworkBitmap = bitmap
                applyMetadataToSession()
                refreshNotification()
            }
        }

        applyMetadataToSession()
        refreshNotification()
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock?.isHeld != true) {
                wakeLock?.acquire()
            }
        } catch (e: Exception) {
            Log.w("MediaService", "Failed to acquire WakeLock", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            Log.w("MediaService", "Failed to release WakeLock", e)
        }
    }

    private fun acquireWifiLock() {
        try {
            if (wifiLock?.isHeld != true) {
                wifiLock?.acquire()
            }
        } catch (e: Exception) {
            Log.w("MediaService", "Failed to acquire WifiLock", e)
        }
    }

    private fun releaseWifiLock() {
        try {
            if (wifiLock?.isHeld == true) {
                wifiLock?.release()
            }
        } catch (e: Exception) {
            Log.w("MediaService", "Failed to release WifiLock", e)
        }
    }

    fun updatePlaybackState(
        isPlaying: Boolean,
        positionMs: Long,
        speed: Float = 1.0f,
        isStreaming: Boolean = true
    ) {
        Log.i("MediaService", "updatePlaybackState: isPlaying=$isPlaying, pos=${positionMs}ms, speed=$speed, isStreaming=$isStreaming")
        var effectiveIsPlaying = isPlaying
        if (effectiveIsPlaying && !hasAudioFocus) {
            if (!requestAudioFocus()) {
                Log.w("MediaService", "updatePlaybackState: AudioFocus denied, refusing STATE_PLAYING")
                effectiveIsPlaying = false
            }
        }

        val wasPlaying = isPlayingState
        isPlayingState = effectiveIsPlaying
        isStreamingState = isStreaming
        currentPositionMs = positionMs
        playbackSpeed = if (effectiveIsPlaying) {
            if (speed > 0f) speed else 1.0f
        } else {
            0f
        }

        if (effectiveIsPlaying) {
            markPlaybackStarted()
            acquireWakeLock()
            if (isStreaming) {
                acquireWifiLock()
            } else {
                releaseWifiLock()
            }
        } else {
            if (wasPlaying) {
                markPlaybackPaused()
            }
            releaseWakeLock()
            releaseWifiLock()
            if (!resumeOnFocusGain) {
                abandonAudioFocus()
            }
        }

        val state = if (effectiveIsPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        val actions = PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_STOP or
                PlaybackStateCompat.ACTION_SEEK_TO

        val playbackState = PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, positionMs, playbackSpeed, android.os.SystemClock.elapsedRealtime())
            .build()

        mediaSession?.setPlaybackState(playbackState)

        if (effectiveIsPlaying) {
            if (!isAppInForeground) {
                if (!isForegroundService || !wasPlaying) {
                    startForegroundInternal()
                }
            }
        } else {
            if (wasPlaying || isForegroundService) {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
                isForegroundService = false
                if (!isAppInForeground) {
                    refreshNotification()
                }
            }
        }
    }

    private fun applyMetadataToSession() {
        val metaBuilder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_DESCRIPTION, currentAlbum)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDurationMs)

        if (currentArtworkBitmap != null) {
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentArtworkBitmap)
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, currentArtworkBitmap)
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, currentArtworkBitmap)
        }

        if (!currentArtworkUrl.isNullOrEmpty()) {
            metaBuilder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, currentArtworkUrl)
            metaBuilder.putString(MediaMetadataCompat.METADATA_KEY_ART_URI, currentArtworkUrl)
            metaBuilder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, currentArtworkUrl)
        }

        mediaSession?.setMetadata(metaBuilder.build())
    }

    private fun buildServicePendingIntent(requestCode: Int, action: String, flags: Int): PendingIntent {
        val intent = Intent(this, MediaService::class.java).apply { this.action = action }
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PendingIntent.getForegroundService(this, requestCode, intent, flags)
        } else {
            PendingIntent.getService(this, requestCode, intent, flags)
        }
    }

    private fun buildNotification(): Notification {
        createNotificationChannel()
        val sessionToken = mediaSession?.sessionToken

        val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)

        // Open app on click
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            piFlags
        )

        // Explicit foreground-service PendingIntents so notification actions still work after STOP_FOREGROUND_DETACH on Android O+
        val prevPendingIntent = buildServicePendingIntent(101, ACTION_PREVIOUS, piFlags)
        val playPausePendingIntent = buildServicePendingIntent(
            102,
            if (isPlayingState) ACTION_PAUSE else ACTION_PLAY,
            piFlags
        )
        val nextPendingIntent = buildServicePendingIntent(103, ACTION_NEXT, piFlags)
        val stopPendingIntent = buildServicePendingIntent(104, ACTION_STOP, piFlags)

        val playPauseIcon = if (isPlayingState) R.drawable.ic_pause else R.drawable.ic_play
        val playPauseTitle = if (isPlayingState) "Pause" else "Play"

        val style = MediaNotificationCompat.MediaStyle()
            .setShowActionsInCompactView(0, 1, 2)
            .setShowCancelButton(true)
            .setCancelButtonIntent(stopPendingIntent)

        if (sessionToken != null) {
            style.setMediaSession(sessionToken)
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_holad)
            .setContentTitle(if (currentTitle.isNotEmpty()) currentTitle else "Holad")
            .setContentText(if (currentArtist.isNotEmpty()) currentArtist else "Playing")
            .setSubText(if (currentAlbum.isNotEmpty()) currentAlbum else null)
            .setContentIntent(contentIntent)
            .setDeleteIntent(stopPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlayingState)
            .addAction(R.drawable.ic_previous, "Previous", prevPendingIntent)
            .addAction(playPauseIcon, playPauseTitle, playPausePendingIntent)
            .addAction(R.drawable.ic_next, "Next", nextPendingIntent)
            .setStyle(style)

        if (currentArtworkBitmap != null) {
            builder.setLargeIcon(currentArtworkBitmap)
        }

        return builder.build()
    }

    private fun startForegroundInternal() {
        val notification = buildNotification()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            isForegroundService = true
            Log.i("MediaService", "startForegroundInternal succeeded! (isForegroundService=true)")
        } catch (e: Exception) {
            Log.e("MediaService", "startForeground failed, falling back to notify()", e)
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(NOTIFICATION_ID, notification)
        }
    }

    private fun stopForegroundInternal() {
        if (isForegroundService) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            isForegroundService = false
        } else {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(NOTIFICATION_ID)
        }
        stopSelf()
    }

    private fun refreshNotification() {
        if (isAppInForeground) {
            return
        }
        val notification = buildNotification()
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
}
