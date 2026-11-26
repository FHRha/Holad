use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use rodio::source::SeekError;
use rodio::{ChannelCount, SampleRate, Source};

/// Lock-free atomic parameters for the Dynamics Compressor.
/// Defaults match `WebAudioPipeline.ts` (`threshold = -18 dB`, `knee = 30 dB`,
/// `ratio = 3.0`, `attack = 0.003 s`, `release = 0.25 s`).
pub struct CompressorParams {
    pub enabled: AtomicBool,
    pub threshold_db: AtomicU32,
    pub knee_db: AtomicU32,
    pub ratio: AtomicU32,
    pub attack_secs: AtomicU32,
    pub release_secs: AtomicU32,
}

impl Default for CompressorParams {
    fn default() -> Self {
        Self::new()
    }
}

impl CompressorParams {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(true),
            threshold_db: AtomicU32::new((-18.0f32).to_bits()),
            knee_db: AtomicU32::new(30.0f32.to_bits()),
            ratio: AtomicU32::new(3.0f32.to_bits()),
            attack_secs: AtomicU32::new(0.003f32.to_bits()),
            release_secs: AtomicU32::new(0.25f32.to_bits()),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    pub fn set_params(
        &self,
        threshold_db: Option<f32>,
        knee_db: Option<f32>,
        ratio: Option<f32>,
        attack_secs: Option<f32>,
        release_secs: Option<f32>,
    ) {
        if let Some(v) = threshold_db {
            self.threshold_db
                .store(v.clamp(-100.0, 0.0).to_bits(), Ordering::Relaxed);
        }
        if let Some(v) = knee_db {
            self.knee_db
                .store(v.clamp(0.0, 40.0).to_bits(), Ordering::Relaxed);
        }
        if let Some(v) = ratio {
            self.ratio
                .store(v.clamp(1.0, 20.0).to_bits(), Ordering::Relaxed);
        }
        if let Some(v) = attack_secs {
            self.attack_secs
                .store(v.clamp(0.0001, 1.0).to_bits(), Ordering::Relaxed);
        }
        if let Some(v) = release_secs {
            self.release_secs
                .store(v.clamp(0.001, 2.0).to_bits(), Ordering::Relaxed);
        }
    }

    #[inline]
    pub fn threshold_db(&self) -> f32 {
        f32::from_bits(self.threshold_db.load(Ordering::Relaxed))
    }

    #[inline]
    pub fn knee_db(&self) -> f32 {
        f32::from_bits(self.knee_db.load(Ordering::Relaxed))
    }

    #[inline]
    pub fn ratio(&self) -> f32 {
        f32::from_bits(self.ratio.load(Ordering::Relaxed))
    }

    #[inline]
    pub fn attack_secs(&self) -> f32 {
        f32::from_bits(self.attack_secs.load(Ordering::Relaxed))
    }

    #[inline]
    pub fn release_secs(&self) -> f32 {
        f32::from_bits(self.release_secs.load(Ordering::Relaxed))
    }
}

/// Computes target gain reduction in dB (>= 0.0) for a given input level in dB
/// using a soft-knee transfer curve.
#[inline]
pub fn compute_soft_knee_gain_reduction_db(
    input_db: f32,
    threshold_db: f32,
    knee_db: f32,
    ratio: f32,
) -> f32 {
    if ratio <= 1.0 {
        return 0.0;
    }

    let half_knee = knee_db * 0.5;
    let output_db = if knee_db > 0.0
        && input_db > (threshold_db - half_knee)
        && input_db < (threshold_db + half_knee)
    {
        let overshoot = input_db - threshold_db + half_knee;
        input_db + (1.0 / ratio - 1.0) * (overshoot * overshoot) / (2.0 * knee_db)
    } else if input_db >= (threshold_db + half_knee) {
        threshold_db + (input_db - threshold_db) / ratio
    } else {
        input_db
    };

    (input_db - output_db).max(0.0)
}

/// Stereo-linked soft-knee Dynamics Compressor `Source` wrapper.
pub struct CompressorSource<S>
where
    S: Source<Item = f32>,
{
    inner: S,
    params: Arc<CompressorParams>,
    env_gr_db: f32,
    frame_buf: Vec<f32>,
    frame_pos: usize,
    frame_len: usize,
}

impl<S> CompressorSource<S>
where
    S: Source<Item = f32>,
{
    pub fn new(inner: S, params: Arc<CompressorParams>) -> Self {
        let ch = inner.channels().get() as usize;
        Self {
            inner,
            params,
            env_gr_db: 0.0,
            frame_buf: Vec::with_capacity(ch.max(2)),
            frame_pos: 0,
            frame_len: 0,
        }
    }

    fn fill_next_frame(&mut self) -> bool {
        self.frame_buf.clear();
        self.frame_pos = 0;
        self.frame_len = 0;

        let channels = self.inner.channels().get() as usize;
        for _ in 0..channels {
            match self.inner.next() {
                Some(s) => self.frame_buf.push(s),
                None => break,
            }
        }

        if self.frame_buf.is_empty() {
            return false;
        }

        self.frame_len = self.frame_buf.len();

        // Stereo-linked peak detection across all channels in this frame
        let mut peak = 0.0f32;
        for &s in &self.frame_buf {
            let abs_s = s.abs();
            if abs_s > peak {
                peak = abs_s;
            }
        }

        let input_db = if peak > 1e-9 {
            20.0 * peak.log10()
        } else {
            -180.0
        };

        let target_gr_db = compute_soft_knee_gain_reduction_db(
            input_db,
            self.params.threshold_db(),
            self.params.knee_db(),
            self.params.ratio(),
        );

        let sr = self.inner.sample_rate().get() as f32;
        let attack_secs = self.params.attack_secs().max(0.0001);
        let release_secs = self.params.release_secs().max(0.001);

        let attack_coeff = (-1.0 / (attack_secs * sr)).exp();
        let release_coeff = (-1.0 / (release_secs * sr)).exp();

        if target_gr_db > self.env_gr_db {
            self.env_gr_db = attack_coeff * self.env_gr_db + (1.0 - attack_coeff) * target_gr_db;
        } else {
            self.env_gr_db = release_coeff * self.env_gr_db + (1.0 - release_coeff) * target_gr_db;
        }

        let gain = 10.0f32.powf(-self.env_gr_db / 20.0);
        for s in &mut self.frame_buf {
            *s *= gain;
        }

        true
    }
}

impl<S> Iterator for CompressorSource<S>
where
    S: Source<Item = f32>,
{
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        if self.frame_pos < self.frame_len {
            let sample = self.frame_buf[self.frame_pos];
            self.frame_pos += 1;
            return Some(sample);
        }

        if !self.params.enabled.load(Ordering::Relaxed) {
            self.env_gr_db = 0.0;
            return self.inner.next();
        }

        if self.fill_next_frame() {
            let sample = self.frame_buf[self.frame_pos];
            self.frame_pos += 1;
            Some(sample)
        } else {
            None
        }
    }
}

impl<S> Source for CompressorSource<S>
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
        self.frame_buf.clear();
        self.frame_pos = 0;
        self.frame_len = 0;
        self.env_gr_db = 0.0;
        self.inner.try_seek(pos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;
    use std::num::NonZero;

    #[test]
    fn test_compressor_bypass_when_disabled() {
        let params = Arc::new(CompressorParams::new());
        params.set_enabled(false);

        let input = vec![0.95f32, -0.95, 0.5, -0.5, 0.8, -0.8];
        let src = SamplesBuffer::new(NonZero::new(2).unwrap(), NonZero::new(48000).unwrap(), input.clone());
        let comp = CompressorSource::new(src, params);
        let output: Vec<f32> = comp.collect();

        assert_eq!(output, input);
    }

    #[test]
    fn test_compressor_reduces_loud_signal_and_links_stereo() {
        let params = Arc::new(CompressorParams::new());
        params.set_enabled(true);
        // Very fast attack so gain reduction engages immediately
        params.set_params(Some(-18.0), Some(30.0), Some(4.0), Some(0.0001), Some(0.1));

        // 500 stereo frames: left = 0.9, right = 0.1 (stereo-linked should attenuate both equally)
        let mut input = Vec::with_capacity(1000);
        for _ in 0..500 {
            input.push(0.9f32);
            input.push(0.1f32);
        }

        let src = SamplesBuffer::new(NonZero::new(2).unwrap(), NonZero::new(48000).unwrap(), input);
        let comp = CompressorSource::new(src, params);
        let output: Vec<f32> = comp.collect();

        assert_eq!(output.len(), 1000);
        let last_l = output[998];
        let last_r = output[999];
        assert!(last_l < 0.9, "Expected loud signal to be compressed, got {}", last_l);
        // Ratio between L and R must remain 9:1 because of stereo linking!
        assert!(((last_l / last_r) - 9.0).abs() < 0.01);
    }

    #[test]
    fn test_soft_knee_gain_reduction_curve() {
        // Below threshold - half_knee (-18 - 15 = -33 dB) -> 0 dB reduction
        assert_eq!(compute_soft_knee_gain_reduction_db(-40.0, -18.0, 30.0, 3.0), 0.0);
        // Above threshold + half_knee (-18 + 15 = -3 dB) -> linear ratio region
        // At 0 dB: output = -18 + (0 - (-18))/3 = -12 dB -> reduction = 12 dB
        let gr_0db = compute_soft_knee_gain_reduction_db(0.0, -18.0, 30.0, 3.0);
        assert!((gr_0db - 12.0).abs() < 0.001);
        // Inside knee (-18 dB): smooth positive reduction
        let gr_knee = compute_soft_knee_gain_reduction_db(-18.0, -18.0, 30.0, 3.0);
        assert!(gr_knee > 0.0 && gr_knee < 12.0);
    }
}
