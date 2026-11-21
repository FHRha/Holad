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
import android.os.Binder
import android.os.Build
import android.os.IBinder
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
    private var playbackSpeed: Float = 1.0f

    private var hasAudioFocus: Boolean = false
    private var resumeOnFocusGain: Boolean = false
    private var isForegroundService: Boolean = false

    private var actionListener: MediaActionListener? = null
    private var lastMediaButtonTime: Long = 0L
    private var wakeLock: android.os.PowerManager.WakeLock? = null

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY == intent?.action) {
                // Headphone unplugged / bluetooth disconnected
                if (isPlayingState) {
                    updatePlaybackState(false, currentPositionMs, 0f)
                }
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
        instance = this
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val pm = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
        wakeLock = pm?.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "holad:MediaServiceWakeLock")

        createNotificationChannel()
        initMediaSession()
        registerNoisyReceiver()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (wakeLock?.isHeld == true) {
            try { wakeLock?.release() } catch (_: Exception) {}
        }
        unregisterNoisyReceiver()
        abandonAudioFocus()
        mediaSession?.isActive = false
        mediaSession?.release()
        mediaSession = null
        instance = null
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
                    handlePlay()
                }

                override fun onPause() {
                    handlePause()
                }

                override fun onSkipToNext() {
                    handleNext()
                }

                override fun onSkipToPrevious() {
                    handlePrevious()
                }

                override fun onStop() {
                    handleStop()
                }

                override fun onSeekTo(pos: Long) {
                    handleSeekTo(pos)
                }

                override fun onMediaButtonEvent(mediaButtonEvent: Intent?): Boolean {
                    val keyEvent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        mediaButtonEvent?.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        mediaButtonEvent?.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
                    }
                    if (keyEvent != null && keyEvent.action == KeyEvent.ACTION_DOWN) {
                        when (keyEvent.keyCode) {
                            KeyEvent.KEYCODE_MEDIA_PLAY -> {
                                handlePlay()
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                                handlePause()
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> {
                                val now = android.os.SystemClock.elapsedRealtime()
                                if (now - lastMediaButtonTime > 250) {
                                    lastMediaButtonTime = now
                                    if (isPlayingState) handlePause() else handlePlay()
                                }
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_NEXT -> {
                                handleNext()
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
                                handlePrevious()
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_STOP -> {
                                handleStop()
                                return true
                            }
                        }
                    }
                    return super.onMediaButtonEvent(mediaButtonEvent)
                }
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        MediaButtonReceiver.handleIntent(mediaSession, intent)

        // Always satisfy the Foreground Service contract immediately when started
        startForegroundInternal()

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
                    ContextCompat.RECEIVER_NOT_EXPORTED
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

    // --- Internal Action Dispatchers ---

    fun handlePlay() {
        if (!hasAudioFocus) {
            requestAudioFocus()
        }
        actionListener?.onMediaAction("play")
    }

    fun handlePause() {
        actionListener?.onMediaAction("pause")
    }

    fun handlePrevious() {
        actionListener?.onMediaAction("previoustrack")
    }

    fun handleNext() {
        actionListener?.onMediaAction("nexttrack")
    }

    fun handleStop() {
        actionListener?.onMediaAction("stop")
        stopForegroundInternal()
    }

    fun handleSeekTo(posMs: Long) {
        actionListener?.onMediaAction("seekto", posMs)
    }

    // --- Public State and Metadata API ---

    fun updateMetadata(
        title: String,
        artist: String,
        album: String,
        durationMs: Long,
        artworkUrl: String?
    ) {
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

    fun updatePlaybackState(
        isPlaying: Boolean,
        positionMs: Long,
        speed: Float = 1.0f
    ) {
        val wasPlaying = isPlayingState
        isPlayingState = isPlaying
        currentPositionMs = positionMs
        playbackSpeed = if (speed > 0f) speed else 1.0f

        if (isPlaying) {
            if (wakeLock?.isHeld == true) {
                try { wakeLock?.release() } catch (_: Exception) {}
            }
            if (!hasAudioFocus) {
                requestAudioFocus()
            }
        } else {
            try { wakeLock?.acquire(45_000L) } catch (_: Exception) {}
            if (!resumeOnFocusGain) {
                abandonAudioFocus()
            }
        }

        val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
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

        if (isPlaying) {
            if (!isForegroundService || !wasPlaying) {
                startForegroundInternal()
            }
        } else {
            if (wasPlaying || isForegroundService) {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
                isForegroundService = false
                refreshNotification()
            }
        }
    }

    private fun applyMetadataToSession() {
        val metaBuilder = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDurationMs)

        if (currentArtworkBitmap != null) {
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentArtworkBitmap)
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, currentArtworkBitmap)
        }

        mediaSession?.setMetadata(metaBuilder.build())
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

        // Actions
        val prevPendingIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, MediaService::class.java).setAction(ACTION_PREVIOUS),
            piFlags
        )
        val playPauseAction = if (isPlayingState) ACTION_PAUSE else ACTION_PLAY
        val playPausePendingIntent = PendingIntent.getService(
            this,
            2,
            Intent(this, MediaService::class.java).setAction(playPauseAction),
            piFlags
        )
        val nextPendingIntent = PendingIntent.getService(
            this,
            3,
            Intent(this, MediaService::class.java).setAction(ACTION_NEXT),
            piFlags
        )
        val stopPendingIntent = PendingIntent.getService(
            this,
            4,
            Intent(this, MediaService::class.java).setAction(ACTION_STOP),
            piFlags
        )

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
        val notification = buildNotification()
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
}
