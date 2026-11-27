use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use super::player::{AudioOutputDeviceInfo, AudioPlayer, AudioState, PlaybackStatus};

pub struct AudioService {
    player: Arc<AudioPlayer>,
    ticker_started: AtomicBool,
}

impl Default for AudioService {
    fn default() -> Self {
        Self::new()
    }
}

fn emit_state(app: &AppHandle, state: &AudioState) {
    let _ = app.emit("playback-state-changed", state.clone());
}

impl AudioService {
    pub fn new() -> Self {
        Self {
            player: Arc::new(AudioPlayer::new()),
            ticker_started: AtomicBool::new(false),
        }
    }

    pub fn set_cache_dir(&self, dir: std::path::PathBuf) {
        self.player.set_cache_dir(dir);
    }

    pub fn on_default_device_changed(&self) {
        if self.player.is_using_default_device() && self.player.has_active_sink() {
            if let Err(e) = self.player.recover_output_sink() {
                log::warn!(
                    "[AudioService] Failed to recover output sink on default device change: {}",
                    e
                );
            }
        }
    }

    pub fn start_ticker_if_needed(&self, app: AppHandle) {
        if self.ticker_started.swap(true, Ordering::SeqCst) {
            return;
        }

        std::thread::Builder::new()
            .name("holad-audio-ticker".to_string())
            .spawn(move || {
                let mut last_status = PlaybackStatus::Idle;
                let mut last_generation: u64 = 0;
                let mut last_reported_time: f64 = -1.0;
                let mut last_reported_buffered: f32 = -1.0;

                loop {
                    std::thread::sleep(Duration::from_millis(200));

                    if let Some(audio_service) = app.try_state::<AudioService>() {
                        let transitioned = audio_service.player.tick_position(0.2);
                        let state = audio_service.player.get_state();

                        if transitioned {
                            last_generation = state.generation;
                            last_status = state.status;
                            last_reported_time = state.current_time;
                            let _ = app.emit("track-transitioned", state.clone());
                            emit_state(&app, &state);
                        } else if state.generation != last_generation {
                            last_generation = state.generation;
                            last_status = state.status;
                            emit_state(&app, &state);
                        } else if state.status != last_status {
                            if state.status == PlaybackStatus::Ended {
                                let _ = app.emit("track-ended", state.clone());
                            }
                            emit_state(&app, &state);
                            last_status = state.status;
                        }

                        // Emit timeupdate if playing and position advanced noticeably
                        if state.is_playing
                            && (state.current_time - last_reported_time).abs() >= 0.25
                        {
                            last_reported_time = state.current_time;
                            let _ = app.emit("timeupdate", state.clone());
                        }

                        // Emit progress update if buffered percent changed noticeably
                        if (state.buffered_percent - last_reported_buffered).abs() >= 1.0 {
                            last_reported_buffered = state.buffered_percent;
                            emit_state(&app, &state);
                        }
                    }
                }
            })
            .expect("Failed to spawn audio ticker thread");
    }
}

#[tauri::command]
pub async fn audio_load(
    app: AppHandle,
    service: State<'_, AudioService>,
    url: String,
    autoplay: Option<bool>,
    position: Option<f64>,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let autoplay_val = autoplay.unwrap_or(false);
    let player = Arc::clone(&service.player);
    let state = tauri::async_runtime::spawn_blocking(move || {
        player.load_source(&url, autoplay_val, position)
    })
    .await
    .map_err(|e| format!("Audio load task failed: {}", e))??;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub async fn audio_preload(
    service: State<'_, AudioService>,
    url: String,
) -> Result<AudioState, String> {
    let player = Arc::clone(&service.player);
    tauri::async_runtime::spawn_blocking(move || player.preload(&url))
        .await
        .map_err(|e| format!("Audio preload task failed: {}", e))?
}

#[tauri::command]
pub async fn audio_queue_gapless(
    app: AppHandle,
    service: State<'_, AudioService>,
    url: String,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let player = Arc::clone(&service.player);
    let state = tauri::async_runtime::spawn_blocking(move || player.queue_gapless(&url))
        .await
        .map_err(|e| format!("Audio queue_gapless task failed: {}", e))??;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub async fn audio_play(
    app: AppHandle,
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let player = Arc::clone(&service.player);
    let state = tauri::async_runtime::spawn_blocking(move || player.play())
        .await
        .map_err(|e| format!("Audio play task failed: {}", e))??;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn audio_pause(
    app: AppHandle,
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    let state = service.player.pause()?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn audio_stop(
    app: AppHandle,
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    let state = service.player.stop()?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub async fn audio_seek(
    app: AppHandle,
    service: State<'_, AudioService>,
    position: f64,
) -> Result<AudioState, String> {
    let player = Arc::clone(&service.player);
    let state = tauri::async_runtime::spawn_blocking(move || player.seek(position))
        .await
        .map_err(|e| format!("Audio seek task failed: {}", e))??;
    let _ = app.emit("timeupdate", state.clone());
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn audio_set_volume(
    app: AppHandle,
    service: State<'_, AudioService>,
    volume: f32,
) -> Result<AudioState, String> {
    let prev_status = service.player.get_state().status;
    let state = service.player.set_volume(volume)?;
    if state.status != prev_status {
        emit_state(&app, &state);
    }
    Ok(state)
}

#[tauri::command]
pub fn audio_set_playback_rate(
    app: AppHandle,
    service: State<'_, AudioService>,
    rate: f32,
) -> Result<AudioState, String> {
    let prev_status = service.player.get_state().status;
    let state = service.player.set_playback_rate(rate)?;
    if state.status != prev_status {
        emit_state(&app, &state);
    }
    Ok(state)
}

#[tauri::command]
pub fn audio_set_loop(
    app: AppHandle,
    service: State<'_, AudioService>,
    enabled: bool,
) -> Result<AudioState, String> {
    let prev_status = service.player.get_state().status;
    let state = service.player.set_loop(enabled)?;
    if state.status != prev_status {
        emit_state(&app, &state);
    }
    Ok(state)
}

#[tauri::command]
pub fn audio_set_compressor(
    app: AppHandle,
    service: State<'_, AudioService>,
    enabled: Option<bool>,
    threshold_db: Option<f32>,
    knee_db: Option<f32>,
    ratio: Option<f32>,
    attack_secs: Option<f32>,
    release_secs: Option<f32>,
) -> Result<AudioState, String> {
    let prev_status = service.player.get_state().status;
    let state = service.player.set_compressor_params(
        enabled,
        threshold_db,
        knee_db,
        ratio,
        attack_secs,
        release_secs,
    )?;
    if state.status != prev_status {
        emit_state(&app, &state);
    }
    Ok(state)
}

#[tauri::command]
pub fn audio_start_visualizer(
    service: State<'_, AudioService>,
    channel: Channel<Vec<u8>>,
) -> Result<(), String> {
    service.player.start_visualizer(channel);
    Ok(())
}

#[tauri::command]
pub fn audio_stop_visualizer(service: State<'_, AudioService>) -> Result<(), String> {
    service.player.stop_visualizer();
    Ok(())
}

#[tauri::command]
pub async fn audio_crossfade(
    app: AppHandle,
    service: State<'_, AudioService>,
    url: String,
    duration_secs: Option<f64>,
    curve: Option<String>,
    tension_x: Option<f32>,
    tension_y: Option<f32>,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let dur = duration_secs.unwrap_or(2.0);
    let player = Arc::clone(&service.player);
    let state = tauri::async_runtime::spawn_blocking(move || {
        player.crossfade(&url, dur, curve.as_deref(), tension_x, tension_y)
    })
    .await
    .map_err(|e| format!("Audio crossfade task failed: {}", e))??;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn audio_get_state(service: State<'_, AudioService>) -> Result<AudioState, String> {
    Ok(service.player.get_state())
}

#[tauri::command]
pub fn audio_list_output_devices(
    service: State<'_, AudioService>,
) -> Result<Vec<AudioOutputDeviceInfo>, String> {
    service.player.list_output_devices()
}

#[tauri::command]
pub fn audio_set_output_device(
    app: AppHandle,
    service: State<'_, AudioService>,
    device_id: Option<String>,
) -> Result<AudioState, String> {
    let state = service.player.set_output_device(device_id)?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub async fn audio_recover_output_sink(
    app: AppHandle,
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    let player = Arc::clone(&service.player);
    let state = tauri::async_runtime::spawn_blocking(move || player.recover_output_sink())
        .await
        .map_err(|e| format!("Audio sink recovery task failed: {}", e))??;
    emit_state(&app, &state);
    Ok(state)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressPayload {
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn allowed_download_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut allowed = Vec::new();
    if let Ok(d) = app.path().app_data_dir() {
        allowed.push(d);
    }
    if let Ok(d) = app.path().app_cache_dir() {
        allowed.push(d);
    }
    if let Ok(d) = app.path().download_dir() {
        allowed.push(d.join("Holad"));
    }
    let music_dir = PathBuf::from(crate::resolve_music_download_dir(app));
    if !music_dir.as_os_str().is_empty() {
        allowed.push(music_dir);
    }
    allowed
}

/// Streams an HTTP/HTTPS file in 64 KB chunks directly to `dest_path`, emitting
/// throttled progress updates over the Tauri IPC `Channel`.
#[tauri::command]
pub fn download_file_to_path(
    app: AppHandle,
    url: String,
    dest_path: String,
    channel: Channel<DownloadProgressPayload>,
) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http:// and https:// URLs are supported".to_string());
    }

    let trimmed_dest = dest_path.trim();
    if trimmed_dest.is_empty() {
        return Err("Destination path cannot be empty".to_string());
    }

    let dest = PathBuf::from(trimmed_dest);
    let normalized_dest = crate::normalize_path_for_check(&dest)?;
    if crate::is_os_system_path(&normalized_dest) {
        return Err("Access to system directory is restricted".to_string());
    }

    let allowed = allowed_download_dirs(&app);
    if !crate::is_path_within_any(&normalized_dest, &allowed) {
        return Err("Destination path is outside allowed Holad directories".to_string());
    }

    let parent = normalized_dest
        .parent()
        .ok_or_else(|| "Destination path must have a parent directory".to_string())?;
    if !parent.exists() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }

    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Failed to resolve parent dir: {}", e))?;
    if !crate::is_path_within_any(&canonical_parent, &allowed) {
        return Err("Resolved parent directory is outside allowed Holad directories".to_string());
    }

    let file_name = normalized_dest
        .file_name()
        .ok_or_else(|| "Destination path must include a file name".to_string())?;
    let safe_dest = canonical_parent.join(file_name);

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(30))
        .build();
    let resp = agent
        .get(&url)
        .call()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let total: Option<u64> = resp
        .header("content-length")
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|&len| len > 0);

    let file = File::create(&safe_dest).map_err(|e| format!("Failed to create file: {}", e))?;
    let mut writer = BufWriter::new(file);
    let mut reader = resp.into_reader();
    let mut chunk = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let mut last_emit_bytes: u64 = 0;

    loop {
        let n = reader
            .read(&mut chunk)
            .map_err(|e| format!("Failed to read response stream: {}", e))?;
        if n == 0 {
            writer
                .flush()
                .map_err(|e| format!("Failed to flush file: {}", e))?;
            let _ = channel.send(DownloadProgressPayload { downloaded, total });
            break;
        }

        writer
            .write_all(&chunk[..n])
            .map_err(|e| format!("Failed to write file: {}", e))?;
        downloaded = downloaded.saturating_add(n as u64);

        if last_emit.elapsed() >= Duration::from_millis(250)
            || downloaded.saturating_sub(last_emit_bytes) >= 256 * 1024
        {
            let _ = channel.send(DownloadProgressPayload { downloaded, total });
            last_emit = Instant::now();
            last_emit_bytes = downloaded;
        }
    }

    Ok(())
}
