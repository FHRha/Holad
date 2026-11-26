package com.holad.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale

@InvokeArg
class InstallApkArgs {
    var filePath: String? = null
}

@InvokeArg
class DownloadAndInstallArgs {
    var url: String? = null
    var fileName: String? = null
    var sha256: String? = null
}

@TauriPlugin
class ApkUpdaterPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val TAG = "ApkUpdaterPlugin"
    }

    private var webView: WebView? = null

    override fun load(webView: WebView) {
        super.load(webView)
        this.webView = webView
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

    @Command
    fun canInstall(invoke: Invoke) {
        val canInstall = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
        invoke.resolve(JSObject().apply { put("canInstall", canInstall) })
    }

    @Command
    fun openInstallSettings(invoke: Invoke) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
            }
            invoke.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            invoke.reject("Failed to open install settings: ${e.message}", e)
        }
    }

    @Command
    fun installApk(invoke: Invoke) {
        val args = invoke.parseArgs(InstallApkArgs::class.java)
        val filePath = args.filePath?.trim()
        if (filePath.isNullOrEmpty()) {
            invoke.reject("filePath parameter must be provided")
            return
        }

        try {
            val cleanPath = if (filePath.startsWith("file://")) filePath.removePrefix("file://") else filePath
            val file = File(cleanPath)
            if (!file.exists()) {
                invoke.reject("APK file does not exist at: $cleanPath")
                return
            }
            if (!isPathWithinAllowedDirectories(file, activity)) {
                invoke.reject("Access denied: file must be located within application directories.")
                return
            }
            if (!file.name.lowercase(Locale.ROOT).endsWith(".apk")) {
                invoke.reject("Invalid file type: only .apk files can be installed.")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !activity.packageManager.canRequestPackageInstalls()
            ) {
                invoke.resolve(JSObject().apply {
                    put("stage", "permission_required")
                    put("filePath", file.absolutePath)
                })
                return
            }

            launchInstaller(file)
            invoke.resolve(JSObject().apply {
                put("success", true)
                put("stage", "installing")
                put("filePath", file.absolutePath)
            })
        } catch (e: Exception) {
            invoke.reject("Failed to trigger APK installation: ${e.message}", e)
        }
    }

    @Command
    fun downloadAndInstall(invoke: Invoke) {
        val args = invoke.parseArgs(DownloadAndInstallArgs::class.java)
        val urlString = args.url?.trim()
        if (urlString.isNullOrEmpty()) {
            invoke.reject("URL parameter must be provided")
            return
        }
        if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
            invoke.reject("Invalid URL protocol. Only HTTP and HTTPS are allowed.")
            return
        }

        val rawFileName = args.fileName?.trim()
        var fileName = "Holad-Update.apk"
        if (!rawFileName.isNullOrEmpty()) {
            val safe = File(rawFileName).name.trim()
            if (safe.isNotEmpty() && safe != "." && safe != "..") {
                fileName = safe
            }
        }
        if (!fileName.lowercase(Locale.ROOT).endsWith(".apk")) {
            fileName += ".apk"
        }

        val expectedSha256 = args.sha256?.trim()?.lowercase(Locale.ROOT)?.takeIf { it.isNotEmpty() }
        if (!BuildConfig.DEBUG && expectedSha256 == null) {
            invoke.reject("Security error: SHA-256 checksum is required for release APK updates")
            return
        }
        if (expectedSha256 != null && !Regex("^[a-f0-9]{64}$").matches(expectedSha256)) {
            invoke.reject("Security error: invalid SHA-256 checksum format")
            return
        }
        val finalFileName = fileName

        Thread {
            var conn: HttpURLConnection? = null
            try {
                val updatesDir = File(activity.cacheDir, "updates")
                if (!updatesDir.exists()) {
                    updatesDir.mkdirs()
                }

                val destFile = File(updatesDir, finalFileName)
                if (!isPathWithinAllowedDirectories(destFile, activity)) {
                    throw SecurityException("Destination file path is outside allowed application directories")
                }

                if (destFile.exists()) {
                    destFile.delete()
                }

                emitProgress("downloading", 0.0, 0L, 0L, null, null)

                conn = openConnectionWithRedirects(urlString)
                var totalBytes = conn.contentLengthLong
                if (totalBytes <= 0) {
                    conn.getHeaderField("Content-Length")?.toLongOrNull()?.let { totalBytes = it }
                }

                conn.inputStream.use { input ->
                    FileOutputStream(destFile).use { output ->
                        val buffer = ByteArray(32768)
                        var downloaded = 0L
                        var lastEmitTime = System.currentTimeMillis()
                        var lastEmitPercent = -1.0

                        var read: Int
                        while (input.read(buffer).also { read = it } != -1) {
                            output.write(buffer, 0, read)
                            downloaded += read

                            var percent = if (totalBytes > 0) (downloaded.toDouble() / totalBytes) * 100.0 else 0.0
                            if (percent > 100.0) percent = 100.0

                            val now = System.currentTimeMillis()
                            if (now - lastEmitTime >= 100 || kotlin.math.abs(percent - lastEmitPercent) >= 1.0) {
                                lastEmitTime = now
                                lastEmitPercent = percent
                                emitProgress("downloading", percent, downloaded, totalBytes, null, null)
                            }
                        }
                        output.flush()

                        if (!BuildConfig.DEBUG && expectedSha256 == null) {
                            destFile.delete()
                            throw SecurityException("SHA-256 checksum is required for release APK updates")
                        }

                        if (expectedSha256 != null) {
                            val actualSha256 = computeSha256(destFile)
                            if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
                                destFile.delete()
                                throw SecurityException("APK SHA-256 verification failed")
                            }
                        }

                        emitProgress("installing", 100.0, downloaded, totalBytes, null, destFile.absolutePath)

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                            !activity.packageManager.canRequestPackageInstalls()
                        ) {
                            emitProgress("permission_required", 100.0, downloaded, totalBytes, null, destFile.absolutePath)
                            invoke.resolve(JSObject().apply {
                                put("stage", "permission_required")
                                put("filePath", destFile.absolutePath)
                            })
                            return@Thread
                        }

                        launchInstaller(destFile)
                        invoke.resolve(JSObject().apply {
                            put("stage", "installing")
                            put("filePath", destFile.absolutePath)
                        })
                    }
                }
            } catch (e: Exception) {
                val errorMsg = e.message ?: "Unknown download error"
                emitProgress("error", 0.0, 0L, 0L, errorMsg, null)
                invoke.reject("Download failed: $errorMsg", e)
            } finally {
                try { conn?.disconnect() } catch (_: Exception) {}
            }
        }.start()
    }

    private fun launchInstaller(file: File) {
        val apkUri = FileProvider.getUriForFile(
            activity,
            "${activity.packageName}.fileprovider",
            file
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
    }

    private fun emitProgress(
        stage: String,
        percent: Double,
        downloaded: Long,
        total: Long,
        error: String?,
        filePath: String?
    ) {
        val data = JSObject().apply {
            put("stage", stage)
            put("percent", percent)
            put("downloaded", downloaded)
            put("total", total)
            if (error != null) put("error", error)
            if (filePath != null) put("filePath", filePath)
        }
        try {
            trigger("update-download-progress", data)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger update-download-progress", e)
        }

        val detailJson = JSONObject().apply {
            put("stage", stage)
            put("percent", percent)
            put("downloaded", downloaded)
            put("total", total)
            if (error != null) put("error", error)
            if (filePath != null) put("filePath", filePath)
        }.toString()

        val js = "(function(){try{window.dispatchEvent(new CustomEvent('holad:apkdownloadprogress',{detail:$detailJson}));}catch(e){console.error('[$TAG] progress event error:',e);}})();"
        val wv = getActiveWebView()
        if (wv != null) {
            wv.post {
                try {
                    wv.evaluateJavascript(js, null)
                } catch (e: Exception) {
                    Log.e(TAG, "evaluateJavascript progress failed", e)
                }
            }
        } else {
            activity.runOnUiThread {
                try {
                    getActiveWebView()?.evaluateJavascript(js, null)
                } catch (e: Exception) {
                    Log.e(TAG, "evaluateJavascript progress runOnUiThread failed", e)
                }
            }
        }
    }

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(32768)
        FileInputStream(file).use { fis ->
            var read: Int
            while (fis.read(buffer).also { read = it } != -1) {
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun isPathWithinAllowedDirectories(file: File, context: Context): Boolean {
        return try {
            val canonicalPath = file.canonicalPath
            val allowedDirs = arrayOf(
                context.cacheDir,
                context.filesDir,
                context.externalCacheDir,
                context.getExternalFilesDir(null)
            )
            allowedDirs.any { dir ->
                if (dir == null) return@any false
                val canonicalDir = dir.canonicalPath
                canonicalPath == canonicalDir || canonicalPath.startsWith(canonicalDir + File.separator)
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun openConnectionWithRedirects(urlString: String): HttpURLConnection {
        var currentUrl = urlString
        var redirects = 0
        while (redirects < 8) {
            if (!currentUrl.startsWith("http://") && !currentUrl.startsWith("https://")) {
                throw SecurityException("Invalid URL protocol in redirect. Only HTTP and HTTPS are allowed.")
            }
            val url = URL(currentUrl)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                setRequestProperty("User-Agent", "Holad-Android-Updater")
                instanceFollowRedirects = false
                connectTimeout = 15000
                readTimeout = 30000
            }
            conn.connect()

            val code = conn.responseCode
            if (code == HttpURLConnection.HTTP_MOVED_PERM ||
                code == HttpURLConnection.HTTP_MOVED_TEMP ||
                code == HttpURLConnection.HTTP_SEE_OTHER ||
                code == 307 ||
                code == 308
            ) {
                val location = conn.getHeaderField("Location")
                conn.disconnect()
                if (location == null) {
                    throw Exception("Redirect missing Location header")
                }
                currentUrl = URL(URL(currentUrl), location).toExternalForm()
                redirects++
            } else if (code == HttpURLConnection.HTTP_OK) {
                return conn
            } else {
                conn.disconnect()
                throw Exception("HTTP error code: $code")
            }
        }
        throw Exception("Too many redirects")
    }
}
