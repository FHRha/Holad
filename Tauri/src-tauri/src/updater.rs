use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct UpdateProgressPayload {
    pub stage: String, // "downloading" | "installing" | "error"
    pub percent: f64,
    pub downloaded: u64,
    pub total: u64,
    pub error: Option<String>,
}

fn is_allowed_download_url(u: &str) -> bool {
    if !u.starts_with("https://") {
        return false;
    }
    let rest = &u["https://".len()..];
    // 1. Direct official GitHub release asset download URL for Holad
    if rest.starts_with("github.com/FHRha/Holad/releases/download/") {
        return true;
    }
    // 2. Official GitHub release asset storage CDNs (*.githubusercontent.com)
    if let Some(slash_idx) = rest.find('/') {
        let domain = &rest[..slash_idx];
        if domain == "githubusercontent.com" || domain.ends_with(".githubusercontent.com") {
            return true;
        }
    }
    false
}

fn download_and_install_sync(
    app: AppHandle,
    url: String,
    file_name: String,
    expected_sha256: Option<String>,
    _silent: Option<bool>,
) -> Result<(), String> {
    // 1. URL Source Validation: strictly HTTPS and only official GitHub releases
    if !is_allowed_download_url(&url) {
        let err_msg = "Disallowed update URL: download is only permitted from official GitHub releases over HTTPS".to_string();
        let _ = app.emit("update-download-progress", UpdateProgressPayload {
            stage: "error".into(),
            percent: 0.0,
            downloaded: 0,
            total: 0,
            error: Some(err_msg.clone()),
        });
        return Err(err_msg);
    }

    let temp_dir = std::env::temp_dir().join("Holad").join("updates");
    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        let err_msg = format!("Failed to create updates temp directory: {}", e);
        let _ = app.emit("update-download-progress", UpdateProgressPayload {
            stage: "error".into(),
            percent: 0.0,
            downloaded: 0,
            total: 0,
            error: Some(err_msg.clone()),
        });
        return Err(err_msg);
    }

    // 2. Path Traversal Protection (CWE-22)
    let clean_name = std::path::Path::new(&file_name)
        .file_name()
        .ok_or_else(|| {
            let err = "Invalid file name".to_string();
            let _ = app.emit("update-download-progress", UpdateProgressPayload {
                stage: "error".into(),
                percent: 0.0,
                downloaded: 0,
                total: 0,
                error: Some(err.clone()),
            });
            err
        })?;
    let dest_file = temp_dir.join(clean_name);

    let _ = app.emit("update-download-progress", UpdateProgressPayload {
        stage: "downloading".into(),
        percent: 0.0,
        downloaded: 0,
        total: 0,
        error: None,
    });

    // Make HTTP GET request with ureq (follows redirects automatically)
    let response = match ureq::get(&url)
        .set("User-Agent", "Holad-Desktop-Updater")
        .call()
    {
        Ok(resp) => resp,
        Err(e) => {
            let err_msg = format!("Download request failed: {}", e);
            let _ = app.emit("update-download-progress", UpdateProgressPayload {
                stage: "error".into(),
                percent: 0.0,
                downloaded: 0,
                total: 0,
                error: Some(err_msg.clone()),
            });
            return Err(err_msg);
        }
    };

    // Validate destination after redirects
    let final_url = response.get_url();
    if !is_allowed_download_url(final_url) {
        let err_msg = "Disallowed redirect URL: download is only permitted from official GitHub releases over HTTPS".to_string();
        let _ = app.emit("update-download-progress", UpdateProgressPayload {
            stage: "error".into(),
            percent: 0.0,
            downloaded: 0,
            total: 0,
            error: Some(err_msg.clone()),
        });
        return Err(err_msg);
    }

    let total: u64 = response
        .header("Content-Length")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let mut file = match std::fs::File::create(&dest_file) {
        Ok(f) => f,
        Err(e) => {
            let err_msg = format!("Failed to create destination file: {}", e);
            let _ = app.emit("update-download-progress", UpdateProgressPayload {
                stage: "error".into(),
                percent: 0.0,
                downloaded: 0,
                total,
                error: Some(err_msg.clone()),
            });
            return Err(err_msg);
        }
    };

    let mut reader = response.into_reader();
    let mut buffer = [0u8; 65536]; // 64KB chunk buffer
    let mut downloaded: u64 = 0;
    let mut last_emitted_percent: f64 = -1.0;
    let mut last_emit_time = std::time::Instant::now();
    let mut hasher = Sha256::new();

    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break, // EOF
            Ok(bytes_read) => {
                hasher.update(&buffer[..bytes_read]);
                if let Err(e) = file.write_all(&buffer[..bytes_read]) {
                    let err_msg = format!("Failed to write to file: {}", e);
                    let _ = app.emit("update-download-progress", UpdateProgressPayload {
                        stage: "error".into(),
                        percent: 0.0,
                        downloaded,
                        total,
                        error: Some(err_msg.clone()),
                    });
                    return Err(err_msg);
                }
                downloaded += bytes_read as u64;

                let percent = if total > 0 {
                    ((downloaded as f64 / total as f64) * 100.0).min(100.0)
                } else {
                    0.0
                };

                // Throttle progress events to at most once per 100ms or 1% delta
                let elapsed = last_emit_time.elapsed().as_millis();
                if elapsed >= 100 || (percent - last_emitted_percent).abs() >= 1.0 {
                    last_emitted_percent = percent;
                    last_emit_time = std::time::Instant::now();
                    let _ = app.emit("update-download-progress", UpdateProgressPayload {
                        stage: "downloading".into(),
                        percent,
                        downloaded,
                        total,
                        error: None,
                    });
                }
            }
            Err(e) => {
                let err_msg = format!("Error reading download stream: {}", e);
                let _ = app.emit("update-download-progress", UpdateProgressPayload {
                    stage: "error".into(),
                    percent: 0.0,
                    downloaded,
                    total,
                    error: Some(err_msg.clone()),
                });
                return Err(err_msg);
            }
        }
    }

    if let Err(e) = file.flush() {
        let err_msg = format!("Failed to flush downloaded file: {}", e);
        let _ = app.emit("update-download-progress", UpdateProgressPayload {
            stage: "error".into(),
            percent: 100.0,
            downloaded,
            total,
            error: Some(err_msg.clone()),
        });
        return Err(err_msg);
    }
    drop(file);

    // 3. Cryptographic integrity verification (CWE-494)
    let calculated_hash = format!("{:x}", hasher.finalize());
    let clean_expected = expected_sha256
        .as_deref()
        .map(|h| h.trim().to_lowercase())
        .filter(|h| !h.is_empty());

    let is_valid = match clean_expected {
        Some(ref exp) => exp == &calculated_hash,
        None => {
            // In production release builds, checksum is strictly required
            cfg!(debug_assertions)
        }
    };

    if !is_valid {
        let _ = std::fs::remove_file(&dest_file);
        let err_msg = "Checksum verification failed".to_string();
        let _ = app.emit("update-download-progress", UpdateProgressPayload {
            stage: "error".into(),
            percent: 100.0,
            downloaded,
            total,
            error: Some(err_msg.clone()),
        });
        return Err(err_msg);
    }

    // Download finished, emit installing state
    let _ = app.emit("update-download-progress", UpdateProgressPayload {
        stage: "installing".into(),
        percent: 100.0,
        downloaded,
        total,
        error: None,
    });

    // Launch installer based on target OS
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let is_silent = _silent.unwrap_or(false);
        log::info!("Launching Windows installer: {:?}, silent: {}", dest_file, is_silent);

        let mut cmd = Command::new(&dest_file);
        if is_silent {
            cmd.arg("--silent");
        }
        let status = cmd.spawn();
        match status {
            Ok(_) => {
                // Give OS a moment to start the setup process, then exit Holad so installer can update binaries cleanly
                std::thread::sleep(std::time::Duration::from_millis(600));
                app.exit(0);
                Ok(())
            }
            Err(e) => {
                let err_msg = format!("Failed to launch installer executable: {}", e);
                let _ = app.emit("update-download-progress", UpdateProgressPayload {
                    stage: "error".into(),
                    percent: 100.0,
                    downloaded,
                    total,
                    error: Some(err_msg.clone()),
                });
                Err(err_msg)
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let clean_name_str = clean_name.to_string_lossy();
        if clean_name_str.ends_with(".AppImage") {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = std::fs::metadata(&dest_file) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o755);
                let _ = std::fs::set_permissions(&dest_file, perms);
            }
            log::info!("Launching Linux AppImage: {:?}", dest_file);
            let status = Command::new(&dest_file).spawn();
            match status {
                Ok(_) => {
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    app.exit(0);
                    Ok(())
                }
                Err(e) => {
                    let err_msg = format!("Failed to launch AppImage: {}", e);
                    let _ = app.emit("update-download-progress", UpdateProgressPayload {
                        stage: "error".into(),
                        percent: 100.0,
                        downloaded,
                        total,
                        error: Some(err_msg.clone()),
                    });
                    Err(err_msg)
                }
            }
        } else if clean_name_str.ends_with(".deb") {
            log::info!("Opening Debian package: {:?}", dest_file);
            let _ = Command::new("xdg-open").arg(&dest_file).spawn();
            Ok(())
        } else {
            let err_msg = "Unsupported Linux update format".to_string();
            let _ = app.emit("update-download-progress", UpdateProgressPayload {
                stage: "error".into(),
                percent: 100.0,
                downloaded,
                total,
                error: Some(err_msg.clone()),
            });
            Err(err_msg)
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let err_msg = "Auto-update installer is not supported on this OS".to_string();
        let _ = app.emit("update-download-progress", UpdateProgressPayload {
            stage: "error".into(),
            percent: 100.0,
            downloaded,
            total,
            error: Some(err_msg.clone()),
        });
        Err(err_msg)
    }
}

#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    url: String,
    file_name: String,
    expected_sha256: Option<String>,
    silent: Option<bool>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        download_and_install_sync(app, url, file_name, expected_sha256, silent)
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_allowed_download_url() {
        // Official GitHub Releases URL
        assert!(is_allowed_download_url("https://github.com/FHRha/Holad/releases/download/v2.2.1-test.32/Holad_2.2.1-test.32_x64-setup.exe"));
        
        // Official GitHub CDN redirect URLs
        assert!(is_allowed_download_url("https://release-assets.githubusercontent.com/github-production-release-asset/1300078606/test.exe?param=1"));
        assert!(is_allowed_download_url("https://objects.githubusercontent.com/github-production-release-asset-2e65be/123/file.exe"));
        assert!(is_allowed_download_url("https://github-releases.githubusercontent.com/123/file.exe"));

        // Insecure protocol
        assert!(!is_allowed_download_url("http://github.com/FHRha/Holad/releases/download/v1.0.0/setup.exe"));
        assert!(!is_allowed_download_url("http://release-assets.githubusercontent.com/asset.exe"));

        // Malicious / untrusted domains
        assert!(!is_allowed_download_url("https://malicious-site.com/Holad_setup.exe"));
        assert!(!is_allowed_download_url("https://fakegithubusercontent.com/asset.exe"));
        assert!(!is_allowed_download_url("https://github.com/OtherUser/OtherRepo/releases/download/v1.0.0/setup.exe"));
    }
}
