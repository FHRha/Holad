use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use super::player::{AudioOutputDeviceInfo, AudioPlayer, AudioState, PlaybackStatus};

pub struct AudioService {
    player: AudioPlayer,
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
            player: AudioPlayer::new(),
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
                            emit_state(&app, &state);
                            if state.status == PlaybackStatus::Ended {
                                let _ = app.emit("track-ended", state.clone());
                            }
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
pub fn audio_load(
    app: AppHandle,
    service: State<'_, AudioService>,
    url: String,
    autoplay: Option<bool>,
    position: Option<f64>,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let autoplay_val = autoplay.unwrap_or(false);
    let state = service.player.load_source(&url, autoplay_val, position)?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn audio_preload(
    service: State<'_, AudioService>,
    url: String,
) -> Result<AudioState, String> {
    service.player.preload(&url)
}

#[tauri::command]
pub fn audio_queue_gapless(
    app: AppHandle,
    service: State<'_, AudioService>,
    url: String,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let state = service.player.queue_gapless(&url)?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn audio_play(
    app: AppHandle,
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let state = service.player.play()?;
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
pub fn audio_seek(
    app: AppHandle,
    service: State<'_, AudioService>,
    position: f64,
) -> Result<AudioState, String> {
    let state = service.player.seek(position)?;
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
    let state = service.player.set_volume(volume)?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn audio_set_playback_rate(
    app: AppHandle,
    service: State<'_, AudioService>,
    rate: f32,
) -> Result<AudioState, String> {
    let state = service.player.set_playback_rate(rate)?;
    emit_state(&app, &state);
    Ok(state)
}

#[tauri::command]
pub fn audio_set_loop(
    app: AppHandle,
    service: State<'_, AudioService>,
    enabled: bool,
) -> Result<AudioState, String> {
    let state = service.player.set_loop(enabled)?;
    emit_state(&app, &state);
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
    let state = service.player.set_compressor_params(
        enabled,
        threshold_db,
        knee_db,
        ratio,
        attack_secs,
        release_secs,
    )?;
    emit_state(&app, &state);
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
pub fn audio_crossfade(
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
    let state = service
        .player
        .crossfade(&url, dur, curve.as_deref(), tension_x, tension_y)?;
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
pub fn audio_recover_output_sink(
    app: AppHandle,
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    let state = service.player.recover_output_sink()?;
    emit_state(&app, &state);
    Ok(state)
}
