use std::f32::consts::PI;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};
use rodio::source::SeekError;
use rodio::{ChannelCount, SampleRate, Source};
use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};
use tauri::ipc::Channel;

pub const FFT_SIZE: usize = 256;
pub const BIN_COUNT: usize = FFT_SIZE / 2;
const RINGBUF_CAPACITY: usize = 4096;
const SMOOTHING: f32 = 0.8;
const MIN_DB: f32 = -100.0;
const MAX_DB: f32 = -30.0;

/// Audio `Source` wrapper that taps decoded audio, downmixes frames to mono,
/// and pushes samples into a lock-free ring buffer when the visualizer is active.
pub struct VisualizerTapSource<S>
where
    S: Source<Item = f32>,
{
    inner: S,
    active: Arc<AtomicBool>,
    producer: Arc<Mutex<HeapProd<f32>>>,
    channels: usize,
    ch_accum: f32,
    ch_idx: usize,
}

impl<S> VisualizerTapSource<S>
where
    S: Source<Item = f32>,
{
    pub fn new(inner: S, active: Arc<AtomicBool>, producer: Arc<Mutex<HeapProd<f32>>>) -> Self {
        let channels = inner.channels().get().max(1) as usize;
        Self {
            inner,
            active,
            producer,
            channels,
            ch_accum: 0.0,
            ch_idx: 0,
        }
    }
}

impl<S> Iterator for VisualizerTapSource<S>
where
    S: Source<Item = f32>,
{
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.inner.next()?;

        if self.active.load(Ordering::Relaxed) {
            self.ch_accum += sample;
            self.ch_idx += 1;
            if self.ch_idx >= self.channels {
                let mono = self.ch_accum / (self.channels as f32);
                self.ch_accum = 0.0;
                self.ch_idx = 0;

                if let Ok(mut prod) = self.producer.try_lock() {
                    let _ = prod.try_push(mono);
                }
            }
        } else {
            self.ch_accum = 0.0;
            self.ch_idx = 0;
        }

        Some(sample)
    }
}

impl<S> Source for VisualizerTapSource<S>
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
        self.ch_accum = 0.0;
        self.ch_idx = 0;
        self.inner.try_seek(pos)
    }
}

/// Builds a 256-point periodic Hann window.
pub fn build_hann_window() -> [f32; FFT_SIZE] {
    let mut win = [0.0f32; FFT_SIZE];
    for (i, w) in win.iter_mut().enumerate() {
        *w = 0.5 * (1.0 - (2.0 * PI * (i as f32) / (FFT_SIZE as f32)).cos());
    }
    win
}

/// Computes a 256-byte visualizer packet into caller-provided `fft_scratch` and `packet` buffers:
/// - bytes `0..128`: FFT magnitude spectrum scaled from `[-100, -30] dB` into `0..=255`
/// - bytes `128..256`: time-domain waveform scaled from `[-1.0, 1.0]` into `0..=255`
pub fn compute_fft_packet_into(
    time_window: &[f32; FFT_SIZE],
    smoothed_mag: &mut [f32; BIN_COUNT],
    fft: &dyn Fft<f32>,
    hann: &[f32; FFT_SIZE],
    fft_scratch: &mut [Complex<f32>],
    packet: &mut Vec<u8>,
) {
    debug_assert_eq!(fft_scratch.len(), FFT_SIZE);

    for (dst, (&s, &w)) in fft_scratch.iter_mut().zip(time_window.iter().zip(hann.iter())) {
        *dst = Complex::new(s * w, 0.0);
    }

    fft.process(fft_scratch);

    packet.clear();
    let db_range = MAX_DB - MIN_DB;

    for (i, smoothed) in smoothed_mag.iter_mut().enumerate() {
        let scale = if i == 0 {
            FFT_SIZE as f32
        } else {
            (FFT_SIZE as f32) * 0.5
        };
        let mag = fft_scratch[i].norm() / scale;
        *smoothed = SMOOTHING * *smoothed + (1.0 - SMOOTHING) * mag;

        let db = if *smoothed > 1e-10 {
            20.0 * smoothed.log10()
        } else {
            -120.0
        };
        let norm = ((db - MIN_DB) / db_range).clamp(0.0, 1.0);
        packet.push((norm * 255.0).round() as u8);
    }

    // Latest 128 time-domain samples
    for &s in &time_window[BIN_COUNT..FFT_SIZE] {
        let norm = (s.clamp(-1.0, 1.0) * 0.5 + 0.5).clamp(0.0, 1.0);
        packet.push((norm * 255.0).round() as u8);
    }
}

/// Computes a 256-byte visualizer packet:
/// - bytes `0..128`: FFT magnitude spectrum scaled from `[-100, -30] dB` into `0..=255`
/// - bytes `128..256`: time-domain waveform scaled from `[-1.0, 1.0]` into `0..=255`
pub fn compute_fft_packet(
    time_window: &[f32; FFT_SIZE],
    smoothed_mag: &mut [f32; BIN_COUNT],
    fft: &dyn Fft<f32>,
    hann: &[f32; FFT_SIZE],
) -> Vec<u8> {
    let mut fft_scratch = vec![Complex::new(0.0f32, 0.0f32); FFT_SIZE];
    let mut packet = Vec::with_capacity(FFT_SIZE);
    compute_fft_packet_into(
        time_window,
        smoothed_mag,
        fft,
        hann,
        &mut fft_scratch,
        &mut packet,
    );
    packet
}

/// Manages the lock-free audio tap ring buffer and background FFT worker thread.
pub struct VisualizerEngine {
    active: Arc<AtomicBool>,
    producer: Arc<Mutex<HeapProd<f32>>>,
    channel: Arc<Mutex<Option<Channel<Vec<u8>>>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl Default for VisualizerEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl VisualizerEngine {
    pub fn new() -> Self {
        let rb = HeapRb::<f32>::new(RINGBUF_CAPACITY);
        let (prod, cons) = rb.split();

        let active = Arc::new(AtomicBool::new(false));
        let producer = Arc::new(Mutex::new(prod));
        let channel = Arc::new(Mutex::new(None));

        let worker_active = Arc::clone(&active);
        let worker_channel = Arc::clone(&channel);

        let handle = thread::Builder::new()
            .name("holad-visualizer-fft".to_string())
            .spawn(move || {
                Self::fft_loop(cons, worker_active, worker_channel);
            })
            .expect("Failed to spawn visualizer FFT thread");

        Self {
            active,
            producer,
            channel,
            worker: Mutex::new(Some(handle)),
        }
    }

    pub fn active_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.active)
    }

    pub fn producer_handle(&self) -> Arc<Mutex<HeapProd<f32>>> {
        Arc::clone(&self.producer)
    }

    pub fn start(&self, ch: Channel<Vec<u8>>) {
        {
            let mut guard = self.channel.lock().unwrap();
            *guard = Some(ch);
        }
        self.active.store(true, Ordering::Release);
        if let Ok(guard) = self.worker.lock() {
            if let Some(ref handle) = *guard {
                handle.thread().unpark();
            }
        }
    }

    pub fn stop(&self) {
        self.active.store(false, Ordering::Release);
        if let Ok(mut guard) = self.channel.lock() {
            *guard = None;
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    fn fft_loop(
        mut cons: HeapCons<f32>,
        active: Arc<AtomicBool>,
        channel: Arc<Mutex<Option<Channel<Vec<u8>>>>>,
    ) {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let hann = build_hann_window();
        let mut time_window = [0.0f32; FFT_SIZE];
        let mut smoothed_mag = [0.0f32; BIN_COUNT];
        let mut fft_scratch = vec![Complex::new(0.0f32, 0.0f32); FFT_SIZE];
        let mut packet = Vec::with_capacity(FFT_SIZE);

        loop {
            if !active.load(Ordering::Acquire) {
                // Reset smoothing state when parked
                smoothed_mag.fill(0.0);
                time_window.fill(0.0);
                // Drain stale samples
                while cons.try_pop().is_some() {}
                thread::park();
                continue;
            }

            // Drain all available samples into rolling 256-sample window
            let mut popped = 0usize;
            let mut temp = [0.0f32; 512];
            while let Some(s) = cons.try_pop() {
                temp[popped % temp.len()] = s;
                popped += 1;
            }

            if popped > 0 {
                if popped >= FFT_SIZE {
                    // Copy the most recent FFT_SIZE samples
                    let start = popped - FFT_SIZE;
                    for i in 0..FFT_SIZE {
                        time_window[i] = temp[(start + i) % temp.len()];
                    }
                } else {
                    // Shift left and append `popped` new samples
                    time_window.copy_within(popped..FFT_SIZE, 0);
                    let dst_start = FFT_SIZE - popped;
                    for i in 0..popped {
                        time_window[dst_start + i] = temp[i];
                    }
                }
            }

            compute_fft_packet_into(
                &time_window,
                &mut smoothed_mag,
                fft.as_ref(),
                &hann,
                &mut fft_scratch,
                &mut packet,
            );

            if let Ok(guard) = channel.lock() {
                if let Some(ref ch) = *guard {
                    let _ = ch.send(packet.clone());
                }
            }

            // ~41.6 Hz update rate (within 35-45 Hz target)
            thread::sleep(Duration::from_millis(24));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;
    use std::num::NonZero;

    #[test]
    fn test_visualizer_tap_downmixes_stereo_to_mono_when_active() {
        let engine = VisualizerEngine::new();
        // Manually test tap without starting FFT thread so we can inspect ringbuf
        let rb = HeapRb::<f32>::new(64);
        let (prod, mut cons) = rb.split();
        let active = Arc::new(AtomicBool::new(true));
        let prod_arc = Arc::new(Mutex::new(prod));

        let input = vec![0.8f32, 0.2f32, -0.6f32, 0.2f32];
        let src = SamplesBuffer::new(NonZero::new(2).unwrap(), NonZero::new(48000).unwrap(), input.clone());
        let tap = VisualizerTapSource::new(src, Arc::clone(&active), prod_arc);
        let out: Vec<f32> = tap.collect();

        assert_eq!(out, input);
        assert!((cons.try_pop().unwrap() - 0.5).abs() < 1e-6);
        assert!((cons.try_pop().unwrap() - (-0.2)).abs() < 1e-6);
        assert!(cons.try_pop().is_none());
        assert!(!engine.is_active());
    }

    #[test]
    fn test_visualizer_tap_noop_when_inactive() {
        let rb = HeapRb::<f32>::new(64);
        let (prod, mut cons) = rb.split();
        let active = Arc::new(AtomicBool::new(false));
        let prod_arc = Arc::new(Mutex::new(prod));

        let input = vec![0.5f32, 0.5f32];
        let src = SamplesBuffer::new(NonZero::new(2).unwrap(), NonZero::new(48000).unwrap(), input);
        let tap = VisualizerTapSource::new(src, active, prod_arc);
        let _: Vec<f32> = tap.collect();

        assert!(cons.try_pop().is_none());
    }

    #[test]
    fn test_compute_fft_packet_256_bytes_detects_sine_peak() {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        let hann = build_hann_window();
        let mut smoothed_mag = [0.0f32; BIN_COUNT];

        // Pure sine wave at bin 16 (16 cycles in 256 samples)
        let mut time_window = [0.0f32; FFT_SIZE];
        for (i, s) in time_window.iter_mut().enumerate() {
            *s = (2.0 * PI * 16.0 * (i as f32) / (FFT_SIZE as f32)).sin();
        }

        let packet = compute_fft_packet(&time_window, &mut smoothed_mag, fft.as_ref(), &hann);
        assert_eq!(packet.len(), 256);

        // Frequency bin 16 should be bright (255, since 0 dB * 0.2 = -14 dB > -30 dB)
        // while distant bin 64 should be 0.
        assert_eq!(packet[16], 255);
        assert_eq!(packet[64], 0);
    }
}
