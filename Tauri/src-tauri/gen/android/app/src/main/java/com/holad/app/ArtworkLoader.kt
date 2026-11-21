package com.holad.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

object ArtworkLoader {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var lastUrl: String? = null
    @Volatile
    private var cachedBitmap: Bitmap? = null

    fun loadBitmap(urlStr: String?, callback: (Bitmap?) -> Unit) {
        if (urlStr.isNullOrBlank()) {
            cachedBitmap = null
            lastUrl = null
            callback(null)
            return
        }

        if (urlStr == lastUrl && cachedBitmap != null && !cachedBitmap!!.isRecycled) {
            callback(cachedBitmap)
            return
        }

        val requestUrl = urlStr
        lastUrl = requestUrl
        executor.execute {
            var bitmap: Bitmap? = null
            var conn: HttpURLConnection? = null
            var inputStream: InputStream? = null
            try {
                if (requestUrl.startsWith("file://") || requestUrl.startsWith("/")) {
                    val filePath = if (requestUrl.startsWith("file://")) requestUrl.removePrefix("file://") else requestUrl
                    bitmap = BitmapFactory.decodeFile(filePath)
                } else if (requestUrl.startsWith("http://") || requestUrl.startsWith("https://")) {
                    val url = URL(requestUrl)
                    conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 8000
                    conn.readTimeout = 8000
                    conn.doInput = true
                    conn.connect()

                    if (conn.responseCode == HttpURLConnection.HTTP_OK) {
                        inputStream = conn.inputStream
                        bitmap = BitmapFactory.decodeStream(inputStream)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.w("ArtworkLoader", "Failed to load artwork from $requestUrl", e)
                bitmap = null
            } finally {
                try {
                    inputStream?.close()
                } catch (_: Exception) {}
                try {
                    conn?.disconnect()
                } catch (_: Exception) {}
            }

            mainHandler.post {
                if (requestUrl == lastUrl) {
                    cachedBitmap = bitmap
                    callback(bitmap)
                }
            }
        }
    }
}
