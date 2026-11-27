use std::collections::VecDeque;
use std::fs::File;
use std::io::{self, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime};

use sha2::{Digest, Sha256};
use symphonia::core::io::MediaSource;

use super::player::PlaybackMetadata;

pub const DEFAULT_MAX_RAM_TRACKS: usize = 3;
pub const DEFAULT_RAM_SPILL_THRESHOLD_BYTES: usize = 40 * 1024 * 1024;
pub const DEFAULT_MAX_DISK_CACHE_BYTES: u64 = 500 * 1024 * 1024;
pub const MAX_STREAM_RAM_BYTES: usize = 150 * 1024 * 1024;

const STARTUP_BUFFER_BYTES: usize = 64 * 1024;
const CHUNK_SIZE: usize = 64 * 1024;

struct StreamBuffer {
    data: Vec<u8>,
    total_len: Option<u64>,
    finished: bool,
    error: Option<String>,
}

struct StreamShared {
    buf: Mutex<StreamBuffer>,
    condvar: Condvar,
    cancel: Arc<AtomicBool>,
}

/// Progressive HTTP stream supporting concurrent reading and seeking while
/// downloading in background 64 KB chunks.
pub struct ProgressiveMediaStream {
    shared: Arc<StreamShared>,
    pos: u64,
}

impl ProgressiveMediaStream {
    /// Opens an HTTP/HTTPS URL, spawns a background downloader thread, and waits
    /// until at least 64 KB are buffered, EOF is reached, or an error occurs.
    pub(crate) fn open_http(
        url: &str,
        meta_arc: Arc<Mutex<PlaybackMetadata>>,
        generation: u64,
        cancel: Arc<AtomicBool>,
    ) -> Result<Self, String> {
        let shared = Arc::new(StreamShared {
            buf: Mutex::new(StreamBuffer {
                data: Vec::with_capacity(STARTUP_BUFFER_BYTES),
                total_len: None,
                finished: false,
                error: None,
            }),
            condvar: Condvar::new(),
            cancel: Arc::clone(&cancel),
        });

        let url_owned = url.to_string();
        let bg_shared = Arc::clone(&shared);

        std::thread::Builder::new()
            .name("holad-http-stream".to_string())
            .spawn(move || {
                Self::download_loop(&url_owned, bg_shared, meta_arc, generation);
            })
            .map_err(|e| format!("Failed to spawn HTTP stream thread: {}", e))?;

        // Wait only until startup threshold (64 KB) or stream completion/error
        let mut buf = shared.buf.lock().unwrap();
        while buf.data.len() < STARTUP_BUFFER_BYTES
            && !buf.finished
            && buf.error.is_none()
            && !shared.cancel.load(Ordering::Relaxed)
        {
            buf = shared.condvar.wait(buf).unwrap();
        }

        if let Some(ref err) = buf.error {
            if buf.data.is_empty() {
                return Err(err.clone());
            }
        }

        if shared.cancel.load(Ordering::Relaxed) && buf.data.is_empty() {
            return Err("Stream cancelled".to_string());
        }

        drop(buf);
        Ok(Self { shared, pos: 0 })
    }

    fn download_loop(
        url: &str,
        shared: Arc<StreamShared>,
        meta_arc: Arc<Mutex<PlaybackMetadata>>,
        generation: u64,
    ) {
        let resp = match ureq::get(url).timeout(Duration::from_secs(30)).call() {
            Ok(r) => r,
            Err(e) => {
                let mut buf = shared.buf.lock().unwrap();
                buf.error = Some(format!("HTTP request error for {}: {:?}", url, e));
                buf.finished = true;
                shared.condvar.notify_all();
                return;
            }
        };

        let total_len: Option<u64> = resp
            .header("content-length")
            .and_then(|v| v.trim().parse::<u64>().ok())
            .filter(|&len| len > 0);

        {
            let mut buf = shared.buf.lock().unwrap();
            buf.total_len = total_len;
            if let Some(len) = total_len {
                if len <= MAX_STREAM_RAM_BYTES as u64 {
                    let cap = len as usize;
                    let cur_len = buf.data.len();
                    if cap > buf.data.capacity() {
                        buf.data.reserve(cap - cur_len);
                    }
                }
            }
        }

        let mut reader = resp.into_reader();
        let mut chunk = [0u8; CHUNK_SIZE];
        let mut last_pct: f32 = -1.0;

        loop {
            if shared.cancel.load(Ordering::Relaxed) {
                let mut buf = shared.buf.lock().unwrap();
                buf.finished = true;
                shared.condvar.notify_all();
                break;
            }

            match reader.read(&mut chunk) {
                Ok(0) => {
                    let truncated_err = {
                        let mut buf = shared.buf.lock().unwrap();
                        let downloaded = buf.data.len() as u64;
                        let mut truncated = None;
                        if let Some(total) = total_len {
                            if downloaded < total {
                                let msg = format!("Unexpected EOF: {}/{}", downloaded, total);
                                buf.error = Some(msg.clone());
                                truncated = Some(msg);
                            }
                        }
                        buf.finished = true;
                        shared.condvar.notify_all();
                        truncated
                    };
                    if truncated_err.is_none() {
                        if let Ok(mut meta) = meta_arc.lock() {
                            if meta.generation == generation {
                                meta.buffered_percent = 100.0;
                            }
                        }
                    } else if let Some(msg) = truncated_err {
                        log::warn!("[ProgressiveMediaStream] {}", msg);
                    }
                    break;
                }
                Ok(n) => {
                    let mut hit_cap = false;
                    let downloaded = {
                        let mut buf = shared.buf.lock().unwrap();
                        let remaining = MAX_STREAM_RAM_BYTES.saturating_sub(buf.data.len());
                        if n > remaining {
                            if remaining > 0 {
                                buf.data.extend_from_slice(&chunk[..remaining]);
                            }
                            buf.error = Some(format!(
                                "HTTP stream exceeded {} MB RAM buffer limit",
                                MAX_STREAM_RAM_BYTES / (1024 * 1024)
                            ));
                            buf.finished = true;
                            hit_cap = true;
                        } else {
                            buf.data.extend_from_slice(&chunk[..n]);
                        }
                        let len = buf.data.len() as u64;
                        shared.condvar.notify_all();
                        len
                    };

                    if hit_cap {
                        break;
                    }

                    let pct = Self::compute_buffered_percent(downloaded, total_len);
                    if (pct - last_pct).abs() >= 1.0 {
                        if let Ok(mut meta) = meta_arc.try_lock() {
                            last_pct = pct;
                            if meta.generation == generation {
                                meta.buffered_percent = pct;
                            }
                        }
                    }
                }
                Err(e) => {
                    let mut buf = shared.buf.lock().unwrap();
                    buf.error = Some(format!("Failed to read HTTP audio stream: {:?}", e));
                    buf.finished = true;
                    shared.condvar.notify_all();
                    break;
                }
            }
        }
    }

    /// Computes buffered percentage: exact when `Content-Length` is known,
    /// progressive asymptotic `0..99%` when `Content-Length` is missing.
    pub fn compute_buffered_percent(downloaded: u64, total_len: Option<u64>) -> f32 {
        match total_len {
            Some(total) if total > 0 => {
                ((downloaded as f32 / total as f32) * 100.0).clamp(0.0, 100.0)
            }
            _ => {
                // Asymptotic curve approaching 99% as bytes arrive (50% at 1 MB, ~90% at 9 MB)
                let d = downloaded as f32;
                (99.0 * (d / (d + 1024.0 * 1024.0))).clamp(0.0, 99.0)
            }
        }
    }

    /// Creates a new independent reader handle at `pos = 0` sharing the same
    /// underlying buffer without copying `Vec<u8>`.
    pub fn clone_handle(&self) -> Self {
        Self {
            shared: Arc::clone(&self.shared),
            pos: 0,
        }
    }

    /// Signals the background downloader to stop and wakes any blocked readers/seekers.
    pub fn cancel(&self) {
        self.shared.cancel.store(true, Ordering::Release);
        self.shared.condvar.notify_all();
    }

    pub fn is_finished_ok(&self) -> bool {
        if self.shared.cancel.load(Ordering::Acquire) {
            return false;
        }
        let buf = self.shared.buf.lock().unwrap();
        buf.finished && buf.error.is_none() && !buf.data.is_empty()
    }

    pub fn has_error(&self) -> bool {
        self.shared.buf.lock().unwrap().error.is_some()
    }

    pub fn ram_len(&self) -> usize {
        self.shared.buf.lock().unwrap().data.len()
    }

    pub fn snapshot_if_finished_ok(&self) -> Option<Vec<u8>> {
        if self.shared.cancel.load(Ordering::Acquire) {
            return None;
        }
        let buf = self.shared.buf.lock().unwrap();
        if buf.finished && buf.error.is_none() && !buf.data.is_empty() {
            Some(buf.data.clone())
        } else {
            None
        }
    }

    pub fn write_to_file(&self, path: &Path) -> io::Result<()> {
        let data = {
            let buf = self.shared.buf.lock().unwrap();
            buf.data.clone()
        };
        let mut file = File::create(path)?;
        file.write_all(&data)?;
        file.flush()?;
        Ok(())
    }

    #[cfg(test)]
    fn from_bytes_for_test(data: Vec<u8>, total_len: Option<u64>, finished: bool) -> Self {
        Self {
            shared: Arc::new(StreamShared {
                buf: Mutex::new(StreamBuffer {
                    data,
                    total_len,
                    finished,
                    error: None,
                }),
                condvar: Condvar::new(),
                cancel: Arc::new(AtomicBool::new(false)),
            }),
            pos: 0,
        }
    }
}

impl Read for ProgressiveMediaStream {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        if out.is_empty() {
            return Ok(0);
        }

        let mut buf = self.shared.buf.lock().unwrap();
        while (self.pos as usize) >= buf.data.len() {
            if let Some(ref err) = buf.error {
                if buf.finished {
                    return Err(io::Error::new(io::ErrorKind::Other, err.clone()));
                }
            }
            if buf.finished {
                return Ok(0);
            }
            if self.shared.cancel.load(Ordering::Acquire) {
                return Err(io::Error::new(
                    io::ErrorKind::Interrupted,
                    "Stream cancelled",
                ));
            }
            buf = self.shared.condvar.wait(buf).unwrap();
        }

        let start = self.pos as usize;
        let available = buf.data.len() - start;
        let to_copy = available.min(out.len());
        out[..to_copy].copy_from_slice(&buf.data[start..start + to_copy]);
        self.pos += to_copy as u64;
        Ok(to_copy)
    }
}

impl Seek for ProgressiveMediaStream {
    fn seek(&mut self, style: SeekFrom) -> io::Result<u64> {
        let mut buf = self.shared.buf.lock().unwrap();

        let target: i64 = match style {
            SeekFrom::Start(offset) => offset as i64,
            SeekFrom::Current(offset) => self.pos as i64 + offset,
            SeekFrom::End(offset) => {
                if let Some(total) = buf.total_len {
                    total as i64 + offset
                } else {
                    while !buf.finished && !self.shared.cancel.load(Ordering::Acquire) {
                        buf = self.shared.condvar.wait(buf).unwrap();
                    }
                    if self.shared.cancel.load(Ordering::Acquire) && !buf.finished {
                        return Err(io::Error::new(
                            io::ErrorKind::Interrupted,
                            "Stream cancelled during SeekFrom::End",
                        ));
                    }
                    buf.data.len() as i64 + offset
                }
            }
        };

        if target < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Invalid seek to a negative position",
            ));
        }

        let target_u64 = target as u64;

        // Forward seek beyond currently downloaded bytes: wait on Condvar
        while (target_u64 as usize) > buf.data.len()
            && !buf.finished
            && !self.shared.cancel.load(Ordering::Acquire)
        {
            buf = self.shared.condvar.wait(buf).unwrap();
        }

        if let Some(ref err) = buf.error {
            if (target_u64 as usize) > buf.data.len() {
                return Err(io::Error::new(io::ErrorKind::Other, err.clone()));
            }
        }

        if self.shared.cancel.load(Ordering::Acquire) && (target_u64 as usize) > buf.data.len() {
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "Stream cancelled during forward seek",
            ));
        }

        self.pos = target_u64;
        Ok(self.pos)
    }
}

impl MediaSource for ProgressiveMediaStream {
    fn is_seekable(&self) -> bool {
        true
    }

    fn byte_len(&self) -> Option<u64> {
        let buf = self.shared.buf.lock().unwrap();
        buf.total_len
            .or_else(|| if buf.finished { Some(buf.data.len() as u64) } else { None })
    }
}

/// Unified media input supporting both local `BufReader<File>` and progressive HTTP streaming.
pub enum MediaInput {
    Local {
        reader: BufReader<File>,
        path: String,
    },
    Progressive(ProgressiveMediaStream),
}

static RUNTIME_ALLOWED_MEDIA_DIRS: std::sync::OnceLock<Vec<PathBuf>> = std::sync::OnceLock::new();

pub fn register_allowed_media_dirs(dirs: Vec<PathBuf>) {
    let _ = RUNTIME_ALLOWED_MEDIA_DIRS.set(dirs);
}

fn allowed_local_media_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(runtime_dirs) = RUNTIME_ALLOWED_MEDIA_DIRS.get() {
        dirs.extend(runtime_dirs.iter().cloned());
    }
    const APP_IDS: &[&str] = &["com.holad.app", "com.holad.app.debug", "com.holad.desktop", "Holad"];

    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let base = PathBuf::from(appdata);
            for id in APP_IDS {
                dirs.push(base.join(id));
            }
        }
        if let Some(local_appdata) = std::env::var_os("LOCALAPPDATA") {
            let base = PathBuf::from(local_appdata);
            for id in APP_IDS {
                dirs.push(base.join(id));
            }
        }
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            let base = PathBuf::from(profile);
            dirs.push(base.join("Downloads"));
            dirs.push(base.join("Music").join("Holad"));
        }

        #[cfg(target_os = "android")]
        {
            for root in [
                "/storage/emulated/0",
                "/sdcard",
                "/data/user/0",
                "/data/data",
            ] {
                let base = PathBuf::from(root);
                dirs.push(base.join("Music").join("Holad"));
                dirs.push(base.join("Download").join("Holad"));
                dirs.push(base.join("Android").join("data").join("com.holad.app").join("files"));
                dirs.push(base.join("Android").join("data").join("com.holad.app.debug").join("files"));
                dirs.push(base.join("com.holad.app").join("files"));
                dirs.push(base.join("com.holad.app.debug").join("files"));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(xdg_data) = std::env::var_os("XDG_DATA_HOME") {
            let base = PathBuf::from(xdg_data);
            for id in APP_IDS {
                dirs.push(base.join(id));
            }
        }
        if let Some(xdg_cache) = std::env::var_os("XDG_CACHE_HOME") {
            let base = PathBuf::from(xdg_cache);
            for id in APP_IDS {
                dirs.push(base.join(id));
            }
        }
        if let Some(xdg_dl) = std::env::var_os("XDG_DOWNLOAD_DIR") {
            dirs.push(PathBuf::from(xdg_dl));
        }
        if let Some(xdg_music) = std::env::var_os("XDG_MUSIC_DIR") {
            dirs.push(PathBuf::from(xdg_music).join("Holad"));
        }
        if let Some(home) = std::env::var_os("HOME") {
            let base = PathBuf::from(home);
            for id in APP_IDS {
                dirs.push(base.join(".local").join("share").join(id));
                dirs.push(base.join(".cache").join(id));
                dirs.push(base.join("Library").join("Application Support").join(id));
                dirs.push(base.join("Library").join("Caches").join(id));
            }
            dirs.push(base.join("Downloads"));
            dirs.push(base.join("Music").join("Holad"));
        }

        #[cfg(target_os = "android")]
        {
            for root in [
                "/storage/emulated/0",
                "/sdcard",
                "/data/user/0",
                "/data/data",
            ] {
                let base = PathBuf::from(root);
                dirs.push(base.join("Music").join("Holad"));
                dirs.push(base.join("Download").join("Holad"));
                dirs.push(base.join("Android").join("data").join("com.holad.app").join("files"));
                dirs.push(base.join("Android").join("data").join("com.holad.app.debug").join("files"));
                dirs.push(base.join("com.holad.app").join("files"));
                dirs.push(base.join("com.holad.app.debug").join("files"));
            }
        }
    }

    #[cfg(test)]
    {
        dirs.push(std::env::temp_dir());
    }

    dirs
}

fn validate_local_media_path(path_str: &str) -> Result<PathBuf, String> {
    let trimmed = path_str.trim();
    if trimmed.is_empty() {
        return Err("Local media path cannot be empty".to_string());
    }
    let path = Path::new(trimmed);
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Path traversal ('..') is not allowed in media path".to_string());
    }

    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve media path {}: {:?}", trimmed, e))?;
    if !canonical.is_file() {
        return Err(format!("Media path is not a regular file: {}", trimmed));
    }

    let allowed = allowed_local_media_dirs();
    if !crate::is_path_within_any(&canonical, &allowed) {
        return Err(format!(
            "Access denied: media path '{}' is outside allowed Holad directories",
            trimmed
        ));
    }

    Ok(canonical)
}

impl MediaInput {
    pub(crate) fn open(
        path_or_url: &str,
        meta_arc: Arc<Mutex<PlaybackMetadata>>,
        generation: u64,
        cancel: Arc<AtomicBool>,
    ) -> Result<Self, String> {
        if let Some(local_path) = resolve_local_path(path_or_url) {
            let safe_path = validate_local_media_path(&local_path)?;
            let file = File::open(&safe_path)
                .map_err(|e| format!("Failed to open file {}: {:?}", local_path, e))?;

            if let Ok(mut meta) = meta_arc.lock() {
                if meta.generation == generation {
                    meta.buffered_percent = 100.0;
                }
            }

            Ok(Self::Local {
                reader: BufReader::new(file),
                path: safe_path.to_string_lossy().into_owned(),
            })
        } else if path_or_url.starts_with("http://") || path_or_url.starts_with("https://") {
            let stream = ProgressiveMediaStream::open_http(path_or_url, meta_arc, generation, cancel)?;
            Ok(Self::Progressive(stream))
        } else {
            // Plain filesystem path fallback
            let safe_path = validate_local_media_path(path_or_url)?;
            let file = File::open(&safe_path)
                .map_err(|e| format!("Failed to open file {}: {:?}", path_or_url, e))?;

            if let Ok(mut meta) = meta_arc.lock() {
                if meta.generation == generation {
                    meta.buffered_percent = 100.0;
                }
            }

            Ok(Self::Local {
                reader: BufReader::new(file),
                path: safe_path.to_string_lossy().into_owned(),
            })
        }
    }

    /// Creates a new handle at position 0 (without copying HTTP buffers).
    pub fn clone_handle(&self) -> io::Result<Self> {
        match self {
            Self::Local { path, .. } => {
                let file = File::open(Path::new(path))?;
                Ok(Self::Local {
                    reader: BufReader::new(file),
                    path: path.clone(),
                })
            }
            Self::Progressive(stream) => Ok(Self::Progressive(stream.clone_handle())),
        }
    }

    pub fn cancel(&self) {
        if let Self::Progressive(stream) = self {
            stream.cancel();
        }
    }
}

impl Read for MediaInput {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Local { reader, .. } => reader.read(buf),
            Self::Progressive(stream) => stream.read(buf),
        }
    }
}

impl Seek for MediaInput {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        match self {
            Self::Local { reader, .. } => reader.seek(pos),
            Self::Progressive(stream) => stream.seek(pos),
        }
    }
}

impl MediaSource for MediaInput {
    fn is_seekable(&self) -> bool {
        true
    }

    fn byte_len(&self) -> Option<u64> {
        match self {
            Self::Local { reader, .. } => reader.get_ref().metadata().ok().map(|m| m.len()),
            Self::Progressive(stream) => stream.byte_len(),
        }
    }
}

pub(crate) struct CachedTrack {
    pub url: String,
    pub input: MediaInput,
    pub duration: f64,
    pub cancel: Arc<AtomicBool>,
}

/// Bounded 3-track RAM window (previous, current, next) with LRU eviction
/// and disk spillover to `audio_cache/<hash>.bin` for HTTP streams.
pub struct StreamCache {
    entries: VecDeque<CachedTrack>,
    max_ram_tracks: usize,
    ram_spill_threshold_bytes: usize,
    max_disk_cache_bytes: u64,
    cache_dir: Option<PathBuf>,
    pending_spills: Vec<std::thread::JoinHandle<()>>,
}

impl StreamCache {
    pub fn new(cache_dir: Option<PathBuf>) -> Self {
        Self::with_limits(
            cache_dir,
            DEFAULT_MAX_RAM_TRACKS,
            DEFAULT_RAM_SPILL_THRESHOLD_BYTES,
            DEFAULT_MAX_DISK_CACHE_BYTES,
        )
    }

    pub fn with_limits(
        cache_dir: Option<PathBuf>,
        max_ram_tracks: usize,
        ram_spill_threshold_bytes: usize,
        max_disk_cache_bytes: u64,
    ) -> Self {
        if let Some(ref dir) = cache_dir {
            let _ = std::fs::create_dir_all(dir);
        }
        Self {
            entries: VecDeque::with_capacity(max_ram_tracks.max(1)),
            max_ram_tracks: max_ram_tracks.max(1),
            ram_spill_threshold_bytes,
            max_disk_cache_bytes,
            cache_dir,
            pending_spills: Vec::new(),
        }
    }

    pub fn set_cache_dir(&mut self, dir: PathBuf) {
        let _ = std::fs::create_dir_all(&dir);
        self.cache_dir = Some(dir);
    }

    pub fn cache_path_for_url(cache_dir: &Path, url: &str) -> PathBuf {
        let mut hasher = Sha256::new();
        hasher.update(url.as_bytes());
        let hash = hasher.finalize();
        let hex: String = hash.iter().map(|b| format!("{:02x}", b)).collect();
        cache_dir.join(format!("{}.bin", hex))
    }

    pub fn contains_ram(&self, url: &str) -> bool {
        self.entries.iter().any(|e| e.url == url)
    }

    pub fn ram_len(&self) -> usize {
        self.entries.len()
    }

    fn is_http_url(url: &str) -> bool {
        url.starts_with("http://") || url.starts_with("https://")
    }

    fn spill_progressive_to_disk(
        &mut self,
        url: &str,
        stream: &ProgressiveMediaStream,
    ) -> Option<PathBuf> {
        let dir = self.cache_dir.as_ref()?.clone();
        if !Self::is_http_url(url) {
            return None;
        }
        let final_path = Self::cache_path_for_url(&dir, url);
        if final_path.exists() {
            return Some(final_path);
        }

        // Snapshot bytes briefly under buf.lock(), then perform all disk I/O
        // and cache eviction in a background thread.
        let data = stream.snapshot_if_finished_ok()?;
        let max_disk_bytes = self.max_disk_cache_bytes;
        self.pending_spills.retain(|h| !h.is_finished());

        if let Ok(handle) = std::thread::Builder::new()
            .name("holad-cache-spill".to_string())
            .spawn(move || {
                if std::fs::create_dir_all(&dir).is_err() {
                    return;
                }
                if final_path.exists() {
                    return;
                }
                let Some(fname) = final_path.file_name() else {
                    return;
                };
                let tmp_path = dir.join(format!("{}.tmp", fname.to_string_lossy()));
                let write_res = (|| -> io::Result<()> {
                    let mut file = File::create(&tmp_path)?;
                    file.write_all(&data)?;
                    file.flush()?;
                    Ok(())
                })();
                if write_res.is_err() {
                    let _ = std::fs::remove_file(&tmp_path);
                    return;
                }
                if std::fs::rename(&tmp_path, &final_path).is_err() {
                    let _ = std::fs::remove_file(&tmp_path);
                    return;
                }
                Self::enforce_disk_cache_cap(&dir, max_disk_bytes);
            })
        {
            self.pending_spills.push(handle);
        }

        None
    }

    #[cfg(test)]
    pub fn flush_spills(&mut self) {
        for handle in self.pending_spills.drain(..) {
            let _ = handle.join();
        }
    }

    fn enforce_disk_cache_cap(cache_dir: &Path, max_bytes: u64) {
        let Ok(read_dir) = std::fs::read_dir(cache_dir) else {
            return;
        };
        let mut files: Vec<(PathBuf, u64, SystemTime)> = Vec::new();
        let mut total_bytes: u64 = 0;

        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("bin") {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    let len = meta.len();
                    let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                    total_bytes = total_bytes.saturating_add(len);
                    files.push((path, len, modified));
                }
            }
        }

        if total_bytes <= max_bytes {
            return;
        }

        // Evict oldest modified files first
        files.sort_by_key(|(_, _, mtime)| *mtime);
        for (path, len, _) in files {
            if total_bytes <= max_bytes {
                break;
            }
            if std::fs::remove_file(&path).is_ok() {
                total_bytes = total_bytes.saturating_sub(len);
            }
        }
    }

    /// Looks up a track in the 3-track RAM window (promoting to MRU) or falls back
    /// to the disk cache (`audio_cache/<hash>.bin`) via `BufReader<File>`.
    pub fn get(&mut self, url: &str) -> Option<(MediaInput, f64, Arc<AtomicBool>)> {
        if let Some(idx) = self.entries.iter().position(|e| e.url == url) {
            let mut entry = self.entries.remove(idx).unwrap();

            let is_poisoned = entry.cancel.load(Ordering::Acquire)
                || matches!(&entry.input, MediaInput::Progressive(s) if s.has_error());

            if !is_poisoned {
                // Spill oversized finished HTTP stream to disk and swap to Local handle
                if let MediaInput::Progressive(ref stream) = entry.input {
                    if stream.is_finished_ok() && stream.ram_len() > self.ram_spill_threshold_bytes {
                        if let Some(disk_path) = self.spill_progressive_to_disk(&entry.url, stream) {
                            if let Ok(file) = File::open(&disk_path) {
                                entry.input = MediaInput::Local {
                                    reader: BufReader::new(file),
                                    path: disk_path.to_string_lossy().into_owned(),
                                };
                            }
                        }
                    }
                }

                let cloned = entry.input.clone_handle().ok()?;
                let duration = entry.duration;
                let cancel = Arc::clone(&entry.cancel);
                self.entries.push_back(entry);
                return Some((cloned, duration, cancel));
            }
        }

        // Check disk cache for HTTP URLs
        if Self::is_http_url(url) {
            if let Some(ref dir) = self.cache_dir {
                let path = Self::cache_path_for_url(dir, url);
                if let Ok(meta) = std::fs::metadata(&path) {
                    if meta.is_file() && meta.len() > 0 {
                        if let Ok(file) = File::open(&path) {
                            let local_input = MediaInput::Local {
                                reader: BufReader::new(file),
                                path: path.to_string_lossy().into_owned(),
                            };
                            if let Ok(cloned) = local_input.clone_handle() {
                                let cancel = Arc::new(AtomicBool::new(false));
                                self.insert(url.to_string(), local_input, 0.0, Arc::clone(&cancel));
                                return Some((cloned, 0.0, cancel));
                            }
                        }
                    }
                }
            }
        }

        None
    }

    /// Inserts a track into the 3-track RAM window, spilling oversized or LRU-evicted
    /// HTTP streams to disk when complete.
    pub fn insert(
        &mut self,
        url: String,
        mut input: MediaInput,
        duration: f64,
        cancel: Arc<AtomicBool>,
    ) {
        // Remove any existing entry for the same URL so it moves to MRU
        if let Some(idx) = self.entries.iter().position(|e| e.url == url) {
            self.entries.remove(idx);
        }

        // If this stream is already finished and exceeds the RAM spill threshold (40 MB),
        // spill it to disk immediately and keep a lightweight Local file handle in the window.
        if let MediaInput::Progressive(ref stream) = input {
            if stream.is_finished_ok() && stream.ram_len() > self.ram_spill_threshold_bytes {
                if let Some(disk_path) = self.spill_progressive_to_disk(&url, stream) {
                    if let Ok(file) = File::open(&disk_path) {
                        input = MediaInput::Local {
                            reader: BufReader::new(file),
                            path: disk_path.to_string_lossy().into_owned(),
                        };
                    }
                }
            }
        }

        while self.entries.len() >= self.max_ram_tracks {
            if let Some(evicted) = self.entries.pop_front() {
                if let MediaInput::Progressive(ref stream) = evicted.input {
                    let _ = self.spill_progressive_to_disk(&evicted.url, stream);
                }
            }
        }

        self.entries.push_back(CachedTrack {
            url,
            input,
            duration,
            cancel,
        });
    }
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn strip_windows_leading_slash(path: &str) -> &str {
    #[cfg(target_os = "windows")]
    {
        if path.starts_with('/') && path.len() > 2 && path.as_bytes()[2] == b':' {
            return &path[1..];
        }
    }
    path
}

pub fn resolve_local_asset_path(path_or_url: &str) -> Option<String> {
    let stripped = path_or_url
        .strip_prefix("http://asset.localhost/")
        .or_else(|| path_or_url.strip_prefix("https://asset.localhost/"))
        .or_else(|| path_or_url.strip_prefix("asset://localhost/"))?;

    let decoded = percent_decode(stripped);
    let normalized = strip_windows_leading_slash(&decoded).to_string();
    Some(normalized)
}

/// Resolves `asset.localhost`, `asset://localhost`, and `file://` URLs into local filesystem paths.
pub fn resolve_local_path(path_or_url: &str) -> Option<String> {
    if let Some(asset_path) = resolve_local_asset_path(path_or_url) {
        return Some(asset_path);
    }

    if let Some(stripped) = path_or_url.strip_prefix("file://") {
        let decoded = if stripped.contains('%') {
            percent_decode(stripped)
        } else {
            stripped.to_string()
        };
        return Some(strip_windows_leading_slash(&decoded).to_string());
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progressive_stream_read_and_seek_within_buffer() {
        let payload: Vec<u8> = (0..1024).map(|i| (i % 251) as u8).collect();
        let mut stream = ProgressiveMediaStream::from_bytes_for_test(payload.clone(), Some(1024), true);

        let mut head = [0u8; 16];
        assert_eq!(stream.read(&mut head).unwrap(), 16);
        assert_eq!(&head, &payload[0..16]);

        // Seek backwards
        assert_eq!(stream.seek(SeekFrom::Start(100)).unwrap(), 100);
        let mut slice = [0u8; 32];
        assert_eq!(stream.read(&mut slice).unwrap(), 32);
        assert_eq!(&slice, &payload[100..132]);

        // Seek from end
        assert_eq!(stream.seek(SeekFrom::End(-10)).unwrap(), 1014);
        let mut tail = [0u8; 16];
        assert_eq!(stream.read(&mut tail).unwrap(), 10);
        assert_eq!(&tail[..10], &payload[1014..1024]);
    }

    #[test]
    fn test_progressive_stream_clone_handle_shares_buffer_at_pos_zero() {
        let payload = vec![10u8, 20, 30, 40, 50];
        let mut s1 = ProgressiveMediaStream::from_bytes_for_test(payload, Some(5), true);
        let mut one = [0u8; 3];
        assert_eq!(s1.read(&mut one).unwrap(), 3);
        assert_eq!(one, [10, 20, 30]);

        let mut s2 = s1.clone_handle();
        let mut two = [0u8; 5];
        assert_eq!(s2.read(&mut two).unwrap(), 5);
        assert_eq!(two, [10, 20, 30, 40, 50]);
    }

    #[test]
    fn test_progressive_stream_forward_seek_waits_for_data() {
        let stream = ProgressiveMediaStream::from_bytes_for_test(vec![1, 2, 3, 4], None, false);
        let shared = Arc::clone(&stream.shared);

        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(25));
            let mut buf = shared.buf.lock().unwrap();
            buf.data.extend_from_slice(&[5, 6, 7, 8, 9, 10]);
            buf.finished = true;
            shared.condvar.notify_all();
        });

        let mut s = stream;
        assert_eq!(s.seek(SeekFrom::Start(6)).unwrap(), 6);
        let mut out = [0u8; 2];
        assert_eq!(s.read(&mut out).unwrap(), 2);
        assert_eq!(out, [7, 8]);
    }

    #[test]
    fn test_compute_buffered_percent_known_and_unknown_length() {
        assert_eq!(ProgressiveMediaStream::compute_buffered_percent(500, Some(1000)), 50.0);
        assert_eq!(ProgressiveMediaStream::compute_buffered_percent(1000, Some(1000)), 100.0);

        let p_small = ProgressiveMediaStream::compute_buffered_percent(64 * 1024, None);
        let p_mid = ProgressiveMediaStream::compute_buffered_percent(1024 * 1024, None);
        let p_large = ProgressiveMediaStream::compute_buffered_percent(10 * 1024 * 1024, None);
        assert!(p_small > 0.0 && p_small < p_mid);
        assert!((p_mid - 49.5).abs() < 0.5);
        assert!(p_large > 85.0 && p_large < 99.0);
    }

    #[test]
    fn test_resolve_local_asset_path_and_percent_decode() {
        assert_eq!(
            resolve_local_asset_path("http://asset.localhost/C%3A%2FUsers%2FMy%20Track%20%281%29.mp3"),
            Some("C:/Users/My Track (1).mp3".to_string())
        );
        assert_eq!(
            resolve_local_asset_path("https://asset.localhost/C%3A%5CMusic%5Csong.flac"),
            Some("C:\\Music\\song.flac".to_string())
        );
        #[cfg(target_os = "windows")]
        let expected_asset = Some("C:/Music/söng.mp3".to_string());
        #[cfg(not(target_os = "windows"))]
        let expected_asset = Some("/C:/Music/söng.mp3".to_string());
        assert_eq!(
            resolve_local_asset_path("asset://localhost/%2FC%3A%2FMusic%2Fs%C3%B6ng.mp3"),
            expected_asset
        );
        assert_eq!(
            resolve_local_asset_path("https://example.com/stream.mp3"),
            None
        );
    }

    #[test]
    fn test_stream_cache_3_track_ram_eviction_and_disk_spill() {
        let temp_dir = std::env::temp_dir().join(format!(
            "holad_stream_cache_test_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&temp_dir);

        let mut cache = StreamCache::with_limits(
            Some(temp_dir.clone()),
            3,
            1024 * 1024, // 1 MB spill threshold for test
            10 * 1024 * 1024,
        );

        let urls = [
            "https://example.com/track1.mp3",
            "https://example.com/track2.mp3",
            "https://example.com/track3.mp3",
            "https://example.com/track4.mp3",
        ];

        for (idx, url) in urls.iter().take(3).enumerate() {
            let data = vec![(idx as u8) + 1; 128];
            let stream = ProgressiveMediaStream::from_bytes_for_test(data, Some(128), true);
            cache.insert(
                (*url).to_string(),
                MediaInput::Progressive(stream),
                120.0 + idx as f64,
                Arc::new(AtomicBool::new(false)),
            );
        }

        assert_eq!(cache.ram_len(), 3);
        assert!(cache.contains_ram(urls[0]));
        assert!(cache.contains_ram(urls[1]));
        assert!(cache.contains_ram(urls[2]));

        // Inserting 4th track must evict track1 (LRU) from RAM and spill it to disk
        let stream4 = ProgressiveMediaStream::from_bytes_for_test(vec![4u8; 128], Some(128), true);
        cache.insert(
            urls[3].to_string(),
            MediaInput::Progressive(stream4),
            123.0,
            Arc::new(AtomicBool::new(false)),
        );

        assert_eq!(cache.ram_len(), 3);
        assert!(!cache.contains_ram(urls[0]));
        assert!(cache.contains_ram(urls[1]));
        assert!(cache.contains_ram(urls[2]));
        assert!(cache.contains_ram(urls[3]));

        // Wait for background spill to finish, then verify track1 was spilled to disk
        cache.flush_spills();
        let spilled_path = StreamCache::cache_path_for_url(&temp_dir, urls[0]);
        assert!(spilled_path.exists());

        // Re-loading track1 should hit disk cache as MediaInput::Local and promote it back into RAM
        let (mut loaded_input, _, _) = cache.get(urls[0]).expect("track1 should load from disk cache");
        match loaded_input {
            MediaInput::Local { .. } => {}
            MediaInput::Progressive(_) => panic!("Expected Local BufReader<File> from disk cache"),
        }
        let mut buf = Vec::new();
        loaded_input.read_to_end(&mut buf).unwrap();
        assert_eq!(buf, vec![1u8; 128]);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
