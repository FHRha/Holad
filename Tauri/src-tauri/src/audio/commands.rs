use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

use super::player::{AudioPlayer, AudioState, PlaybackStatus};

pub struct AudioService {
    player: AudioPlayer,
    ticker_started: AtomicBool,
}

impl Default for AudioService {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioService {
    pub fn new() -> Self {
        Self {
            player: AudioPlayer::new(),
            ticker_started: AtomicBool::new(false),
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
                        audio_service.player.tick_position(0.2);
                        let state = audio_service.player.get_state();

                        // Detect track / generation transition
                        if state.generation != last_generation {
                            last_generation = state.generation;
                            last_status = state.status;
                            let _ = app.emit("playback-state-changed", state.clone());
                        } else if state.status != last_status {
                            let _ = app.emit("playback-state-changed", state.clone());
                            if state.status == PlaybackStatus::Ended {
                                let _ = app.emit("track-ended", state.clone());
                            }
                            last_status = state.status;
                        }

                        // Emit timeupdate if playing and position advanced noticeably
                        if state.is_playing {
                            if (state.current_time - last_reported_time).abs() >= 0.25 {
                                last_reported_time = state.current_time;
                                let _ = app.emit("timeupdate", state.clone());
                            }
                        }

                        // Emit progress update if buffered percent changed noticeably
                        if (state.buffered_percent - last_reported_buffered).abs() >= 1.0 {
                            last_reported_buffered = state.buffered_percent;
                            let _ = app.emit("playback-state-changed", state.clone());
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
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let autoplay_val = autoplay.unwrap_or(false);
    let state = service.player.load_source(&url, autoplay_val)?;
    let _ = app.emit("playback-state-changed", state.clone());
    Ok(state)
}

#[tauri::command]
pub fn audio_play(
    app: AppHandle,
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let state = service.player.play()?;
    let _ = app.emit("playback-state-changed", state.clone());
    Ok(state)
}

#[tauri::command]
pub fn audio_pause(
    app: AppHandle,
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    let state = service.player.pause()?;
    let _ = app.emit("playback-state-changed", state.clone());
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
    let _ = app.emit("playback-state-changed", state.clone());
    Ok(state)
}

#[tauri::command]
pub fn audio_set_volume(
    app: AppHandle,
    service: State<'_, AudioService>,
    volume: f32,
) -> Result<AudioState, String> {
    let state = service.player.set_volume(volume)?;
    let _ = app.emit("playback-state-changed", state.clone());
    Ok(state)
}

#[tauri::command]
pub fn audio_crossfade(
    app: AppHandle,
    service: State<'_, AudioService>,
    url: String,
    duration_secs: Option<f64>,
    curve: Option<String>,
) -> Result<AudioState, String> {
    service.start_ticker_if_needed(app.clone());
    let dur = duration_secs.unwrap_or(2.0);
    let state = service.player.crossfade(&url, dur, curve.as_deref())?;
    let _ = app.emit("playback-state-changed", state.clone());
    Ok(state)
}

#[tauri::command]
pub fn audio_get_state(
    service: State<'_, AudioService>,
) -> Result<AudioState, String> {
    Ok(service.player.get_state())
}
