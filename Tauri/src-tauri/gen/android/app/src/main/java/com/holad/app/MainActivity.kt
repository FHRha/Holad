package com.holad.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  private external fun initNdkContext(context: Context)

  companion object {
    init {
      try {
        System.loadLibrary("holad_lib")
      } catch (e: Throwable) {
        android.util.Log.e("MainActivity", "Failed to load holad_lib", e)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    try {
      initNdkContext(applicationContext)
    } catch (e: Throwable) {
      android.util.Log.e("MainActivity", "Failed to initNdkContext", e)
    }

    checkNotificationPermission()
  }

  override fun onResume() {
    super.onResume()
    checkNotificationPermission()
  }

  private fun checkNotificationPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
      }
    }
  }
}
