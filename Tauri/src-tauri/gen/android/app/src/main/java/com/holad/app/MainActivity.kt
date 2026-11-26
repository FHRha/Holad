package com.holad.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

class MainActivity : TauriActivity() {
  private external fun initNdkContext(context: Context)
  private var permissionsRequested = false

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
    if (!permissionsRequested) {
      checkRuntimePermissions()
    }
  }

  override fun onPause() {
    super.onPause()
    MediaService.setAppInForeground(false)
  }

  private fun dispatchBackButtonEvent() {
    val js = "(function(){try{window.dispatchEvent(new CustomEvent('holad:backbutton'));}catch(e){console.error('[MainActivity] backbutton error:',e);}})();"
    val plugin = MediaSessionPlugin.instance
    if (plugin != null) {
      plugin.evaluateJs(js)
      return
    }
    val decorView = window?.decorView
    if (decorView is ViewGroup) {
      findWebView(decorView)?.post {
        try {
          findWebView(decorView)?.evaluateJavascript(js, null)
        } catch (e: Exception) {
          android.util.Log.e("MainActivity", "Failed to dispatch backbutton event", e)
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
