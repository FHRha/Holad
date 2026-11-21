use tauri::{AppHandle, Emitter, State, WebviewWindow};

#[cfg(any(target_os = "windows", target_os = "linux"))]
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
};
#[cfg(any(target_os = "windows", target_os = "linux"))]
use std::sync::Mutex;
#[cfg(any(target_os = "windows", target_os = "linux"))]
use std::time::Duration;

pub struct DesktopMediaService {
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    controls: Mutex<Option<MediaControls>>,
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
            controls: Mutex::new(None),
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

                *self.controls.lock().unwrap() = Some(controls);
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
            let mut guard = self.controls.lock().unwrap();
            if let Some(ref mut controls) = *guard {
                let dur = duration_secs.and_then(|d| {
                    if d > 0.0 {
                        Some(Duration::from_secs_f64(d))
                    } else {
                        None
                    }
                });
                let meta = MediaMetadata {
                    title,
                    artist,
                    album,
                    duration: dur,
                    cover_url,
                };
                controls.set_metadata(meta).map_err(|e| format!("{:?}", e))?;
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
            let mut guard = self.controls.lock().unwrap();
            if let Some(ref mut controls) = *guard {
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
