package com.holad.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.Locale

class MainActivity : TauriActivity() {
  private external fun initNdkContext(context: Context)
  private var permissionsRequested = false
  private var webViewConfigured = false
  private val mainHandler = Handler(Looper.getMainLooper())

  private var safeAreaTopDp = 0f
  private var safeAreaBottomDp = 0f
  private var safeAreaLeftDp = 0f
  private var safeAreaRightDp = 0f
  private var hasMeasuredInsets = false

  private val safeAreaReapplyRunnable = Runnable {
    refreshAndInjectSafeAreaInsets()
  }

  companion object {
    private const val PERMISSION_REQUEST_CODE = 101

    init {
      try {
        System.loadLibrary("holad_lib")
      } catch (e: Throwable) {
        android.util.Log.e("MainActivity", "Failed to load holad_lib", e)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    try {
      initNdkContext(applicationContext)
    } catch (e: Throwable) {
      android.util.Log.e("MainActivity", "Failed to initNdkContext", e)
    }

    setupWindowInsetsListener()
    scheduleStartupSafeAreaReapply()

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        dispatchBackButtonEvent()
      }
    })

    checkRuntimePermissions()
  }

  override fun onResume() {
    super.onResume()
    MediaService.setAppInForeground(true)
    configureWebViewAudioSettings()
    refreshAndInjectSafeAreaInsets()
    if (!permissionsRequested) {
      checkRuntimePermissions()
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      configureWebViewAudioSettings()
      refreshAndInjectSafeAreaInsets()
    }
  }

  private fun configureWebViewAudioSettings() {
    if (webViewConfigured) return
    val decor = window?.decorView as? ViewGroup ?: return
    val wv = findWebView(decor) ?: return
    wv.post {
      try {
        wv.settings.mediaPlaybackRequiresUserGesture = false
        wv.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        webViewConfigured = true
      } catch (e: Throwable) {
        android.util.Log.w("MainActivity", "Failed to configure WebView audio settings", e)
      }
    }
  }

  override fun onPause() {
    super.onPause()
    MediaService.setAppInForeground(false)
  }

  override fun onDestroy() {
    mainHandler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  private fun setupWindowInsetsListener() {
    val rootView = window?.decorView ?: return
    ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
      updateSafeAreaFromInsets(insets)
      injectSafeAreaInsets()
      ViewCompat.onApplyWindowInsets(view, insets)
    }
    ViewCompat.requestApplyInsets(rootView)
  }

  private fun scheduleStartupSafeAreaReapply() {
    mainHandler.postDelayed(safeAreaReapplyRunnable, 300L)
    mainHandler.postDelayed(safeAreaReapplyRunnable, 1000L)
    mainHandler.postDelayed(safeAreaReapplyRunnable, 2000L)
  }

  private fun updateSafeAreaFromInsets(insets: WindowInsetsCompat) {
    val bars = insets.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
    )
    val density = resources.displayMetrics.density.coerceAtLeast(1f)
    safeAreaTopDp = bars.top / density
    safeAreaBottomDp = bars.bottom / density
    safeAreaLeftDp = bars.left / density
    safeAreaRightDp = bars.right / density
    hasMeasuredInsets = true
  }

  private fun refreshAndInjectSafeAreaInsets() {
    if (isFinishing || isDestroyed) return
    val rootView = window?.decorView
    if (rootView != null) {
      val currentInsets = ViewCompat.getRootWindowInsets(rootView)
      if (currentInsets != null) {
        updateSafeAreaFromInsets(currentInsets)
      } else if (!hasMeasuredInsets) {
        ViewCompat.requestApplyInsets(rootView)
      }
    }
    if (hasMeasuredInsets) {
      injectSafeAreaInsets()
    }
  }

  private fun injectSafeAreaInsets() {
    if (isFinishing || isDestroyed) return
    val top = String.format(Locale.US, "%.2f", safeAreaTopDp)
    val bottom = String.format(Locale.US, "%.2f", safeAreaBottomDp)
    val left = String.format(Locale.US, "%.2f", safeAreaLeftDp)
    val right = String.format(Locale.US, "%.2f", safeAreaRightDp)
    val js = "(function(){try{" +
      "var r=document.documentElement;" +
      "if(r&&r.style){" +
      "r.style.setProperty('--native-safe-area-top','${top}px');" +
      "r.style.setProperty('--native-safe-area-bottom','${bottom}px');" +
      "r.style.setProperty('--native-safe-area-left','${left}px');" +
      "r.style.setProperty('--native-safe-area-right','${right}px');" +
      "}" +
      "var d={top:$top,bottom:$bottom,left:$left,right:$right};" +
      "window.__HOLAD_SAFE_AREA__=d;" +
      "window.dispatchEvent(new CustomEvent('holad:safearea',{detail:d}));" +
      "}catch(e){console.error('[MainActivity] safearea error:',e);}})();"
    evaluateInWebView(js)
  }

  private fun dispatchBackButtonEvent() {
    val js = "(function(){try{window.dispatchEvent(new CustomEvent('holad:backbutton'));}catch(e){console.error('[MainActivity] backbutton error:',e);}})();"
    evaluateInWebView(js)
  }

  private fun evaluateInWebView(js: String) {
    val plugin = MediaSessionPlugin.instance
    if (plugin != null) {
      plugin.evaluateJs(js)
      return
    }
    val decorView = window?.decorView
    if (decorView is ViewGroup) {
      val wv = findWebView(decorView) ?: return
      wv.post {
        try {
          wv.evaluateJavascript(js, null)
        } catch (e: Exception) {
          android.util.Log.e("MainActivity", "Failed to evaluate JS in WebView", e)
        }
      }
    }
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

  private fun checkRuntimePermissions() {
    val needed = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
        needed.add(Manifest.permission.POST_NOTIFICATIONS)
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
        needed.add(Manifest.permission.BLUETOOTH_CONNECT)
      }
    }
    if (needed.isNotEmpty()) {
      permissionsRequested = true
      ActivityCompat.requestPermissions(this, needed.toTypedArray(), PERMISSION_REQUEST_CODE)
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    StoragePlugin.onRequestPermissionsResult(requestCode, permissions, grantResults)
  }
}
