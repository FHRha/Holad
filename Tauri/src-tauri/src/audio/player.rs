use std::collections::VecDeque;
use std::f32::consts::FRAC_PI_2;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::source::SeekError;
use rodio::{ChannelCount, Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, SampleRate, Source};
use serde::{Deserialize, Serialize};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tauri::ipc::Channel;

use super::dsp::{CompressorParams, CompressorSource};
use super::stream::{MediaInput, StreamCache};
use super::visualizer::{VisualizerEngine, VisualizerTapSource};

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
    pub playback_rate: f32,
    pub loop_enabled: bool,
    pub compressor_enabled: bool,
    pub output_device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub(crate) struct PlaybackMetadata {
    pub(crate) url: String,
    pub(crate) duration: f64,
    pub(crate) volume: f32,
    pub(crate) playback_rate: f32,
    pub(crate) loop_enabled: bool,
    pub(crate) status: PlaybackStatus,
    pub(crate) position_secs: f64,
    pub(crate) start_offset_secs: f64,
    pub(crate) track_base_pos_secs: f64,
    pub(crate) buffered_percent: f32,
    pub(crate) generation: u64,
    pub(crate) is_crossfading: bool,
}

struct ActiveTrackSource {
    url: String,
    input: MediaInput,
    duration: f64,
    cancel: Arc<AtomicBool>,
}

struct QueuedTrack {
    url: String,
    duration: f64,
    started: Arc<AtomicBool>,
    generation: u64,
    input: MediaInput,
    cancel: Arc<AtomicBool>,
}

/// Source wrapper that sets an atomic flag on the very first sample pulled by `rodio::Player`,
/// enabling exact 0ms gapless track transition detection.
pub struct TrackBoundarySource<S>
where
    S: Source<Item = f32>,
{
    inner: S,
    started: Arc<AtomicBool>,
    notified: bool,
}

impl<S> TrackBoundarySource<S>
where
    S: Source<Item = f32>,
{
    pub fn new(inner: S, started: Arc<AtomicBool>) -> Self {
        Self {
            inner,
            started,
            notified: false,
        }
    }
}

impl<S> Iterator for TrackBoundarySource<S>
where
    S: Source<Item = f32>,
{
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        if !self.notified {
            self.notified = true;
            self.started.store(true, Ordering::Release);
        }
        self.inner.next()
    }
}

impl<S> Source for TrackBoundarySource<S>
where
    S: Source<Item = f32>,
{
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }

    fn channels(&self) -> ChannelCount {
        self.inner.channels()
    }

    fn sample_rate(&self) -> SampleRate {
        self.inner.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.inner.try_seek(pos)
    }
}

/// Calculates outgoing and incoming deck gain values for a normalized time `t` in `[0.0, 1.0]`.
/// Matches `client/src/audio/crossfade.ts` (`calculateCrossfadeGains`).
pub fn calculate_crossfade_gains(
    t: f32,
    curve: &str,
    tension_x: Option<f32>,
    tension_y: Option<f32>,
) -> (f32, f32) {
    let clamped_t = t.clamp(0.0, 1.0);

    if curve == "linear" {
        return (1.0 - clamped_t, clamped_t);
    }

    let default_y = match curve {
        "exponential" => 0.35,
        _ => 0.707,
    };

    let xc = tension_x.unwrap_or(0.5).clamp(0.25, 0.75);
    let yc = tension_y.unwrap_or(default_y).clamp(0.05, 0.95);

    if curve == "equalPower" && (xc - 0.5).abs() < 0.005 && (yc - 0.707).abs() < 0.005 {
        return (
            (clamped_t * FRAC_PI_2).cos(),
            ((1.0 - clamped_t) * FRAC_PI_2).cos(),
        );
    }

    let denom = clamped_t * (1.0 - xc) + (1.0 - clamped_t) * xc;
    let tau = if denom > 0.0 {
        (clamped_t * (1.0 - xc)) / denom
    } else {
        clamped_t
    };

    let p = -yc.log2();
    let in_gain = tau.powf(p).clamp(0.0, 1.0);
    let out_gain = (1.0 - tau).powf(p).clamp(0.0, 1.0);

    (out_gain, in_gain)
}

pub struct AudioPlayer {
    sink: Mutex<Option<MixerDeviceSink>>,
    player: Mutex<Option<Arc<Player>>>,
    pub(crate) meta: Arc<Mutex<PlaybackMetadata>>,
    active_source: Mutex<Option<ActiveTrackSource>>,
    stream_cache: Mutex<StreamCache>,
    queued_tracks: Mutex<VecDeque<QueuedTrack>>,
    selected_device_id: Mutex<Option<String>>,
    compressor_params: Arc<CompressorParams>,
    visualizer: VisualizerEngine,
}

impl Default for AudioPlayer {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioPlayer {
    pub fn new() -> Self {
        Self::with_cache_dir(None)
    }

    pub fn with_cache_dir(cache_dir: Option<PathBuf>) -> Self {
        Self {
            sink: Mutex::new(None),
            player: Mutex::new(None),
            meta: Arc::new(Mutex::new(PlaybackMetadata {
                url: String::new(),
                duration: 0.0,
                volume: 1.0,
                playback_rate: 1.0,
                loop_enabled: false,
                status: PlaybackStatus::Idle,
                position_secs: 0.0,
                start_offset_secs: 0.0,
                track_base_pos_secs: 0.0,
                buffered_percent: 0.0,
                generation: 0,
                is_crossfading: false,
            })),
            active_source: Mutex::new(None),
            stream_cache: Mutex::new(StreamCache::new(cache_dir)),
            queued_tracks: Mutex::new(VecDeque::new()),
            selected_device_id: Mutex::new(None),
            compressor_params: Arc::new(CompressorParams::new()),
            visualizer: VisualizerEngine::new(),
        }
    }

    pub fn set_cache_dir(&self, dir: PathBuf) {
        self.stream_cache.lock().unwrap().set_cache_dir(dir);
    }

    fn open_sink_for_device(device_id: Option<&str>) -> Result<MixerDeviceSink, String> {
        if let Some(target_id) = device_id {
            let host = rodio::cpal::default_host();
            if let Ok(devices) = host.output_devices() {
                for dev in devices {
                    let id_match = dev.id().ok().map(|id| id.to_string()).as_deref() == Some(target_id);
                    let name_match = dev
                        .description()
                        .ok()
                        .map(|d| d.name().to_string())
                        .as_deref()
                        == Some(target_id);
                    if id_match || name_match {
                        match DeviceSinkBuilder::from_device(dev).and_then(|b| b.open_stream()) {
                            Ok(mut s) => {
                                s.log_on_drop(false);
                                return Ok(s);
                            }
                            Err(e) => {
                                log::warn!(
                                    "[AudioPlayer] Failed to open selected device '{}': {:?}, falling back to default",
                                    target_id,
                                    e
                                );
                            }
                        }
                    }
                }
            }
        }

        match DeviceSinkBuilder::open_default_sink() {
            Ok(mut s) => {
                s.log_on_drop(false);
                Ok(s)
            }
            Err(e) => Err(format!("No audio output device available: {:?}", e)),
        }
    }

    fn ensure_device_sink(&self) -> Result<(), String> {
        let mut sink_guard = self.sink.lock().unwrap();
        if sink_guard.is_some() {
            return Ok(());
        }

        let dev_id = self.selected_device_id.lock().unwrap().clone();
        let sink = Self::open_sink_for_device(dev_id.as_deref())?;
        *sink_guard = Some(sink);
        Ok(())
    }

    fn cancel_queued_tracks(&self) {
        let mut queue = self.queued_tracks.lock().unwrap();
        while let Some(q) = queue.pop_front() {
            q.cancel.store(true, Ordering::Release);
            q.input.cancel();
        }
    }

    fn cancel_source_if_incomplete(src: &ActiveTrackSource) {
        let already_complete = match &src.input {
            MediaInput::Local { .. } => true,
            MediaInput::Progressive(stream) => stream.is_finished_ok(),
        };
        if !already_complete {
            src.cancel.store(true, Ordering::Release);
            src.input.cancel();
        }
    }

    fn acquire_media_input(
        &self,
        path_or_url: &str,
        generation: u64,
        meta_arc: Arc<Mutex<PlaybackMetadata>>,
    ) -> Result<(MediaInput, f64, Arc<AtomicBool>), String> {
        // Reuse cached RAM or disk handle if URL matches
        if let Some((input, mut duration, cancel)) = self.stream_cache.lock().unwrap().get(path_or_url) {
            if duration <= 0.0 {
                duration = Self::probe_duration(&input).unwrap_or(0.0);
            }
            if let Ok(mut meta) = meta_arc.lock() {
                if meta.generation == generation {
                    meta.buffered_percent = 100.0;
                }
            }
            return Ok((input, duration, cancel));
        }

        let cancel = Arc::new(AtomicBool::new(false));
        let input = MediaInput::open(path_or_url, meta_arc, generation, Arc::clone(&cancel))?;
        let duration = Self::probe_duration(&input).unwrap_or(0.0);

        if let Ok(cached_handle) = input.clone_handle() {
            self.stream_cache.lock().unwrap().insert(
                path_or_url.to_string(),
                cached_handle,
                duration,
                Arc::clone(&cancel),
            );
        }

        Ok((input, duration, cancel))
    }

    fn append_dsp_pipeline<S>(&self, player: &Player, source: S, boundary_flag: Option<Arc<AtomicBool>>)
    where
        S: Source<Item = f32> + Send + 'static,
    {
        let comp = CompressorSource::new(source, Arc::clone(&self.compressor_params));
        let tapped = VisualizerTapSource::new(
            comp,
            self.visualizer.active_flag(),
            self.visualizer.producer_handle(),
        );
        if let Some(flag) = boundary_flag {
            player.append(TrackBoundarySource::new(tapped, flag));
        } else {
            player.append(tapped);
        }
    }

    fn decode_and_append(
        &self,
        player: &Player,
        input: MediaInput,
        start_pos: f64,
        boundary_flag: Option<Arc<AtomicBool>>,
    ) -> Result<(), String> {
        let decoder = Decoder::try_from(BufReader::new(input))
            .map_err(|e| format!("Failed to decode audio: {:?}", e))?;

        if start_pos > 0.0 {
            let skipped = decoder.skip_duration(Duration::from_secs_f64(start_pos));
            self.append_dsp_pipeline(player, skipped, boundary_flag);
        } else {
            self.append_dsp_pipeline(player, decoder, boundary_flag);
        }
        Ok(())
    }

    pub fn load_source(
        &self,
        path_or_url: &str,
        autoplay: bool,
        position_secs: Option<f64>,
    ) -> Result<AudioState, String> {
        self.ensure_device_sink()?;
        self.cancel_queued_tracks();

        // Stop existing player & cancel previous HTTP stream
        {
            let mut player_guard = self.player.lock().unwrap();
            if let Some(old_player) = player_guard.take() {
                old_player.stop();
            }
        }
        {
            let mut active = self.active_source.lock().unwrap();
            if let Some(old_src) = active.take() {
                Self::cancel_source_if_incomplete(&old_src);
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
            meta.start_offset_secs = initial_pos;
            meta.track_base_pos_secs = 0.0;
            meta.generation
        };

        let (input, duration_secs, cancel) =
            self.acquire_media_input(path_or_url, current_gen, Arc::clone(&self.meta))?;

        let decode_handle = input
            .clone_handle()
            .map_err(|e| format!("Failed to clone media handle: {}", e))?;

        let (current_volume, playback_rate) = {
            let meta = self.meta.lock().unwrap();
            (meta.volume, meta.playback_rate)
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
        new_player.set_speed(playback_rate);

        self.decode_and_append(&new_player, decode_handle, initial_pos, None)?;

        if !autoplay {
            new_player.pause();
        } else {
            new_player.play();
        }

        let status = if autoplay {
            PlaybackStatus::Playing
        } else {
            PlaybackStatus::Paused
        };

        {
            let mut active = self.active_source.lock().unwrap();
            *active = Some(ActiveTrackSource {
                url: path_or_url.to_string(),
                input,
                duration: duration_secs,
                cancel,
            });
        }

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
                meta.start_offset_secs = initial_pos;
                meta.track_base_pos_secs = 0.0;
            }
        }

        Ok(self.get_state())
    }

    /// Preloads a track in the 3-track RAM/disk cache without interrupting current playback.
    pub fn preload(&self, path_or_url: &str) -> Result<AudioState, String> {
        {
            let mut cache = self.stream_cache.lock().unwrap();
            if cache.contains_ram(path_or_url) || cache.get(path_or_url).is_some() {
                return Ok(self.get_state());
            }
        }

        // Use an isolated dummy metadata arc so preloading never clobbers the playing track's buffered_percent
        let dummy_meta = Arc::new(Mutex::new(PlaybackMetadata {
            url: path_or_url.to_string(),
            duration: 0.0,
            volume: 1.0,
            playback_rate: 1.0,
            loop_enabled: false,
            status: PlaybackStatus::Loading,
            position_secs: 0.0,
            start_offset_secs: 0.0,
            track_base_pos_secs: 0.0,
            buffered_percent: 0.0,
            generation: 1,
            is_crossfading: false,
        }));

        let cancel = Arc::new(AtomicBool::new(false));
        let input = MediaInput::open(path_or_url, dummy_meta, 1, Arc::clone(&cancel))?;
        let duration = Self::probe_duration(&input).unwrap_or(0.0);

        self.stream_cache.lock().unwrap().insert(
            path_or_url.to_string(),
            input,
            duration,
            cancel,
        );

        Ok(self.get_state())
    }

    /// Appends the next track directly onto the active `rodio::Player` for true 0ms gapless transition.
    pub fn queue_gapless(&self, path_or_url: &str) -> Result<AudioState, String> {
        let player_arc = {
            let guard = self.player.lock().unwrap();
            guard.clone()
        };

        let Some(player) = player_arc else {
            return self.load_source(path_or_url, true, None);
        };

        if player.empty() {
            return self.load_source(path_or_url, true, None);
        }

        let dummy_meta = Arc::new(Mutex::new(PlaybackMetadata {
            url: path_or_url.to_string(),
            duration: 0.0,
            volume: 1.0,
            playback_rate: 1.0,
            loop_enabled: false,
            status: PlaybackStatus::Loading,
            position_secs: 0.0,
            start_offset_secs: 0.0,
            track_base_pos_secs: 0.0,
            buffered_percent: 0.0,
            generation: 1,
            is_crossfading: false,
        }));

        let (input, duration, cancel) = self.acquire_media_input(path_or_url, 1, dummy_meta)?;
        let decode_handle = input
            .clone_handle()
            .map_err(|e| format!("Failed to clone gapless handle: {}", e))?;

        let next_gen = {
            let meta = self.meta.lock().unwrap();
            meta.generation.wrapping_add(1)
        };

        let started_flag = Arc::new(AtomicBool::new(false));
        self.decode_and_append(&player, decode_handle, 0.0, Some(Arc::clone(&started_flag)))?;

        {
            let mut queue = self.queued_tracks.lock().unwrap();
            queue.push_back(QueuedTrack {
                url: path_or_url.to_string(),
                duration,
                started: started_flag,
                generation: next_gen,
                input,
                cancel,
            });
        }

        Ok(self.get_state())
    }

    pub fn crossfade(
        &self,
        path_or_url: &str,
        duration_secs: f64,
        curve: Option<&str>,
        tension_x: Option<f32>,
        tension_y: Option<f32>,
    ) -> Result<AudioState, String> {
        self.ensure_device_sink()?;
        self.cancel_queued_tracks();

        let was_playing = {
            let player_guard = self.player.lock().unwrap();
            player_guard
                .as_ref()
                .map(|p| !p.is_paused() && !p.empty())
                .unwrap_or(false)
        };

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

        let (input, duration_secs_total, cancel) =
            self.acquire_media_input(path_or_url, current_gen, Arc::clone(&self.meta))?;
        let decode_handle = input
            .clone_handle()
            .map_err(|e| format!("Failed to clone crossfade handle: {}", e))?;

        let (current_volume, playback_rate) = {
            let meta = self.meta.lock().unwrap();
            (meta.volume, meta.playback_rate)
        };

        let new_player = {
            let sink_guard = self.sink.lock().unwrap();
            let mixer_sink = sink_guard.as_ref().ok_or("Audio sink not initialized")?;
            Player::connect_new(mixer_sink.mixer())
        };

        new_player.set_volume(0.0);
        new_player.set_speed(playback_rate);
        self.decode_and_append(&new_player, decode_handle, 0.0, None)?;
        new_player.play();

        let new_player_arc = Arc::new(new_player);

        let old_player_opt = {
            let mut player_guard = self.player.lock().unwrap();
            let old = player_guard.take();
            *player_guard = Some(Arc::clone(&new_player_arc));
            old
        };

        let old_source_opt = {
            let mut active = self.active_source.lock().unwrap();
            let old = active.take();
            *active = Some(ActiveTrackSource {
                url: path_or_url.to_string(),
                input,
                duration: duration_secs_total,
                cancel,
            });
            old
        };

        {
            let mut meta = self.meta.lock().unwrap();
            meta.url = path_or_url.to_string();
            meta.duration = duration_secs_total;
            meta.status = PlaybackStatus::Playing;
            meta.position_secs = 0.0;
            meta.start_offset_secs = 0.0;
            meta.track_base_pos_secs = 0.0;
        }

        let fade_new = Arc::clone(&new_player_arc);
        let crossfade_dur = duration_secs.max(0.1);
        let target_vol = current_volume;
        let curve_type = curve.unwrap_or("equalPower").to_string();
        let meta_arc = Arc::clone(&self.meta);

        std::thread::Builder::new()
            .name("holad-audio-crossfade".to_string())
            .spawn(move || {
                let steps = (crossfade_dur * 50.0).round().max(10.0) as usize;
                let step_dur = Duration::from_secs_f64(crossfade_dur / steps as f64);

                for i in 1..=steps {
                    std::thread::sleep(step_dur);
                    let progress = i as f32 / steps as f32;
                    let (out_gain, in_gain) =
                        calculate_crossfade_gains(progress, &curve_type, tension_x, tension_y);

                    fade_new.set_volume(in_gain * target_vol);
                    if let Some(ref old) = old_player_opt {
                        old.set_volume(out_gain * target_vol);
                    }
                }

                fade_new.set_volume(target_vol);
                if let Some(ref old) = old_player_opt {
                    old.stop();
                }
                if let Some(old_src) = old_source_opt {
                    old_src.cancel.store(true, Ordering::Release);
                    old_src.input.cancel();
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
            let pos = player.get_pos().as_secs_f64();
            player.pause();
            let mut meta = self.meta.lock().unwrap();
            if pos > 0.0 {
                let total = (meta.start_offset_secs + pos - meta.track_base_pos_secs).max(0.0);
                meta.position_secs = if meta.duration > 0.0 {
                    total.min(meta.duration)
                } else {
                    total
                };
            }
            meta.status = PlaybackStatus::Paused;
            drop(meta);
            drop(player_guard);
            Ok(self.get_state())
        } else {
            Err("No audio loaded".to_string())
        }
    }

    pub fn stop(&self) -> Result<AudioState, String> {
        self.cancel_queued_tracks();

        {
            let mut player_guard = self.player.lock().unwrap();
            if let Some(old_player) = player_guard.take() {
                old_player.stop();
            }
        }
        {
            let mut active = self.active_source.lock().unwrap();
            if let Some(old_src) = active.take() {
                Self::cancel_source_if_incomplete(&old_src);
            }
        }
        {
            let mut meta = self.meta.lock().unwrap();
            meta.generation = meta.generation.wrapping_add(1);
            meta.url.clear();
            meta.duration = 0.0;
            meta.status = PlaybackStatus::Idle;
            meta.position_secs = 0.0;
            meta.start_offset_secs = 0.0;
            meta.track_base_pos_secs = 0.0;
            meta.buffered_percent = 0.0;
            meta.is_crossfading = false;
        }

        Ok(self.get_state())
    }

    pub fn seek(&self, position_secs: f64) -> Result<AudioState, String> {
        let player_guard = self.player.lock().unwrap();
        let mut meta = self.meta.lock().unwrap();

        let url = meta.url.clone();
        if url.is_empty() {
            return Err("No audio loaded to seek".to_string());
        }

        let pos = position_secs.max(0.0);
        let seek_duration = Duration::from_secs_f64(meta.track_base_pos_secs + pos);

        if let Some(ref player) = *player_guard {
            match player.try_seek(seek_duration) {
                Ok(_) => {
                    meta.position_secs = pos;
                    meta.start_offset_secs = 0.0;
                    drop(meta);
                    drop(player_guard);
                    return Ok(self.get_state());
                }
                Err(e) => {
                    log::debug!("player.try_seek failed: {:?}, falling back to reload & skip", e);
                }
            }
        }

        drop(meta);
        drop(player_guard);

        self.seek_by_reload(&url, pos)?;
        Ok(self.get_state())
    }

    fn seek_by_reload(&self, url: &str, pos: f64) -> Result<(), String> {
        self.ensure_device_sink()?;

        let clone_opt = {
            let active = self.active_source.lock().unwrap();
            active
                .as_ref()
                .filter(|s| s.url == url)
                .and_then(|s| s.input.clone_handle().ok().map(|h| (h, s.duration)))
        };

        let (decode_handle, duration_secs) = if let Some((h, dur)) = clone_opt {
            (h, dur)
        } else {
            let cur_gen = self.meta.lock().unwrap().generation;
            let (input, dur, cancel) =
                self.acquire_media_input(url, cur_gen, Arc::clone(&self.meta))?;
            let h = input
                .clone_handle()
                .map_err(|e| format!("Failed to clone handle on seek: {}", e))?;
            let mut active = self.active_source.lock().unwrap();
            *active = Some(ActiveTrackSource {
                url: url.to_string(),
                input,
                duration: dur,
                cancel,
            });
            (h, dur)
        };

        let (current_volume, playback_rate, was_playing) = {
            let meta = self.meta.lock().unwrap();
            (
                meta.volume,
                meta.playback_rate,
                meta.status == PlaybackStatus::Playing,
            )
        };

        let new_player = {
            let sink_guard = self.sink.lock().unwrap();
            let mixer_sink = sink_guard.as_ref().ok_or("Audio sink not initialized")?;
            Player::connect_new(mixer_sink.mixer())
        };

        new_player.set_volume(current_volume);
        new_player.set_speed(playback_rate);
        self.decode_and_append(&new_player, decode_handle, pos, None)?;

        if !was_playing {
            new_player.pause();
        } else {
            new_player.play();
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
            meta.start_offset_secs = pos;
            meta.track_base_pos_secs = 0.0;
            meta.duration = duration_secs;
            meta.status = if was_playing {
                PlaybackStatus::Playing
            } else {
                PlaybackStatus::Paused
            };
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

    pub fn set_playback_rate(&self, rate: f32) -> Result<AudioState, String> {
        let clamped = rate.clamp(0.25, 4.0);
        let player_guard = self.player.lock().unwrap();
        if let Some(ref player) = *player_guard {
            player.set_speed(clamped);
        }
        let mut meta = self.meta.lock().unwrap();
        meta.playback_rate = clamped;
        drop(meta);
        drop(player_guard);
        Ok(self.get_state())
    }

    pub fn set_loop(&self, enabled: bool) -> Result<AudioState, String> {
        let mut meta = self.meta.lock().unwrap();
        meta.loop_enabled = enabled;
        drop(meta);
        Ok(self.get_state())
    }

    pub fn set_compressor_enabled(&self, enabled: bool) -> Result<AudioState, String> {
        self.compressor_params.set_enabled(enabled);
        Ok(self.get_state())
    }

    pub fn set_compressor_params(
        &self,
        enabled: Option<bool>,
        threshold_db: Option<f32>,
        knee_db: Option<f32>,
        ratio: Option<f32>,
        attack_secs: Option<f32>,
        release_secs: Option<f32>,
    ) -> Result<AudioState, String> {
        if let Some(en) = enabled {
            self.compressor_params.set_enabled(en);
        }
        self.compressor_params
            .set_params(threshold_db, knee_db, ratio, attack_secs, release_secs);
        Ok(self.get_state())
    }

    pub fn start_visualizer(&self, channel: Channel<Vec<u8>>) {
        self.visualizer.start(channel);
    }

    pub fn stop_visualizer(&self) {
        self.visualizer.stop();
    }

    pub fn list_output_devices(&self) -> Result<Vec<AudioOutputDeviceInfo>, String> {
        let host = rodio::cpal::default_host();
        let default_id = host
            .default_output_device()
            .and_then(|d| d.id().ok())
            .map(|id| id.to_string());
        let devices = host
            .output_devices()
            .map_err(|e| format!("Failed to enumerate output devices: {:?}", e))?;

        let mut list = Vec::new();
        for dev in devices {
            let raw_name = dev
                .description()
                .map(|d| d.name().to_string())
                .unwrap_or_else(|_| "Unknown Audio Device".to_string());
            let id = dev
                .id()
                .map(|id| id.to_string())
                .unwrap_or_else(|_| raw_name.clone());
            let is_default = default_id.as_deref() == Some(id.as_str());
            let clean_name = Self::clean_device_display_name(&raw_name);
            list.push(AudioOutputDeviceInfo {
                id,
                name: clean_name,
                is_default,
            });
        }
        Ok(list)
    }

    fn clean_device_display_name(raw_name: &str) -> String {
        #[cfg(target_os = "windows")]
        {
            let lower = raw_name.to_lowercase();
            let is_hp = lower.contains("headphone")
                || lower.contains("headset")
                || lower.contains("earphone")
                || lower.contains("наушники")
                || lower.contains("гарнитура")
                || lower.contains("airpods")
                || lower.contains("buds");
            crate::audio_session::windows_audio::format_clean_device_name(raw_name, is_hp)
        }
        #[cfg(not(target_os = "windows"))]
        {
            raw_name.to_string()
        }
    }

    pub fn is_using_default_device(&self) -> bool {
        self.selected_device_id.lock().unwrap().is_none()
    }

    pub fn has_active_sink(&self) -> bool {
        self.sink.lock().unwrap().is_some()
    }

    pub fn set_output_device(&self, device_id: Option<String>) -> Result<AudioState, String> {
        {
            let mut selected = self.selected_device_id.lock().unwrap();
            *selected = device_id.filter(|s| !s.trim().is_empty());
        }

        if self.has_active_sink() {
            self.recover_output_sink()?;
        }

        Ok(self.get_state())
    }

    pub fn recover_output_sink(&self) -> Result<AudioState, String> {
        // Capture current playback state before dropping old player & sink
        let (url, saved_pos, was_playing, should_restore) = {
            let state = self.get_state();
            let active_url = state.url.clone().unwrap_or_default();
            let restore = !active_url.is_empty()
                && (state.status == PlaybackStatus::Playing
                    || state.status == PlaybackStatus::Paused);
            (
                active_url,
                state.current_time,
                state.status == PlaybackStatus::Playing,
                restore,
            )
        };

        // Drop old player first, then old sink
        {
            let mut player_guard = self.player.lock().unwrap();
            if let Some(old_player) = player_guard.take() {
                old_player.stop();
            }
        }
        {
            let mut sink_guard = self.sink.lock().unwrap();
            *sink_guard = None;
        }

        let dev_id = self.selected_device_id.lock().unwrap().clone();
        let new_sink = Self::open_sink_for_device(dev_id.as_deref())?;
        {
            let mut sink_guard = self.sink.lock().unwrap();
            *sink_guard = Some(new_sink);
        }

        if should_restore {
            self.seek_by_reload(&url, saved_pos)?;
            if was_playing {
                let _ = self.play();
            } else {
                let _ = self.pause();
            }
        }

        Ok(self.get_state())
    }

    /// Checks if a queued gapless track has started playing and promotes its metadata.
    /// Returns `true` if a gapless track transition occurred.
    fn check_gapless_transition(&self) -> bool {
        let mut queue = self.queued_tracks.lock().unwrap();
        let mut transitioned = false;

        while let Some(front) = queue.front() {
            if !front.started.load(Ordering::Acquire) {
                break;
            }
            let next_track = queue.pop_front().unwrap();
            transitioned = true;

            let player_pos = {
                let player_guard = self.player.lock().unwrap();
                player_guard
                    .as_ref()
                    .map(|p| p.get_pos().as_secs_f64())
                    .unwrap_or(0.0)
            };

            {
                let mut active = self.active_source.lock().unwrap();
                if let Some(old_src) = active.take() {
                    Self::cancel_source_if_incomplete(&old_src);
                }
                *active = Some(ActiveTrackSource {
                    url: next_track.url.clone(),
                    input: next_track.input,
                    duration: next_track.duration,
                    cancel: next_track.cancel,
                });
            }

            {
                let mut meta = self.meta.lock().unwrap();
                meta.url = next_track.url;
                meta.duration = next_track.duration;
                meta.generation = next_track.generation;
                meta.position_secs = 0.0;
                meta.start_offset_secs = 0.0;
                meta.track_base_pos_secs = player_pos;
                meta.buffered_percent = 100.0;
                meta.status = PlaybackStatus::Playing;
            }
        }

        transitioned
    }

    pub fn get_state(&self) -> AudioState {
        self.check_gapless_transition();

        let player_guard = self.player.lock().unwrap();
        let meta = self.meta.lock().unwrap();
        let selected_device_id = self.selected_device_id.lock().unwrap().clone();

        let current_time = if let Some(ref player) = *player_guard {
            if player.empty() && meta.duration > 0.0 {
                meta.duration
            } else {
                let pos = player.get_pos().as_secs_f64();
                if pos > 0.0 {
                    let total = (meta.start_offset_secs + pos - meta.track_base_pos_secs).max(0.0);
                    if meta.duration > 0.0 {
                        total.min(meta.duration)
                    } else {
                        total
                    }
                } else {
                    meta.position_secs
                }
            }
        } else {
            meta.position_secs
        };

        let is_playing = if meta.status == PlaybackStatus::Paused
            || meta.status == PlaybackStatus::Loading
            || meta.status == PlaybackStatus::Idle
        {
            false
        } else if let Some(ref player) = *player_guard {
            !player.is_paused() && !player.empty()
        } else {
            false
        };

        let status = if meta.status == PlaybackStatus::Paused {
            PlaybackStatus::Paused
        } else if meta.status == PlaybackStatus::Loading {
            PlaybackStatus::Loading
        } else if let Some(ref player) = *player_guard {
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
            url: if meta.url.is_empty() {
                None
            } else {
                Some(meta.url.clone())
            },
            buffered_percent: meta.buffered_percent,
            generation: meta.generation,
            playback_rate: meta.playback_rate,
            loop_enabled: meta.loop_enabled,
            compressor_enabled: self.compressor_params.is_enabled(),
            output_device_id: selected_device_id,
        }
    }

    /// Advances position tracking, detects gapless transitions, and handles `loop_enabled`.
    /// Returns `true` if a gapless track transition occurred.
    pub fn tick_position(&self, delta_secs: f64) -> bool {
        let transitioned = self.check_gapless_transition();

        let (should_loop, loop_url) = {
            let player_guard = self.player.lock().unwrap();
            let mut meta = self.meta.lock().unwrap();

            if let Some(ref player) = *player_guard {
                if meta.loop_enabled
                    && player.empty()
                    && !meta.url.is_empty()
                    && !meta.is_crossfading
                    && meta.status == PlaybackStatus::Playing
                {
                    (true, meta.url.clone())
                } else {
                    if meta.status != PlaybackStatus::Paused
                        && meta.status != PlaybackStatus::Loading
                        && meta.status != PlaybackStatus::Idle
                        && !player.is_paused()
                        && !player.empty()
                    {
                        let pos = player.get_pos().as_secs_f64();
                        if pos > 0.0 {
                            let total =
                                (meta.start_offset_secs + pos - meta.track_base_pos_secs).max(0.0);
                            meta.position_secs = if meta.duration > 0.0 {
                                total.min(meta.duration)
                            } else {
                                total
                            };
                        } else {
                            meta.position_secs += delta_secs * (meta.playback_rate as f64);
                            if meta.duration > 0.0 && meta.position_secs > meta.duration {
                                meta.position_secs = meta.duration;
                            }
                        }
                    }
                    (false, String::new())
                }
            } else {
                (false, String::new())
            }
        };

        if should_loop {
            if let Err(e) = self.seek_by_reload(&loop_url, 0.0) {
                log::warn!("[AudioPlayer] Loop restart failed: {}", e);
            }
        }

        transitioned
    }

    fn probe_duration(input: &MediaInput) -> Option<f64> {
        let cloned = input.clone_handle().ok()?;
        let mss = MediaSourceStream::new(Box::new(cloned), Default::default());
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
    use rodio::buffer::SamplesBuffer;
    use std::num::NonZero;

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
        assert_eq!(state.playback_rate, 1.0);
        assert!(!state.loop_enabled);
        assert!(!state.compressor_enabled);
    }

    #[test]
    fn test_audio_set_volume_and_rate_and_loop() {
        let player = AudioPlayer::new();
        let res = player.set_volume(0.65).unwrap();
        assert!((res.volume - 0.65).abs() < 0.001);
        assert_eq!(player.set_volume(4.5).unwrap().volume, 3.0);
        assert_eq!(player.set_volume(-0.5).unwrap().volume, 0.0);

        let rate = player.set_playback_rate(1.5).unwrap();
        assert!((rate.playback_rate - 1.5).abs() < 0.001);
        assert_eq!(player.set_playback_rate(10.0).unwrap().playback_rate, 4.0);
        assert_eq!(player.set_playback_rate(0.01).unwrap().playback_rate, 0.25);

        let looped = player.set_loop(true).unwrap();
        assert!(looped.loop_enabled);
    }

    #[test]
    fn test_audio_stop_resets_state() {
        let player = AudioPlayer::new();
        {
            let mut meta = player.meta.lock().unwrap();
            meta.url = "https://example.com/song.mp3".to_string();
            meta.status = PlaybackStatus::Playing;
            meta.position_secs = 42.0;
            meta.duration = 180.0;
            meta.buffered_percent = 90.0;
        }
        let state = player.stop().unwrap();
        assert_eq!(state.status, PlaybackStatus::Idle);
        assert!(state.url.is_none());
        assert_eq!(state.current_time, 0.0);
        assert_eq!(state.duration, 0.0);
        assert_eq!(state.buffered_percent, 0.0);
    }

    #[test]
    fn test_audio_seek_when_empty() {
        let player = AudioPlayer::new();
        assert!(player.seek(10.0).is_err());
    }

    #[test]
    fn test_audio_crossfade_invalid_url() {
        let player = AudioPlayer::new();
        assert!(player
            .crossfade("invalid://non-existent-url-12345", 2.0, None, None, None)
            .is_err());
    }

    #[test]
    fn test_calculate_crossfade_gains_matches_ts() {
        // Linear at midpoint
        let (out_l, in_l) = calculate_crossfade_gains(0.5, "linear", None, None);
        assert!((out_l - 0.5).abs() < 1e-5);
        assert!((in_l - 0.5).abs() < 1e-5);

        // Equal power at midpoint (~0.707)
        let (out_eq, in_eq) = calculate_crossfade_gains(0.5, "equalPower", Some(0.5), Some(0.707));
        assert!((out_eq - std::f32::consts::FRAC_1_SQRT_2).abs() < 0.002);
        assert!((in_eq - std::f32::consts::FRAC_1_SQRT_2).abs() < 0.002);

        // Custom tension (x=0.3, y=0.4): at t=0.3 both gains should equal 0.4
        let (out_c, in_c) = calculate_crossfade_gains(0.3, "custom", Some(0.3), Some(0.4));
        assert!((out_c - 0.4).abs() < 0.002);
        assert!((in_c - 0.4).abs() < 0.002);
    }

    #[test]
    fn test_track_boundary_source_sets_flag_on_first_sample() {
        let flag = Arc::new(AtomicBool::new(false));
        let src = SamplesBuffer::new(
            NonZero::new(2).unwrap(),
            NonZero::new(48000).unwrap(),
            vec![0.1f32, 0.2f32],
        );
        let mut boundary = TrackBoundarySource::new(src, Arc::clone(&flag));
        assert!(!flag.load(Ordering::Acquire));
        assert_eq!(boundary.next(), Some(0.1));
        assert!(flag.load(Ordering::Acquire));
        assert_eq!(boundary.next(), Some(0.2));
        assert_eq!(boundary.next(), None);
    }

    #[test]
    fn test_list_output_devices_returns_ok() {
        let player = AudioPlayer::new();
        let devices = player.list_output_devices();
        assert!(devices.is_ok());
    }
}
