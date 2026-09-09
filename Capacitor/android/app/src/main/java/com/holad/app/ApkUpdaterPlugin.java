package com.holad.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            boolean canInstall = getContext().getPackageManager().canRequestPackageInstalls();
            ret.put("canInstall", canInstall);
        } else {
            ret.put("canInstall", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open install settings: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath parameter must be provided");
            return;
        }

        try {
            Context context = getContext();
            String cleanPath = filePath;
            if (cleanPath.startsWith("file://")) {
                cleanPath = cleanPath.substring(7);
            }

            File file = new File(cleanPath);
            if (!file.exists()) {
                call.reject("APK file does not exist at: " + cleanPath);
                return;
            }

            launchInstaller(file);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to trigger APK installation: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String urlString = call.getString("url");
        String fileName = call.getString("fileName", "Holad-Update.apk");

        if (urlString == null || urlString.isEmpty()) {
            call.reject("URL parameter must be provided");
            return;
        }

        new Thread(() -> {
            File destFile = null;
            try {
                Context context = getContext();
                File updatesDir = new File(context.getCacheDir(), "updates");
                if (!updatesDir.exists()) {
                    updatesDir.mkdirs();
                }

                destFile = new File(updatesDir, fileName);
                if (destFile.exists()) {
                    destFile.delete();
                }

                emitProgress("downloading", 0.0, 0, 0, null, null);

                HttpURLConnection conn = openConnectionWithRedirects(urlString);
                long totalBytes = conn.getContentLengthLong();
                if (totalBytes <= 0) {
                    String lenHeader = conn.getHeaderField("Content-Length");
                    if (lenHeader != null) {
                        try { totalBytes = Long.parseLong(lenHeader); } catch (Exception ignored) {}
                    }
                }

                InputStream in = conn.getInputStream();
                FileOutputStream out = new FileOutputStream(destFile);

                byte[] buffer = new byte[32768]; // 32KB
                long downloaded = 0;
                long lastEmitTime = System.currentTimeMillis();
                double lastEmitPercent = -1.0;

                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    downloaded += read;

                    double percent = totalBytes > 0 ? ((double) downloaded / totalBytes) * 100.0 : 0.0;
                    if (percent > 100.0) percent = 100.0;

                    long now = System.currentTimeMillis();
                    if (now - lastEmitTime >= 100 || Math.abs(percent - lastEmitPercent) >= 1.0) {
                        lastEmitTime = now;
                        lastEmitPercent = percent;
                        emitProgress("downloading", percent, downloaded, totalBytes, null, null);
                    }
                }

                out.flush();
                out.close();
                in.close();
                conn.disconnect();

                emitProgress("installing", 100.0, downloaded, totalBytes, null, destFile.getAbsolutePath());

                // Check install permission on Android 8.0+
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!context.getPackageManager().canRequestPackageInstalls()) {
                        emitProgress("permission_required", 100.0, downloaded, totalBytes, null, destFile.getAbsolutePath());
                        JSObject ret = new JSObject();
                        ret.put("stage", "permission_required");
                        ret.put("filePath", destFile.getAbsolutePath());
                        call.resolve(ret);
                        return;
                    }
                }

                launchInstaller(destFile);

                JSObject ret = new JSObject();
                ret.put("stage", "installing");
                ret.put("filePath", destFile.getAbsolutePath());
                call.resolve(ret);

            } catch (Exception e) {
                String errorMsg = e.getMessage() != null ? e.getMessage() : "Unknown download error";
                emitProgress("error", 0.0, 0, 0, errorMsg, null);
                call.reject("Download failed: " + errorMsg, e);
            }
        }).start();
    }

    private void launchInstaller(File file) {
        Context context = getContext();
        Uri apkUri = FileProvider.getUriForFile(
            context,
            context.getPackageName() + ".fileprovider",
            file
        );

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private void emitProgress(String stage, double percent, long downloaded, long total, String error, String filePath) {
        JSObject data = new JSObject();
        data.put("stage", stage);
        data.put("percent", percent);
        data.put("downloaded", downloaded);
        data.put("total", total);
        if (error != null) data.put("error", error);
        if (filePath != null) data.put("filePath", filePath);
        notifyListeners("update-download-progress", data);
    }

    private HttpURLConnection openConnectionWithRedirects(String urlString) throws Exception {
        String currentUrl = urlString;
        int redirects = 0;
        while (redirects < 8) {
            URL url = new URL(currentUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", "Holad-Android-Updater");
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.connect();

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM 
                || code == HttpURLConnection.HTTP_MOVED_TEMP 
                || code == HttpURLConnection.HTTP_SEE_OTHER 
                || code == 307 
                || code == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) {
                    throw new Exception("Redirect missing Location header");
                }
                URL base = new URL(currentUrl);
                currentUrl = new URL(base, location).toExternalForm();
                redirects++;
            } else if (code == HttpURLConnection.HTTP_OK) {
                return conn;
            } else {
                conn.disconnect();
                throw new Exception("HTTP error code: " + code);
            }
        }
        throw new Exception("Too many redirects");
    }
}
