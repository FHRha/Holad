package com.holad.app

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.IBinder
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

@InvokeArg
class RegisterMediaListenerArgs {
    lateinit var handler: Channel
}

@TauriPlugin
class MediaSessionPlugin(private val activity: Activity) : Plugin(activity), MediaService.MediaActionListener {

    companion object {
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

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            Log.i("MediaSessionPlugin", "MediaService connected successfully via ServiceConnection!")
            val binder = service as? MediaService.LocalBinder
            val svc = binder?.getService()
            mediaService = svc
            svc?.setMediaActionListener(this@MediaSessionPlugin)

            if (pendingTitle != null) {
                svc?.updateMetadata(pendingTitle ?: "", pendingArtist ?: "", pendingAlbum ?: "", pendingDurationMs, pendingArtworkUrl)
            }
            if (pendingIsPlaying || pendingPositionMs > 0) {
                svc?.updatePlaybackState(pendingIsPlaying, pendingPositionMs, pendingSpeed)
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.w("MediaSessionPlugin", "MediaService disconnected from ServiceConnection")
            mediaService?.setMediaActionListener(null)
            mediaService = null
        }
    }

    init {
        instance = this
        Log.i("MediaSessionPlugin", "MediaSessionPlugin instantiated! Starting bindMediaService...")
        bindMediaService()
    }

    private var webView: WebView? = null

    override fun load(webView: WebView) {
        super.load(webView)
        this.webView = webView
        Log.i("MediaSessionPlugin", "load called with webView: $webView")
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
            Log.e("MediaSessionPlugin", "Failed to find WebView in hierarchy", e)
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

    private fun bindMediaService() {
        try {
            val intent = Intent(activity, MediaService::class.java)
            activity.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            isBound = true
            Log.i("MediaSessionPlugin", "bindService initiated successfully")
        } catch (e: Exception) {
            Log.e("MediaSessionPlugin", "Failed to bind MediaService", e)
        }
    }

    override fun onDestroy(activity: AppCompatActivity) {
        if (isBound) {
            mediaService?.setMediaActionListener(null)
            this.activity.unbindService(serviceConnection)
            isBound = false
        }
        if (instance === this) {
            instance = null
        }
        super.onDestroy(activity)
    }

    override fun onMediaAction(action: String, extras: Long?) {
        Log.i("MediaSessionPlugin", "onMediaAction received: action=$action, extras=$extras")
        val payload = JSObject().apply {
            put("action", action)
            if (extras != null) {
                put("seekTime", extras / 1000.0)
            }
        }

        // 1. Deliver directly to registered Channel if available
        try {
            mediaChannel?.send(payload)
        } catch (e: Exception) {
            Log.e("MediaSessionPlugin", "Failed to send through mediaChannel", e)
        }

        // 2. Deliver via standard Tauri plugin event trigger
        try {
            trigger("mediaAction", payload)
        } catch (e: Exception) {
            Log.e("MediaSessionPlugin", "Failed to trigger mediaAction", e)
        }

        // 3. Guaranteed evaluation into WebView via post
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

        val wv = getActiveWebView()
        if (wv != null) {
            wv.post {
                try {
                    wv.evaluateJavascript(js, null)
                } catch (e: Exception) {
                    Log.e("MediaSessionPlugin", "evaluateJavascript post failed", e)
                }
            }
        } else {
            activity.runOnUiThread {
                try {
                    getActiveWebView()?.evaluateJavascript(js, null)
                } catch (e: Exception) {
                    Log.e("MediaSessionPlugin", "evaluateJavascript runOnUiThread failed", e)
                }
            }
        }
    }

    @Command
    fun registerMediaListener(invoke: Invoke) {
        val args = invoke.parseArgs(RegisterMediaListenerArgs::class.java)
        mediaChannel = args.handler
        Log.i("MediaSessionPlugin", "registerMediaListener: Channel registered successfully!")
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

        Log.i("MediaSessionPlugin", "setMetadata command: title='$title', artist='$artist', duration=${durationMs}ms, artwork=$artworkUrl")

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

        Log.i("MediaSessionPlugin", "setPlaybackState command: isPlaying=$isPlaying, position=${positionMs}ms, speed=$speed")

        pendingIsPlaying = isPlaying
        pendingPositionMs = positionMs
        pendingSpeed = speed

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
                Log.i("MediaSessionPlugin", "ContextCompat.startForegroundService invoked for MediaService with metadata: title='$pendingTitle', artist='$pendingArtist'")
            } catch (e: Exception) {
                Log.e("MediaSessionPlugin", "Failed to startForegroundService", e)
            }
        }

        val svc = mediaService ?: MediaService.instance
        svc?.updatePlaybackState(isPlaying, positionMs, speed)
        invoke.resolve()
    }

    @Command
    fun stop(invoke: Invoke) {
        Log.i("MediaSessionPlugin", "stop command invoked")
        pendingTitle = null
        pendingIsPlaying = false
        mediaService?.handleStop()
        invoke.resolve()
    }
}
