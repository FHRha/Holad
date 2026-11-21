package com.holad.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.IBinder
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

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
}

@TauriPlugin
class MediaSessionPlugin(private val activity: AppCompatActivity) : Plugin(activity), MediaService.MediaActionListener {

    private var mediaService: MediaService? = null
    private var isBound: Boolean = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as? MediaService.LocalBinder
            mediaService = binder?.getService()
            mediaService?.setMediaActionListener(this@MediaSessionPlugin)
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            mediaService?.setMediaActionListener(null)
            mediaService = null
        }
    }

    init {
        bindMediaService()
    }

    private fun bindMediaService() {
        try {
            val intent = Intent(activity, MediaService::class.java)
            activity.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            isBound = true
        } catch (_: Exception) {}
    }

    override fun onDestroy(activity: AppCompatActivity) {
        if (isBound) {
            mediaService?.setMediaActionListener(null)
            this.activity.unbindService(serviceConnection)
            isBound = false
        }
        super.onDestroy(activity)
    }

    override fun onMediaAction(action: String, extras: Long?) {
        val payload = JSObject().apply {
            put("action", action)
            if (extras != null) {
                put("seekTime", extras / 1000.0) // Return in seconds
            }
        }
        trigger("mediaAction", payload)
    }

    @Command
    fun setMetadata(invoke: Invoke) {
        val args = invoke.parseArgs(MediaMetadataArgs::class.java)
        val title = args.title ?: ""
        val artist = args.artist ?: ""
        val album = args.album ?: ""
        val durationMs = ((args.duration ?: 0.0) * 1000).toLong()
        val artworkUrl = args.artwork

        mediaService?.updateMetadata(title, artist, album, durationMs, artworkUrl)
        invoke.resolve()
    }

    @Command
    fun setPlaybackState(invoke: Invoke) {
        val args = invoke.parseArgs(PlaybackStateArgs::class.java)
        val isPlaying = args.isPlaying
        val positionMs = ((args.position ?: 0.0) * 1000).toLong()
        val speed = args.playbackRate ?: 1.0f

        mediaService?.updatePlaybackState(isPlaying, positionMs, speed)
        invoke.resolve()
    }

    @Command
    fun stop(invoke: Invoke) {
        mediaService?.handleStop()
        invoke.resolve()
    }
}
