package com.holad.app

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Locale

@InvokeArg
class SavePublicAudioArgs {
    var sourcePath: String? = null
    var relativePath: String? = null
    var title: String? = null
    var artist: String? = null
    var album: String? = null
    var mimeType: String? = null
}

@InvokeArg
class DeletePublicAudioArgs {
    var path: String? = null
    var uri: String? = null
}

@TauriPlugin
class StoragePlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val TAG = "StoragePlugin"
        private const val STORAGE_PERMISSION_REQUEST_CODE = 202

        private val AUDIO_EXTENSIONS = setOf(
            "mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "wma", "alac", "aiff"
        )
        private val IMAGE_EXTENSIONS = setOf(
            "jpg", "jpeg", "png", "webp", "bmp"
        )

        @Volatile
        private var pendingPermissionInvoke: Invoke? = null

        @Volatile
        private var instanceRef: StoragePlugin? = null

        fun onRequestPermissionsResult(
            requestCode: Int,
            permissions: Array<out String>,
            grantResults: IntArray
        ) {
            if (requestCode != STORAGE_PERMISSION_REQUEST_CODE) return
            val invoke = pendingPermissionInvoke
            pendingPermissionInvoke = null
            if (invoke != null) {
                val activity = instanceRef?.activity
                val granted = if (activity != null) {
                    hasStoragePermissions(activity)
                } else {
                    grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
                }
                invoke.resolve(JSObject().apply { put("granted", granted) })
            }
        }

        fun getRequiredPermissions(): List<String> {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                listOf(Manifest.permission.READ_MEDIA_AUDIO)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
            } else {
                listOf(
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                )
            }
        }

        fun hasStoragePermissions(context: Context): Boolean {
            return getRequiredPermissions().all { perm ->
                ContextCompat.checkSelfPermission(context, perm) == PackageManager.PERMISSION_GRANTED
            }
        }
    }

    init {
        instanceRef = this
    }

    @Command
    fun requestStoragePermissions(invoke: Invoke) {
        instanceRef = this
        val missing = getRequiredPermissions().filter { perm ->
            ContextCompat.checkSelfPermission(activity, perm) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            invoke.resolve(JSObject().apply { put("granted", true) })
            return
        }

        // Resolve any stale pending invoke before starting a new request
        pendingPermissionInvoke?.resolve(JSObject().apply { put("granted", false) })
        pendingPermissionInvoke = invoke

        activity.runOnUiThread {
            try {
                ActivityCompat.requestPermissions(
                    activity,
                    missing.toTypedArray(),
                    STORAGE_PERMISSION_REQUEST_CODE
                )
            } catch (e: Exception) {
                pendingPermissionInvoke = null
                invoke.reject("Failed to request storage permissions: ${e.message}", e)
            }
        }
    }

    @Command
    fun getPublicMusicDir(invoke: Invoke) {
        try {
            val dir = getHoladPublicMusicDir()
            if (!dir.exists()) {
                dir.mkdirs()
            }
            invoke.resolve(JSObject().apply { put("path", dir.absolutePath) })
        } catch (e: Exception) {
            invoke.reject("Failed to get public music directory: ${e.message}", e)
        }
    }

    @Command
    fun savePublicAudio(invoke: Invoke) {
        val args = invoke.parseArgs(SavePublicAudioArgs::class.java)
        val rawSourcePath = args.sourcePath?.trim()
        if (rawSourcePath.isNullOrEmpty()) {
            invoke.reject("sourcePath parameter must be provided")
            return
        }

        Thread {
            try {
                val cleanSourcePath = if (rawSourcePath.startsWith("file://")) {
                    rawSourcePath.removePrefix("file://")
                } else {
                    rawSourcePath
                }
                val sourceFile = File(cleanSourcePath)
                if (!sourceFile.exists() || !sourceFile.isFile) {
                    invoke.reject("Source audio file does not exist: $cleanSourcePath")
                    return@Thread
                }

                val (resolvedPath, uriString) = publishAudioFile(
                    sourceFile = sourceFile,
                    relativePath = args.relativePath,
                    title = args.title,
                    artist = args.artist,
                    album = args.album,
                    mimeType = args.mimeType
                )

                invoke.resolve(JSObject().apply {
                    put("path", resolvedPath)
                    put("uri", uriString)
                })
            } catch (e: Exception) {
                Log.e(TAG, "savePublicAudio failed", e)
                invoke.reject("Failed to save public audio: ${e.message}", e)
            }
        }.start()
    }

    @Command
    fun deletePublicAudio(invoke: Invoke) {
        val args = invoke.parseArgs(DeletePublicAudioArgs::class.java)
        val rawPath = args.path?.trim()
        val rawUri = args.uri?.trim()

        Thread {
            try {
                if (!rawUri.isNullOrEmpty() && rawUri.startsWith("content://")) {
                    try {
                        activity.contentResolver.delete(Uri.parse(rawUri), null, null)
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to delete MediaStore URI $rawUri", e)
                    }
                }

                if (!rawPath.isNullOrEmpty()) {
                    val cleanPath = if (rawPath.startsWith("file://")) {
                        rawPath.removePrefix("file://")
                    } else {
                        rawPath
                    }
                    try {
                        @Suppress("DEPRECATION")
                        activity.contentResolver.delete(
                            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                            "${MediaStore.Audio.Media.DATA} = ?",
                            arrayOf(cleanPath)
                        )
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to delete MediaStore entry for $cleanPath", e)
                    }
                    val file = File(cleanPath)
                    if (file.exists()) {
                        file.delete()
                    }
                }

                invoke.resolve(JSObject().apply { put("success", true) })
            } catch (e: Exception) {
                Log.e(TAG, "deletePublicAudio failed", e)
                invoke.reject("Failed to delete public audio: ${e.message}", e)
            }
        }.start()
    }

    @Command
    fun migrateLegacyDownloads(invoke: Invoke) {
        Thread {
            try {
                val migratedTracks = mutableListOf<Pair<String, String>>()
                val coverCacheDir = File(File(activity.filesDir, "Holad"), "covers")
                if (!coverCacheDir.exists()) {
                    coverCacheDir.mkdirs()
                }

                val legacyDirs = listOfNotNull(
                    File(activity.filesDir, "Holad"),
                    @Suppress("DEPRECATION")
                    File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        "Holad"
                    )
                )

                for (legacyRoot in legacyDirs) {
                    if (!legacyRoot.exists() || !legacyRoot.isDirectory) continue
                    val isInternalAppDir = legacyRoot.canonicalPath == File(activity.filesDir, "Holad").canonicalPath

                    val files = legacyRoot.walkTopDown()
                        .filter { it.isFile }
                        .toList()

                    for (file in files) {
                        val relPath = try {
                            file.relativeTo(legacyRoot).path.replace('\\', '/')
                        } catch (_: Exception) {
                            file.name
                        }
                        val ext = file.extension.lowercase(Locale.ROOT)

                        if (ext in IMAGE_EXTENSIONS || relPath.startsWith("covers/")) {
                            // Keep cover art in internal app cover cache (appDataDir/Holad/covers)
                            if (isInternalAppDir && relPath.startsWith("covers/")) {
                                continue
                            }
                            val targetCover = File(coverCacheDir, file.name)
                            if (!targetCover.exists()) {
                                copyFile(file, targetCover)
                            }
                            migratedTracks.add(file.absolutePath to targetCover.absolutePath)
                            if (!isInternalAppDir) {
                                file.delete()
                            }
                            continue
                        }

                        if (ext in AUDIO_EXTENSIONS) {
                            try {
                                val (newPath, _) = publishAudioFile(
                                    sourceFile = file,
                                    relativePath = relPath,
                                    title = file.nameWithoutExtension,
                                    artist = null,
                                    album = null,
                                    mimeType = null
                                )
                                migratedTracks.add(file.absolutePath to newPath)
                                if (file.canonicalPath != File(newPath).canonicalPath) {
                                    file.delete()
                                }
                            } catch (e: Exception) {
                                Log.w(TAG, "Failed to migrate legacy audio file ${file.absolutePath}", e)
                            }
                        }
                    }

                    // Clean up empty directories in legacy public Downloads/Holad
                    if (!isInternalAppDir) {
                        cleanupEmptyDirs(legacyRoot)
                    }
                }

                val tracksArray = JSArray()
                for ((oldPath, newPath) in migratedTracks) {
                    tracksArray.put(JSObject().apply {
                        put("oldPath", oldPath)
                        put("newPath", newPath)
                    })
                }

                invoke.resolve(JSObject().apply {
                    put("migratedCount", migratedTracks.size)
                    put("migratedTracks", tracksArray)
                })
            } catch (e: Exception) {
                Log.e(TAG, "migrateLegacyDownloads failed", e)
                invoke.reject("Failed to migrate legacy downloads: ${e.message}", e)
            }
        }.start()
    }

    @Suppress("DEPRECATION")
    private fun getHoladPublicMusicDir(): File {
        return File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
            "Holad"
        )
    }

    private fun publishAudioFile(
        sourceFile: File,
        relativePath: String?,
        title: String?,
        artist: String?,
        album: String?,
        mimeType: String?
    ): Pair<String, String> {
        val normalizedRel = (relativePath ?: sourceFile.name)
            .replace('\\', '/')
            .trim('/')
        val lastSlash = normalizedRel.lastIndexOf('/')
        val rawSubDir = if (lastSlash > 0) normalizedRel.substring(0, lastSlash) else ""
        val sanitizedSubDir = rawSubDir.split('/')
            .map { segment -> sanitizeSegment(segment) }
            .filter { it.isNotEmpty() && it != "." && it != ".." }
            .joinToString("/")
        val rawFileName = if (lastSlash >= 0) normalizedRel.substring(lastSlash + 1) else normalizedRel
        val fileName = sanitizeSegment(rawFileName).ifEmpty { sourceFile.name }
        val resolvedMime = mimeType?.takeIf { it.isNotBlank() } ?: guessAudioMimeType(fileName)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val relMediaDir = if (sanitizedSubDir.isNotEmpty()) {
                "${Environment.DIRECTORY_MUSIC}/Holad/$sanitizedSubDir"
            } else {
                "${Environment.DIRECTORY_MUSIC}/Holad"
            }

            val values = ContentValues().apply {
                put(MediaStore.Audio.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Audio.Media.MIME_TYPE, resolvedMime)
                put(MediaStore.Audio.Media.RELATIVE_PATH, relMediaDir)
                put(MediaStore.Audio.Media.IS_MUSIC, 1)
                put(MediaStore.Audio.Media.IS_PENDING, 1)
                if (!title.isNullOrBlank()) put(MediaStore.Audio.Media.TITLE, title)
                if (!artist.isNullOrBlank()) put(MediaStore.Audio.Media.ARTIST, artist)
                if (!album.isNullOrBlank()) put(MediaStore.Audio.Media.ALBUM, album)
            }

            val resolver = activity.contentResolver
            val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            val uri = resolver.insert(collection, values)
                ?: throw IllegalStateException("MediaStore.insert returned null for $fileName")

            try {
                resolver.openOutputStream(uri)?.use { out ->
                    FileInputStream(sourceFile).use { input ->
                        input.copyTo(out, 32768)
                    }
                } ?: throw IllegalStateException("Failed to open MediaStore output stream for $uri")

                val doneValues = ContentValues().apply {
                    put(MediaStore.Audio.Media.IS_PENDING, 0)
                }
                resolver.update(uri, doneValues, null, null)
            } catch (e: Exception) {
                try {
                    resolver.delete(uri, null, null)
                } catch (_: Exception) {}
                throw e
            }

            val realPath = resolveMediaStorePath(uri) ?: File(
                getHoladPublicMusicDir(),
                if (sanitizedSubDir.isNotEmpty()) "$sanitizedSubDir/$fileName" else fileName
            ).absolutePath

            return realPath to uri.toString()
        } else {
            val baseDir = getHoladPublicMusicDir()
            val targetDir = if (sanitizedSubDir.isNotEmpty()) File(baseDir, sanitizedSubDir) else baseDir
            if (!targetDir.exists()) {
                targetDir.mkdirs()
            }
            val destFile = File(targetDir, fileName)
            if (sourceFile.canonicalPath != destFile.canonicalPath) {
                copyFile(sourceFile, destFile)
            }
            MediaScannerConnection.scanFile(
                activity,
                arrayOf(destFile.absolutePath),
                arrayOf(resolvedMime),
                null
            )
            return destFile.absolutePath to Uri.fromFile(destFile).toString()
        }
    }

    @Suppress("DEPRECATION")
    private fun resolveMediaStorePath(uri: Uri): String? {
        return try {
            activity.contentResolver.query(
                uri,
                arrayOf(MediaStore.Audio.Media.DATA),
                null,
                null,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(MediaStore.Audio.Media.DATA)
                    if (idx >= 0) cursor.getString(idx)?.takeIf { it.isNotBlank() } else null
                } else {
                    null
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun copyFile(src: File, dest: File) {
        dest.parentFile?.let { if (!it.exists()) it.mkdirs() }
        FileInputStream(src).use { input ->
            FileOutputStream(dest).use { output ->
                input.copyTo(output, 32768)
            }
        }
    }

    private fun cleanupEmptyDirs(root: File) {
        root.walkBottomUp().forEach { dir ->
            if (dir.isDirectory && dir.listFiles()?.isEmpty() == true) {
                dir.delete()
            }
        }
    }

    private fun sanitizeSegment(segment: String): String {
        return segment.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
    }

    private fun guessAudioMimeType(fileName: String): String {
        return when (fileName.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
            "mp3" -> "audio/mpeg"
            "flac" -> "audio/flac"
            "m4a", "aac" -> "audio/mp4"
            "ogg" -> "audio/ogg"
            "opus" -> "audio/opus"
            "wav" -> "audio/wav"
            "wma" -> "audio/x-ms-wma"
            "alac" -> "audio/alac"
            else -> "audio/*"
        }
    }
}
