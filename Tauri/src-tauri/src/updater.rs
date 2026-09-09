use serde::Serialize;
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

fn download_and_install_sync(
    app: AppHandle,
    url: String,
    file_name: String,
) -> Result<(), String> {
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

    let dest_file = temp_dir.join(&file_name);

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

    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break, // EOF
            Ok(bytes_read) => {
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
        log::info!("Launching Windows installer: {:?}", dest_file);

        let status = Command::new(&dest_file).spawn();
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
        if file_name.ends_with(".AppImage") {
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
        } else if file_name.ends_with(".deb") {
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
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        download_and_install_sync(app, url, file_name)
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}
