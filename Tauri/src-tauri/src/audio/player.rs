use std::fs::File;
use std::io::{BufReader, Cursor, Read};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};
use serde::{Deserialize, Serialize};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackStatus {
    Idle,
    Loading,
    Playing,
    Paused,
    Ended,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioState {
    pub status: PlaybackStatus,
    pub current_time: f64,
    pub duration: f64,
    pub volume: f32,
    pub is_playing: bool,
    pub url: Option<String>,
    pub buffered_percent: f32,
    pub generation: u64,
}

struct PlaybackMetadata {
    url: String,
    duration: f64,
    volume: f32,
    status: PlaybackStatus,
    position_secs: f64,
    buffered_percent: f32,
    generation: u64,
    is_crossfading: bool,
}

pub struct AudioPlayer {
    sink: Mutex<Option<MixerDeviceSink>>,
    player: Mutex<Option<Arc<Player>>>,
    meta: Arc<Mutex<PlaybackMetadata>>,
}

impl AudioPlayer {
    pub fn new() -> Self {
        Self {
            sink: Mutex::new(None),
            player: Mutex::new(None),
            meta: Arc::new(Mutex::new(PlaybackMetadata {
                url: String::new(),
                duration: 0.0,
                volume: 1.0,
                status: PlaybackStatus::Idle,
                position_secs: 0.0,
                buffered_percent: 0.0,
                generation: 0,
                is_crossfading: false,
            })),
        }
    }

    fn ensure_device_sink(&self) -> Result<(), String> {
        let mut sink_guard = self.sink.lock().unwrap();
        if sink_guard.is_some() {
            return Ok(());
        }

        match DeviceSinkBuilder::open_default_sink() {
            Ok(mut s) => {
                s.log_on_drop(false);
                *sink_guard = Some(s);
                Ok(())
            }
            Err(e) => Err(format!("No audio output device available: {:?}", e)),
        }
    }

    pub fn load_source(
        &self,
        path_or_url: &str,
        autoplay: bool,
        position_secs: Option<f64>,
    ) -> Result<AudioState, String> {
        self.ensure_device_sink()?;

        // Stop existing player
        {
            let mut player_guard = self.player.lock().unwrap();
            if let Some(old_player) = player_guard.take() {
                old_player.stop();
            }
        }

        let initial_pos = position_secs.unwrap_or(0.0).max(0.0);

        let current_gen = {
            let mut meta = self.meta.lock().unwrap();
            meta.generation = meta.generation.wrapping_add(1);
            meta.is_crossfading = false;
            meta.url = path_or_url.to_string();
            meta.status = PlaybackStatus::Loading;
            meta.buffered_percent = 0.0;
            meta.position_secs = initial_pos;
            meta.generation
        };

        // Fetch or read audio data
        let (bytes, duration_secs) = self.read_media(path_or_url)?;

        let current_volume = {
            let meta = self.meta.lock().unwrap();
            meta.volume
        };

        let new_player = {
            let sink_guard = self.sink.lock().unwrap();
            let mixer_sink = sink_guard.as_ref().ok_or("Audio sink not initialized")?;
            Player::connect_new(mixer_sink.mixer())
        };

        if !autoplay {
            new_player.pause();
        }

        new_player.set_volume(current_volume);

        // Decode audio stream
        let cursor = Cursor::new(bytes);
        let source = Decoder::try_from(BufReader::new(cursor))
            .map_err(|e| format!("Failed to decode audio: {:?}", e))?;

        if initial_pos > 0.0 {
            let seek_dur = Duration::from_secs_f64(initial_pos);
            let skipped_source = source.skip_duration(seek_dur);
            new_player.append(skipped_source);
        } else {
            new_player.append(source);
        }

        let status = if autoplay {
            PlaybackStatus::Playing
        } else {
            PlaybackStatus::Paused
        };

        {
            let mut player_guard = self.player.lock().unwrap();
            *player_guard = Some(Arc::new(new_player));
        }

        {
            let mut meta = self.meta.lock().unwrap();
            if meta.generation == current_gen {
                meta.url = path_or_url.to_string();
                meta.duration = duration_secs;
                meta.status = status;
                meta.position_secs = initial_pos;
                meta.buffered_percent = 100.0;
            }
        }

        Ok(self.get_state())
    }

    pub fn crossfade(
        &self,
        path_or_url: &str,
        duration_secs: f64,
        curve: Option<&str>,
    ) -> Result<AudioState, String> {
        self.ensure_device_sink()?;

        let was_playing = {
            let player_guard = self.player.lock().unwrap();
            player_guard
                .as_ref()
                .map(|p| !p.is_paused() && !p.empty())
                .unwrap_or(false)
        };

        // If not currently playing or duration is negligible, fallback to normal load
        if !was_playing || duration_secs <= 0.05 {
            return self.load_source(path_or_url, true, None);
        }

        let current_gen = {
            let mut meta = self.meta.lock().unwrap();
            meta.generation = meta.generation.wrapping_add(1);
            meta.is_crossfading = true;
            meta.buffered_percent = 0.0;
            meta.generation
        };

        let (bytes, duration_secs_total) = self.read_media(path_or_url)?;

        let current_volume = {
            let meta = self.meta.lock().unwrap();
            meta.volume
        };

        let new_player = {
            let sink_guard = self.sink.lock().unwrap();
            let mixer_sink = sink_guard.as_ref().ok_or("Audio sink not initialized")?;
            Player::connect_new(mixer_sink.mixer())
        };

        // Start new player muted and begin playback
        new_player.set_volume(0.0);

        let cursor = Cursor::new(bytes);
        let source = Decoder::try_from(BufReader::new(cursor))
            .map_err(|e| format!("Failed to decode audio for crossfade: {:?}", e))?;

        new_player.append(source);
        new_player.play();

        let new_player_arc = Arc::new(new_player);

        // Swap out the active player and take old player for gradual fade-out
        let old_player_opt = {
            let mut player_guard = self.player.lock().unwrap();
            let old = player_guard.take();
            *player_guard = Some(Arc::clone(&new_player_arc));
            old
        };

        {
            let mut meta = self.meta.lock().unwrap();
            meta.url = path_or_url.to_string();
            meta.duration = duration_secs_total;
            meta.status = PlaybackStatus::Playing;
            meta.position_secs = 0.0;
            meta.buffered_percent = 100.0;
        }

        let fade_new = Arc::clone(&new_player_arc);
        let crossfade_dur = duration_secs.max(0.1);
        let target_vol = current_volume;
        let curve_type = curve.unwrap_or("equalPower").to_string();
        let meta_arc = Arc::clone(&self.meta);

        std::thread::Builder::new()
            .name("holad-audio-crossfade".to_string())
            .spawn(move || {
                let steps = (crossfade_dur * 50.0).round().max(10.0) as usize; // 50 updates per sec (20ms interval)
                let step_dur = Duration::from_secs_f64(crossfade_dur / steps as f64);
                let exp_p = -0.35f32.log2(); // ~1.5146 for exponential dip (yc = 0.35)

                for i in 1..=steps {
                    std::thread::sleep(step_dur);
                    let progress = i as f32 / steps as f32; // 0.0 -> 1.0

                    let (in_gain, out_gain) = match curve_type.as_str() {
                        "linear" => (progress * target_vol, (1.0 - progress) * target_vol),
                        "exponential" => (
                            progress.powf(exp_p) * target_vol,
                            (1.0 - progress).powf(exp_p) * target_vol,
                        ),
                        _ => {
                            // "equalPower" default: constant acoustic energy (sine / cosine)
                            (
                                (progress * std::f32::consts::FRAC_PI_2).sin() * target_vol,
                                ((1.0 - progress) * std::f32::consts::FRAC_PI_2).sin() * target_vol,
                            )
                        }
                    };

                    fade_new.set_volume(in_gain);
                    if let Some(ref old) = old_player_opt {
                        old.set_volume(out_gain);
                    }
                }

                fade_new.set_volume(target_vol);
                if let Some(ref old) = old_player_opt {
                    old.stop();
                }

                if let Ok(mut meta) = meta_arc.lock() {
                    if meta.generation == current_gen {
                        meta.is_crossfading = false;
                    }
                }
            })
            .expect("Failed to spawn crossfade thread");

        Ok(self.get_state())
    }

    pub fn play(&self) -> Result<AudioState, String> {
        let player_guard = self.player.lock().unwrap();
        if let Some(ref player) = *player_guard {
            player.play();
            let mut meta = self.meta.lock().unwrap();
            meta.status = PlaybackStatus::Playing;
            drop(meta);
            drop(player_guard);
            Ok(self.get_state())
        } else {
            Err("No audio loaded".to_string())
        }
    }

    pub fn pause(&self) -> Result<AudioState, String> {
        let player_guard = self.player.lock().unwrap();
        if let Some(ref player) = *player_guard {
            player.pause();
            let mut meta = self.meta.lock().unwrap();
            meta.status = PlaybackStatus::Paused;
            drop(meta);
            drop(player_guard);
            Ok(self.get_state())
        } else {
            Err("No audio loaded".to_string())
        }
    }

    pub fn seek(&self, position_secs: f64) -> Result<AudioState, String> {
        let player_guard = self.player.lock().unwrap();
        let mut meta = self.meta.lock().unwrap();

        let url = meta.url.clone();
        if url.is_empty() {
            return Err("No audio loaded to seek".to_string());
        }

        let pos = position_secs.max(0.0);
        let seek_duration = Duration::from_secs_f64(pos);

        if let Some(ref player) = *player_guard {
            match player.try_seek(seek_duration) {
                Ok(_) => {
                    meta.position_secs = pos;
                    drop(meta);
                    drop(player_guard);
                    return Ok(self.get_state());
                }
                Err(e) => {
                    log::debug!("player.try_seek failed: {:?}, falling back to reload & skip", e);
                }
            }
        }

        // Fallback: recreate player from source and skip to target duration
        drop(meta);
        drop(player_guard);

        self.seek_by_reload(&url, pos)?;
        Ok(self.get_state())
    }

    fn seek_by_reload(&self, url: &str, pos: f64) -> Result<(), String> {
        self.ensure_device_sink()?;
        let (bytes, duration_secs) = self.read_media(url)?;

        let (current_volume, was_playing) = {
            let meta = self.meta.lock().unwrap();
            (meta.volume, meta.status == PlaybackStatus::Playing)
        };

        let new_player = {
            let sink_guard = self.sink.lock().unwrap();
            let mixer_sink = sink_guard.as_ref().ok_or("Audio sink not initialized")?;
            Player::connect_new(mixer_sink.mixer())
        };

        new_player.set_volume(current_volume);
        let cursor = Cursor::new(bytes);
        let source = Decoder::try_from(BufReader::new(cursor))
            .map_err(|e| format!("Failed to decode audio on seek: {:?}", e))?;

        let seek_dur = Duration::from_secs_f64(pos);
        let skipped_source = source.skip_duration(seek_dur);
        new_player.append(skipped_source);

        if !was_playing {
            new_player.pause();
        }

        {
            let mut player_guard = self.player.lock().unwrap();
            if let Some(old) = player_guard.take() {
                old.stop();
            }
            *player_guard = Some(Arc::new(new_player));
        }

        {
            let mut meta = self.meta.lock().unwrap();
            meta.position_secs = pos;
            meta.duration = duration_secs;
            meta.buffered_percent = 100.0;
            if was_playing {
                meta.status = PlaybackStatus::Playing;
            } else {
                meta.status = PlaybackStatus::Paused;
            }
        }

        Ok(())
    }

    pub fn set_volume(&self, volume: f32) -> Result<AudioState, String> {
        let clamped = volume.clamp(0.0, 3.0);
        let player_guard = self.player.lock().unwrap();
        if let Some(ref player) = *player_guard {
            player.set_volume(clamped);
        }
        let mut meta = self.meta.lock().unwrap();
        meta.volume = clamped;
        drop(meta);
        drop(player_guard);
        Ok(self.get_state())
    }

    pub fn get_state(&self) -> AudioState {
        let player_guard = self.player.lock().unwrap();
        let meta = self.meta.lock().unwrap();

        let current_time = if let Some(ref player) = *player_guard {
            if player.empty() && meta.duration > 0.0 {
                meta.duration
            } else {
                let pos = player.get_pos();
                let p = pos.as_secs_f64();
                if p > 0.0 {
                    p
                } else {
                    meta.position_secs
                }
            }
        } else {
            meta.position_secs
        };

        let is_playing = if let Some(ref player) = *player_guard {
            !player.is_paused() && !player.empty()
        } else {
            false
        };

        let status = if let Some(ref player) = *player_guard {
            if player.empty() && !meta.url.is_empty() && !meta.is_crossfading {
                PlaybackStatus::Ended
            } else if player.is_paused() {
                PlaybackStatus::Paused
            } else {
                PlaybackStatus::Playing
            }
        } else {
            meta.status
        };

        AudioState {
            status,
            current_time,
            duration: meta.duration,
            volume: meta.volume,
            is_playing,
            url: if meta.url.is_empty() { None } else { Some(meta.url.clone()) },
            buffered_percent: meta.buffered_percent,
            generation: meta.generation,
        }
    }

    pub fn tick_position(&self, delta_secs: f64) {
        let player_guard = self.player.lock().unwrap();
        if let Some(ref player) = *player_guard {
            if !player.is_paused() && !player.empty() {
                let mut meta = self.meta.lock().unwrap();
                let pos = player.get_pos().as_secs_f64();
                if pos > 0.0 {
                    meta.position_secs = pos;
                } else {
                    meta.position_secs += delta_secs;
                }
            }
        }
    }

    fn read_media(&self, path_or_url: &str) -> Result<(Vec<u8>, f64), String> {
        let bytes = if path_or_url.starts_with("http://") || path_or_url.starts_with("https://") {
            let resp = ureq::get(path_or_url)
                .timeout(Duration::from_secs(30))
                .call()
                .map_err(|e| format!("HTTP request error for {}: {:?}", path_or_url, e))?;

            let total_len: Option<u64> = resp
                .header("content-length")
                .and_then(|v| v.trim().parse::<u64>().ok());

            let mut reader = resp.into_reader();
            let mut data = match total_len {
                Some(len) if len > 0 && len < 200 * 1024 * 1024 => Vec::with_capacity(len as usize),
                _ => Vec::new(),
            };

            let mut chunk = [0u8; 64 * 1024];
            let mut downloaded: u64 = 0;
            let mut last_pct: f32 = 0.0;

            loop {
                let n = reader
                    .read(&mut chunk)
                    .map_err(|e| format!("Failed to read HTTP audio stream: {:?}", e))?;
                if n == 0 {
                    break;
                }
                data.extend_from_slice(&chunk[..n]);
                downloaded += n as u64;

                if let Some(total) = total_len {
                    if total > 0 {
                        let pct = ((downloaded as f32 / total as f32) * 100.0).clamp(0.0, 100.0);
                        if (pct - last_pct) >= 1.0 || pct >= 100.0 {
                            last_pct = pct;
                            let mut meta = self.meta.lock().unwrap();
                            meta.buffered_percent = pct;
                        }
                    }
                }
            }

            {
                let mut meta = self.meta.lock().unwrap();
                meta.buffered_percent = 100.0;
            }

            data
        } else {
            // Local file or asset path
            let clean_path = path_or_url.strip_prefix("file://").unwrap_or(path_or_url);
            #[cfg(target_os = "windows")]
            let clean_path = if clean_path.starts_with('/') && clean_path.len() > 2 && clean_path.as_bytes()[2] == b':' {
                &clean_path[1..]
            } else {
                clean_path
            };

            let mut file = File::open(Path::new(clean_path))
                .map_err(|e| format!("Failed to open file {}: {:?}", clean_path, e))?;
            let mut data = Vec::new();
            file.read_to_end(&mut data)
                .map_err(|e| format!("Failed to read file {}: {:?}", clean_path, e))?;

            {
                let mut meta = self.meta.lock().unwrap();
                meta.buffered_percent = 100.0;
            }

            data
        };

        // Probe duration using Symphonia
        let duration = Self::probe_duration(&bytes).unwrap_or(0.0);
        Ok((bytes, duration))
    }

    fn probe_duration(bytes: &[u8]) -> Option<f64> {
        let cursor = Cursor::new(bytes.to_vec());
        let mss = MediaSourceStream::new(Box::new(cursor), Default::default());
        let hint = Hint::new();
        let format_opts = FormatOptions::default();
        let metadata_opts = MetadataOptions::default();

        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &format_opts, &metadata_opts)
            .ok()?;

        let track = probed.format.default_track()?;
        let time_base = track.codec_params.time_base?;
        let n_frames = track.codec_params.n_frames?;
        let dur = time_base.calc_time(n_frames);
        Some(dur.seconds as f64 + dur.frac)
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_state_defaults() {
        let player = AudioPlayer::new();
        let state = player.get_state();
        assert_eq!(state.status, PlaybackStatus::Idle);
        assert!(!state.is_playing);
        assert_eq!(state.current_time, 0.0);
        assert_eq!(state.volume, 1.0);
        assert_eq!(state.buffered_percent, 0.0);
        assert_eq!(state.generation, 0);
    }

    #[test]
    fn test_audio_buffered_percent() {
        let player = AudioPlayer::new();
        assert_eq!(player.get_state().buffered_percent, 0.0);
        {
            let mut meta = player.meta.lock().unwrap();
            meta.buffered_percent = 75.5;
        }
        assert_eq!(player.get_state().buffered_percent, 75.5);
    }

    #[test]
    fn test_audio_set_volume() {
        let player = AudioPlayer::new();
        let res = player.set_volume(0.65).unwrap();
        assert!((res.volume - 0.65).abs() < 0.001);

        let boosted = player.set_volume(2.5).unwrap();
        assert!((boosted.volume - 2.5).abs() < 0.001);

        let clamped = player.set_volume(4.5).unwrap();
        assert_eq!(clamped.volume, 3.0);

        let clamped_low = player.set_volume(-0.5).unwrap();
        assert_eq!(clamped_low.volume, 0.0);
    }

    #[test]
    fn test_audio_seek_when_empty() {
        let player = AudioPlayer::new();
        let res = player.seek(10.0);
        assert!(res.is_err());
    }

    #[test]
    fn test_audio_crossfade_invalid_url() {
        let player = AudioPlayer::new();
        let res = player.crossfade("invalid://non-existent-url-12345", 2.0, None);
        assert!(res.is_err());
    }

    #[test]
    fn test_audio_crossfade_curves_option() {
        let player = AudioPlayer::new();
        let res_linear = player.crossfade("invalid://non-existent-url-12345", 2.0, Some("linear"));
        assert!(res_linear.is_err());
        let res_exp = player.crossfade("invalid://non-existent-url-12345", 2.0, Some("exponential"));
        assert!(res_exp.is_err());
        let res_eq = player.crossfade("invalid://non-existent-url-12345", 2.0, Some("equalPower"));
        assert!(res_eq.is_err());
    }
}
