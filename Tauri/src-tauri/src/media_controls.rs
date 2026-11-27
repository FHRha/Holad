use tauri::{AppHandle, Emitter, State, WebviewWindow};

#[cfg(any(target_os = "windows", target_os = "linux"))]
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
};
#[cfg(any(target_os = "windows", target_os = "linux"))]
use std::sync::Mutex;
#[cfg(any(target_os = "windows", target_os = "linux"))]
use std::time::Duration;

#[cfg(any(target_os = "windows", target_os = "linux"))]
#[derive(Clone, PartialEq, Eq)]
struct CachedMediaMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<Duration>,
    cover_url: Option<String>,
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
struct MediaControlsState {
    controls: Option<MediaControls>,
    last_metadata: Option<CachedMediaMetadata>,
}

pub struct DesktopMediaService {
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    state: Mutex<MediaControlsState>,
}

impl Default for DesktopMediaService {
    fn default() -> Self {
        Self::new()
    }
}

impl DesktopMediaService {
    pub fn new() -> Self {
        Self {
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            state: Mutex::new(MediaControlsState {
                controls: None,
                last_metadata: None,
            }),
        }
    }

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    pub fn init(&self, app: &AppHandle, window: &WebviewWindow) {
        #[cfg(target_os = "windows")]
        let hwnd = window.hwnd().ok().map(|h| h.0 as *mut std::ffi::c_void);
        #[cfg(not(target_os = "windows"))]
        let hwnd = None;

        let config = PlatformConfig {
            dbus_name: "holad",
            display_name: "Holad",
            hwnd,
        };

        match MediaControls::new(config) {
            Ok(mut controls) => {
                let app_handle = app.clone();
                let attach_res = controls.attach(move |event| {
                    log::info!("[SMTC] MediaControlEvent received: {:?}", event);
                    let payload = match event {
                        MediaControlEvent::Play => Some(serde_json::json!({ "action": "play" })),
                        MediaControlEvent::Pause => Some(serde_json::json!({ "action": "pause" })),
                        MediaControlEvent::Toggle => Some(serde_json::json!({ "action": "toggle" })),
                        MediaControlEvent::Next => Some(serde_json::json!({ "action": "nexttrack" })),
                        MediaControlEvent::Previous => Some(serde_json::json!({ "action": "previoustrack" })),
                        MediaControlEvent::Stop => Some(serde_json::json!({ "action": "pause" })),
                        MediaControlEvent::SetPosition(MediaPosition(dur)) => {
                            Some(serde_json::json!({ "action": "seekto", "seekTime": dur.as_secs_f64() }))
                        }
                        _ => None,
                    };
                    if let Some(p) = payload {
                        let _ = app_handle.emit("mediaAction", p);
                    }
                });

                if let Err(e) = attach_res {
                    log::error!("[SMTC] Failed to attach media controls listener: {:?}", e);
                } else {
                    log::info!("[SMTC] Successfully initialized and attached MediaControls!");
                }

                if let Ok(mut guard) = self.state.lock() {
                    guard.controls = Some(controls);
                    guard.last_metadata = None;
                } else {
                    log::error!("[SMTC] Failed to lock media controls state during init");
                }
            }
            Err(e) => {
                log::error!("[SMTC] Failed to create MediaControls: {:?}", e);
            }
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    pub fn init(&self, _app: &AppHandle, _window: &WebviewWindow) {}

    pub fn set_metadata(
        &self,
        title: Option<&str>,
        artist: Option<&str>,
        album: Option<&str>,
        duration_secs: Option<f64>,
        cover_url: Option<&str>,
    ) -> Result<(), String> {
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        {
            if let Ok(mut guard) = self.state.lock() {
                let dur = duration_secs.and_then(|d| {
                    if d > 0.0 && d.is_finite() {
                        Some(Duration::from_secs_f64(d))
                    } else {
                        None
                    }
                });

                // Windows SMTC requires cover_url to be an absolute URI with scheme
                let valid_cover = cover_url.filter(|url| {
                    url.starts_with("http://") || url.starts_with("https://") || url.starts_with("file://")
                });

                let next_cached = CachedMediaMetadata {
                    title: title.map(str::to_string),
                    artist: artist.map(str::to_string),
                    album: album.map(str::to_string),
                    duration: dur,
                    cover_url: valid_cover.map(str::to_string),
                };

                if guard.last_metadata.as_ref() == Some(&next_cached) {
                    return Ok(());
                }

                let Some(ref mut controls) = guard.controls else {
                    return Ok(());
                };

                let meta = MediaMetadata {
                    title,
                    artist,
                    album,
                    duration: dur,
                    cover_url: valid_cover,
                };

                let res = controls.set_metadata(meta);
                if res.is_err() && valid_cover.is_some() {
                    log::warn!("[SMTC] set_metadata failed with cover_url ({:?}), retrying without cover", valid_cover);
                    let meta_no_cover = MediaMetadata {
                        title,
                        artist,
                        album,
                        duration: dur,
                        cover_url: None,
                    };
                    controls.set_metadata(meta_no_cover).map_err(|e| format!("{:?}", e))?;
                    let mut fallback_cached = next_cached;
                    fallback_cached.cover_url = None;
                    guard.last_metadata = Some(fallback_cached);
                } else {
                    res.map_err(|e| format!("{:?}", e))?;
                    guard.last_metadata = Some(next_cached);
                }
            } else {
                return Err("Failed to lock media controls state".to_string());
            }
        }
        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            let _ = (title, artist, album, duration_secs, cover_url);
        }
        Ok(())
    }

    pub fn set_playback_state(
        &self,
        is_playing: bool,
        position_secs: Option<f64>,
    ) -> Result<(), String> {
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        {
            if let Ok(mut guard) = self.state.lock() {
                if let Some(ref mut controls) = guard.controls {
                    let progress = position_secs.map(|p| MediaPosition(Duration::from_secs_f64(p.max(0.0))));
                    let playback = if is_playing {
                        MediaPlayback::Playing { progress }
                    } else if position_secs.is_some() {
                        MediaPlayback::Paused { progress }
                    } else {
                        MediaPlayback::Stopped
                    };
                    controls.set_playback(playback).map_err(|e| format!("{:?}", e))?;
                }
            } else {
                return Err("Failed to lock media controls state".to_string());
            }
        }
        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            let _ = (is_playing, position_secs);
        }
        Ok(())
    }
}

#[tauri::command]
pub fn desktop_media_set_metadata(
    service: State<'_, DesktopMediaService>,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
    artwork: Option<String>,
) -> Result<(), String> {
    service.set_metadata(
        title.as_deref(),
        artist.as_deref(),
        album.as_deref(),
        duration,
        artwork.as_deref(),
    )
}

#[tauri::command]
pub fn desktop_media_set_state(
    service: State<'_, DesktopMediaService>,
    is_playing: bool,
    position: Option<f64>,
    playback_rate: Option<f32>,
) -> Result<(), String> {
    let _ = playback_rate;
    service.set_playback_state(is_playing, position)
}
