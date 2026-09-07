/**
 * VisualizerEngine.ts
 * High-performance audio visualization engine for Holad.
 * 
 * Features:
 * - 5 distinct visualization styles:
 *   1. 'classic': Segmented spectrum with reflection (Zero-allocation, path-batched, globalAlpha reflection).
 *   2. 'modern': Neon solid spectrum with rounded bar tops, theme accent gradient, and soft glow.
 *   3. 'wave': Smooth organic Bezier waveform with accent gradient fill and mirror reflection.
 *   4. 'radial': Circular 360-degree spectrum radiating outward from centered album art disc.
 *   5. 'peaks': Studio RTA equalizer with thin bars and floating peak caps with gravity physics.
 * 
 * Performance & Architecture:
 * - Zero-allocation render loop: pre-allocated typed arrays, precomputed palettes, trigonometric lookup tables.
 * - Dynamic CSS variable integration (--color-primary-rgb) and light/dark theme adaptation.
 * - 15-frame smooth fade-out on pause before complete rAF suspension (0% CPU/GPU idle).
 * - Page Visibility API and IntersectionObserver hooks for automatic suspension when hidden.
 * - HiDPI / Retina canvas scaling with ResizeObserver.
 */

import { subscribeWindowVisibility, getIsWindowVisible } from '../../hooks/useWindowVisibility';

export type VisualizerStyle = 'classic' | 'modern' | 'wave' | 'radial' | 'peaks';

export interface VisualizerEngineOptions {
  canvas: HTMLCanvasElement;
  getAnalyser: () => AnalyserNode | null;
  getIsPlaying: () => boolean;
  getStyle: () => VisualizerStyle;
  getCoverImage?: () => HTMLImageElement | null;
}

const MAX_BARS = 128;
const RADIAL_RAYS = 80;
const FADE_OUT_FRAMES = 15;

export class VisualizerEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private getAnalyser: () => AnalyserNode | null;
  private getIsPlaying: () => boolean;
  private getStyle: () => VisualizerStyle;
  private getCoverImage?: () => HTMLImageElement | null;

  // Animation & Lifecycle
  private rafId: number = 0;
  private isRunning: boolean = false;
  private isVisible: boolean = true;
  private isDocumentVisible: boolean = true;
  private isWindowVisible: boolean = true;
  private unsubVisibility: (() => void) | null = null;
  private fadeFrames: number = FADE_OUT_FRAMES;
  private width: number = 0;
  private height: number = 0;
  private dpr: number = 1;

  // Observers & Listeners
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private visibilityHandler: (() => void) | null = null;

  // Pre-allocated Buffers (Zero-Allocation)
  private freqData: Uint8Array = new Uint8Array(1024);
  private timeData: Uint8Array = new Uint8Array(1024);
  private rawBandValues: Float32Array = new Float32Array(MAX_BARS);
  private smoothedFreqs: Float32Array = new Float32Array(MAX_BARS);
  private smoothedWaveFront: Float32Array = new Float32Array(MAX_BARS);
  private smoothedWaveBack: Float32Array = new Float32Array(MAX_BARS);

  // Beat Punch & Bass Energy Dynamics
  private bassAverage: number = 0.2;
  private beatPunch: number = 0;

  // Peaks Physics Data
  private peakValues: Float32Array = new Float32Array(MAX_BARS);
  private peakHolds: Uint8Array = new Uint8Array(MAX_BARS);
  private peakVelocities: Float32Array = new Float32Array(MAX_BARS);

  // Precomputed Trigonometry for Radial Mode
  private radialCos: Float32Array = new Float32Array(RADIAL_RAYS);
  private radialSin: Float32Array = new Float32Array(RADIAL_RAYS);

  // Theme & Colors
  private primaryRgb: [number, number, number] = [34, 197, 94]; // Default emerald
  private isDark: boolean = true;

  // Cached Canvas Gradients
  private modernGradient: CanvasGradient | null = null;
  private waveFrontGradient: CanvasGradient | null = null;
  private waveBackGradient: CanvasGradient | null = null;
  private waveMirrorGradient: CanvasGradient | null = null;
  private peaksGradient: CanvasGradient | null = null;

  // Track Rotation for Radial Mode (slow spin)
  private vinylRotation: number = 0;

  constructor(options: VisualizerEngineOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.ctx = ctx;
    this.getAnalyser = options.getAnalyser;
    this.getIsPlaying = options.getIsPlaying;
    this.getStyle = options.getStyle;
    this.getCoverImage = options.getCoverImage;

    this.initTrigTables();
    this.updateThemeColors();
    this.setupObservers();
    this.handleResize();
  }

  /**
   * Precompute trigonometric lookup tables for radial rays.
   */
  private initTrigTables(): void {
    const step = (Math.PI * 2) / RADIAL_RAYS;
    for (let i = 0; i < RADIAL_RAYS; i++) {
      const angle = i * step - Math.PI / 2; // Start from top (12 o'clock)
      this.radialCos[i] = Math.cos(angle);
      this.radialSin[i] = Math.sin(angle);
    }
  }

  /**
   * Reads theme state and --color-primary-rgb CSS variable.
   */
  public updateThemeColors(): void {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    this.isDark = !root.classList.contains('light');

    const computed = getComputedStyle(root);
    const rgbStr = computed.getPropertyValue('--color-primary-rgb').trim();
    if (rgbStr) {
      const parts = rgbStr.split(',').map((s) => parseInt(s.trim(), 10));
      if (parts.length === 3 && !parts.some(isNaN)) {
        this.primaryRgb = [parts[0], parts[1], parts[2]];
      }
    }

    this.invalidateGradients();
  }

  /**
   * Invalidate cached gradients when size or theme colors change.
   */
  private invalidateGradients(): void {
    this.modernGradient = null;
    this.waveFrontGradient = null;
    this.waveBackGradient = null;
    this.waveMirrorGradient = null;
    this.peaksGradient = null;
  }

  /**
   * Setup lifecycle observers: ResizeObserver, IntersectionObserver, MutationObserver, Page Visibility.
   */
  private setupObservers(): void {
    if (typeof window === 'undefined') return;

    // ResizeObserver
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.canvas);

    // IntersectionObserver (pause when canvas is out of viewport)
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        this.isVisible = entry ? entry.isIntersecting : true;
        this.evaluateRunningState();
      },
      { threshold: 0.05 }
    );
    this.intersectionObserver.observe(this.canvas);

    // Page Visibility API (pause when tab is backgrounded)
    this.visibilityHandler = () => {
      this.isDocumentVisible = !document.hidden;
      this.evaluateRunningState();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // MutationObserver to track theme/style class changes on <html>
    this.themeObserver = new MutationObserver(() => {
      this.updateThemeColors();
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });

    // Window visibility subscriber (Tauri minimize / restore and web visibility)
    this.isWindowVisible = getIsWindowVisible();
    this.unsubVisibility = subscribeWindowVisibility((visible) => {
      this.isWindowVisible = visible;
      this.evaluateRunningState();
    });
  }

  /**
   * Handle canvas resize with HiDPI / Retina scale support.
   */
  public handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for optimal fillrate

    const newWidth = Math.floor(rect.width || 800);
    const newHeight = Math.floor(rect.height || 400);

    if (this.width !== newWidth || this.height !== newHeight || this.dpr !== dpr) {
      this.width = newWidth;
      this.height = newHeight;
      this.dpr = dpr;

      this.canvas.width = Math.floor(newWidth * dpr);
      this.canvas.height = Math.floor(newHeight * dpr);

      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);

      this.invalidateGradients();
    }
  }

  /**
   * Start or resume the rendering loop.
   */
  public start(): void {
    this.fadeFrames = FADE_OUT_FRAMES;
    this.evaluateRunningState();
  }

  /**
   * Stop the rendering loop immediately.
   */
  public stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.isRunning = false;
  }

  /**
   * Determine if loop should be active based on playback, visibility, and fade states.
   */
  public evaluateRunningState(): void {
    const isPlaying = this.getIsPlaying();
    const canRun = this.isVisible && this.isDocumentVisible && this.isWindowVisible;

    if (isPlaying && canRun) {
      this.fadeFrames = FADE_OUT_FRAMES;
      if (!this.isRunning) {
        this.isRunning = true;
        this.rafId = requestAnimationFrame(this.render);
      }
    } else if (canRun && this.fadeFrames > 0) {
      // Allow fade-out frames to complete
      if (!this.isRunning) {
        this.isRunning = true;
        this.rafId = requestAnimationFrame(this.render);
      }
    } else {
      this.stop();
      // Clear canvas on complete stop
      if (this.width > 0 && this.height > 0) {
        this.ctx.clearRect(0, 0, this.width, this.height);
      }
    }
  }

  /**
   * Logarithmic Octave Binning with Treble Boost & Equal-Loudness Compensation.
   * Maps 28 Hz – 16 kHz to N discrete musical bands.
   */
  private processLogarithmicBands(bufferLength: number, totalBars: number): void {
    if (bufferLength <= 0) {
      this.rawBandValues.fill(0);
      return;
    }

    const minFreq = 28;
    const maxFreq = 16000;
    const nyquist = 22050; // Standard 44.1 kHz half-sample rate
    const binSize = nyquist / bufferLength;

    for (let i = 0; i < totalBars; i++) {
      const fLow = minFreq * Math.pow(maxFreq / minFreq, i / totalBars);
      const fHigh = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / totalBars);

      const bStart = Math.min(bufferLength - 1, Math.max(0, Math.floor(fLow / binSize)));
      const bEnd = Math.min(bufferLength - 1, Math.max(bStart, Math.floor(fHigh / binSize)));

      let maxVal = 0;
      let sumVal = 0;
      let count = 0;

      for (let b = bStart; b <= bEnd; b++) {
        const val = this.freqData[b];
        if (val > maxVal) maxVal = val;
        sumVal += val;
        count++;
      }

      // 65% peak + 35% average for punchy, musical dynamics with clear valley definition
      const rawVal = count > 0 ? maxVal * 0.65 + (sumVal / count) * 0.35 : (this.freqData[bStart] || 0);

      // Balanced spectral tilt: gentle high-frequency lift (+36% from bass to treble)
      // In logarithmic binning, high bands span many FFT buckets so maxVal is naturally strong.
      const t = totalBars > 1 ? i / (totalBars - 1) : 0;
      const tilt = 0.88 + t * 0.36;
      let normalized = (rawVal / 255) * tilt;

      // Noise gate & dynamic contrast expansion
      if (normalized < 0.025) {
        normalized = 0;
      } else {
        // Power curve 1.32 gives high dynamic range: valleys dip down, peaks stand out, no flat ceiling clipping
        normalized = Math.pow(Math.min(1.0, (normalized - 0.025) / 0.975), 1.32);
      }

      this.rawBandValues[i] = normalized;
    }
  }

  /**
   * Detects bass punch / kick drum transients (first 6 octave bands: ~28–180 Hz).
   */
  private updateBeatPunch(totalBars: number): void {
    const bassCount = Math.min(6, totalBars);
    let bassSum = 0;
    for (let i = 0; i < bassCount; i++) {
      bassSum += this.rawBandValues[i];
    }
    const currentBass = bassCount > 0 ? bassSum / bassCount : 0;

    // Moving average bass energy
    this.bassAverage = this.bassAverage * 0.93 + currentBass * 0.07;

    // Kick drum / transient spike
    const delta = currentBass - this.bassAverage;
    if (delta > 0.07) {
      this.beatPunch = Math.min(1.0, this.beatPunch + delta * 2.8);
    }

    // Smooth exponential decay
    this.beatPunch *= 0.88;
    if (this.beatPunch < 0.005) this.beatPunch = 0;
  }

  /**
   * Main render loop (Zero-Allocation).
   */
  private render = (): void => {
    if (!this.isRunning) return;

    const isPlaying = this.getIsPlaying();
    if (!isPlaying) {
      this.fadeFrames--;
      if (this.fadeFrames <= 0) {
        this.stop();
        this.ctx.clearRect(0, 0, this.width, this.height);
        return;
      }
    } else {
      this.fadeFrames = FADE_OUT_FRAMES;
    }

    const analyser = this.getAnalyser();
    const bufferLength = analyser ? analyser.frequencyBinCount : 0;

    // Ensure typed buffer size matches analyser bin count
    if (bufferLength > 0 && this.freqData.length !== bufferLength) {
      this.freqData = new Uint8Array(bufferLength);
      this.timeData = new Uint8Array(bufferLength);
    }

    if (analyser && bufferLength > 0) {
      analyser.getByteFrequencyData(this.freqData as any);
      analyser.getByteTimeDomainData(this.timeData as any);
    } else {
      // Audio not yet ready or paused: clear buffers
      this.freqData.fill(0);
      this.timeData.fill(128);
    }

    // Apply fade-out multiplier if pausing
    const fadeMultiplier = this.fadeFrames / FADE_OUT_FRAMES;

    // Clear Canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    const style = this.getStyle();
    switch (style) {
      case 'classic':
        this.renderClassic(bufferLength, fadeMultiplier);
        break;
      case 'modern':
        this.renderModern(bufferLength, fadeMultiplier);
        break;
      case 'wave':
        this.renderWave(bufferLength, fadeMultiplier);
        break;
      case 'radial':
        this.renderRadial(bufferLength, fadeMultiplier);
        break;
      case 'peaks':
        this.renderPeaks(bufferLength, fadeMultiplier);
        break;
      default:
        this.renderClassic(bufferLength, fadeMultiplier);
        break;
    }

    // Continue rAF
    this.rafId = requestAnimationFrame(this.render);
  };

  // =========================================================================
  // Style 1: CLASSIC (Segmented spectrum with polished glass reflection)
  // =========================================================================
  private renderClassic(bufferLength: number, fadeMultiplier: number): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    if (width <= 0 || height <= 0) return;

    // Target 56–64 dense, beautifully proportioned bars
    const totalBars = Math.min(64, Math.max(36, Math.floor((width - 40) / 16)));
    this.processLogarithmicBands(bufferLength, totalBars);
    this.updateBeatPunch(totalBars);

    const barGap = 4;
    const totalGaps = (totalBars - 1) * barGap;
    const barWidth = Math.max(6, Math.min(14, Math.floor((width - 40 - totalGaps) / totalBars)));
    const actualTotalWidth = totalBars * barWidth + totalGaps;
    let startX = Math.floor((width - actualTotalWidth) / 2);

    const centerY = height * 0.68;
    const segmentHeight = 4;
    const segmentGap = 2.5;
    const maxSegments = Math.floor((centerY - 20) / (segmentHeight + segmentGap));

    const [r, g, b] = this.primaryRgb;
    const punchBoost = 1.0 + this.beatPunch * 0.12;

    ctx.save();

    for (let i = 0; i < totalBars; i++) {
      const rawTarget = this.rawBandValues[i] * (maxSegments * 0.88) * punchBoost * fadeMultiplier;
      const current = this.smoothedFreqs[i] || 0;
      const factor = rawTarget > current ? 0.44 : 0.18;
      const smoothedSegments = current + (rawTarget - current) * factor;
      this.smoothedFreqs[i] = smoothedSegments;

      const activeSegments = Math.min(maxSegments, Math.floor(smoothedSegments));
      const x = startX + i * (barWidth + barGap);

      // Upper segments
      for (let s = 0; s < activeSegments; s++) {
        const segRatio = s / maxSegments;
        const y = centerY - (s + 1) * (segmentHeight + segmentGap);

        // Color progression: Deep primary base -> bright neon tint -> white-hot peak
        if (segRatio > 0.85) {
          ctx.fillStyle = '#ffffff';
        } else if (segRatio > 0.6) {
          ctx.fillStyle = `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)})`;
        } else {
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        }

        ctx.globalAlpha = 1.0;
        ctx.fillRect(x, y, barWidth, segmentHeight);
      }

      // Subtle glow on the top segment
      if (activeSegments > 0) {
        const topY = centerY - activeSegments * (segmentHeight + segmentGap);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9 * fadeMultiplier;
        ctx.fillRect(x, topY, barWidth, segmentHeight);
      }

      // Glossy floor reflection (mirror segments fading exponentially)
      const reflectSegments = Math.floor(activeSegments * 0.42);
      for (let s = 0; s < reflectSegments; s++) {
        const y = centerY + 4 + s * (segmentHeight + segmentGap);
        const alpha = 0.28 * Math.pow(1 - s / reflectSegments, 1.4) * fadeMultiplier;
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, barWidth, segmentHeight);
      }
    }

    ctx.restore();
  }

  // =========================================================================
  // Style 2: MODERN (Neon capsule bars, dynamic beat bloom & glass reflection)
  // =========================================================================
  private renderModern(bufferLength: number, fadeMultiplier: number): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    if (width <= 0 || height <= 0) return;

    // 56–64 thick, rounded capsule bars
    const totalBars = Math.min(60, Math.max(36, Math.floor((width - 48) / 18)));
    this.processLogarithmicBands(bufferLength, totalBars);
    this.updateBeatPunch(totalBars);

    const barGap = 5;
    const totalGaps = (totalBars - 1) * barGap;
    const barWidth = Math.max(8, Math.min(14, Math.floor((width - 48 - totalGaps) / totalBars)));
    const actualTotalWidth = totalBars * barWidth + totalGaps;
    let startX = Math.floor((width - actualTotalWidth) / 2);

    const baselineY = height * 0.72;
    const maxHeight = baselineY * 0.82;
    const [r, g, b] = this.primaryRgb;
    const punchBoost = 1.0 + this.beatPunch * 0.14;

    // Cache gradient
    if (!this.modernGradient) {
      const grad = ctx.createLinearGradient(0, baselineY - maxHeight, 0, baselineY);
      grad.addColorStop(0, '#ffffff'); // White-hot peak
      grad.addColorStop(0.18, `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, 0.98)`);
      grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.8)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.2)`);
      this.modernGradient = grad;
    }

    ctx.save();
    ctx.fillStyle = this.modernGradient;

    // Dynamic Beat Bloom / Neon Glow
    const bloomAlpha = Math.min(0.85, 0.45 + this.beatPunch * 0.4);
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${bloomAlpha})`;
    ctx.shadowBlur = Math.round(10 + this.beatPunch * 18);

    for (let i = 0; i < totalBars; i++) {
      const targetH = this.rawBandValues[i] * maxHeight * punchBoost * fadeMultiplier;
      const current = this.smoothedFreqs[i] || 0;
      const factor = targetH > current ? 0.45 : 0.16;
      const h = current + (targetH - current) * factor;
      this.smoothedFreqs[i] = h;

      const barH = Math.max(4, h);
      const x = startX + i * (barWidth + barGap);
      const y = baselineY - barH;
      const radius = Math.min(barWidth / 2, 6);

      // Upper rounded pill bar
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, barWidth, barH, [radius, radius, 2, 2]);
      } else {
        ctx.rect(x, y, barWidth, barH);
      }
      ctx.fill();

      // Mirror reflection below baseline
      const reflectH = barH * 0.32;
      ctx.save();
      ctx.shadowBlur = 0; // Avoid double bloom on reflection
      ctx.globalAlpha = 0.22 * fadeMultiplier;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, baselineY + 4, barWidth, reflectH, [2, 2, radius, radius]);
      } else {
        ctx.rect(x, baselineY + 4, barWidth, reflectH);
      }
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // =========================================================================
  // Style 3: WAVE (Dual harmonic Bezier waves with glow line & mirror)
  // =========================================================================
  private renderWave(bufferLength: number, fadeMultiplier: number): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    if (width <= 0 || height <= 0) return;

    const pointsCount = 64;
    this.processLogarithmicBands(bufferLength, pointsCount);
    this.updateBeatPunch(pointsCount);

    const centerY = height * 0.58;
    const maxAmplitude = height * 0.36;
    const step = width / (pointsCount - 1);
    const [r, g, b] = this.primaryRgb;
    const punchBoost = 1.0 + this.beatPunch * 0.12;

    // Cache wave gradients
    if (!this.waveFrontGradient) {
      const gradFront = ctx.createLinearGradient(0, centerY - maxAmplitude, 0, centerY);
      gradFront.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
      gradFront.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.2)`);
      gradFront.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
      this.waveFrontGradient = gradFront;

      const gradBack = ctx.createLinearGradient(0, centerY - maxAmplitude * 0.75, 0, centerY);
      gradBack.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`);
      gradBack.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
      this.waveBackGradient = gradBack;

      const mirrorGrad = ctx.createLinearGradient(0, centerY, 0, centerY + maxAmplitude * 0.45);
      mirrorGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.2)`);
      mirrorGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
      this.waveMirrorGradient = mirrorGrad;
    }

    // Calculate wave points with organic bell windowing
    for (let i = 0; i < pointsCount; i++) {
      const edgeWindow = Math.sin((i / (pointsCount - 1)) * Math.PI);
      const targetAmp = this.rawBandValues[i] * maxAmplitude * edgeWindow * punchBoost * fadeMultiplier;

      // Front wave ballistics
      const prevFront = this.smoothedWaveFront[i] || 0;
      const factorFront = targetAmp > prevFront ? 0.38 : 0.16;
      this.smoothedWaveFront[i] = prevFront + (targetAmp - prevFront) * factorFront;

      // Back wave ballistics (slightly delayed for depth)
      const targetBack = targetAmp * 0.72;
      const prevBack = this.smoothedWaveBack[i] || 0;
      const factorBack = targetBack > prevBack ? 0.25 : 0.12;
      this.smoothedWaveBack[i] = prevBack + (targetBack - prevBack) * factorBack;
    }

    ctx.save();

    // 1. Draw Back Wave (Subtle depth layer)
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let i = 0; i < pointsCount - 1; i++) {
      const x0 = i * step;
      const y0 = centerY - this.smoothedWaveBack[i];
      const x1 = (i + 1) * step;
      const y1 = centerY - this.smoothedWaveBack[i + 1];
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      ctx.quadraticCurveTo(x0, y0, midX, midY);
    }
    ctx.lineTo(width, centerY - this.smoothedWaveBack[pointsCount - 1]);
    ctx.lineTo(width, centerY);
    ctx.closePath();
    ctx.fillStyle = this.waveBackGradient!;
    ctx.fill();

    // 2. Draw Front Wave Fill
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let i = 0; i < pointsCount - 1; i++) {
      const x0 = i * step;
      const y0 = centerY - this.smoothedWaveFront[i];
      const x1 = (i + 1) * step;
      const y1 = centerY - this.smoothedWaveFront[i + 1];
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      ctx.quadraticCurveTo(x0, y0, midX, midY);
    }
    ctx.lineTo(width, centerY - this.smoothedWaveFront[pointsCount - 1]);
    ctx.lineTo(width, centerY);
    ctx.closePath();
    ctx.fillStyle = this.waveFrontGradient!;
    ctx.fill();

    // 3. Draw Front Wave Glowing Stroke
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let i = 0; i < pointsCount - 1; i++) {
      const x0 = i * step;
      const y0 = centerY - this.smoothedWaveFront[i];
      const x1 = (i + 1) * step;
      const y1 = centerY - this.smoothedWaveFront[i + 1];
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      ctx.quadraticCurveTo(x0, y0, midX, midY);
    }
    ctx.lineTo(width, centerY - this.smoothedWaveFront[pointsCount - 1]);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
    ctx.lineWidth = 3;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.6 + this.beatPunch * 0.35})`;
    ctx.shadowBlur = Math.round(12 + this.beatPunch * 14);
    ctx.stroke();

    // 4. Mirror Reflection
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    for (let i = 0; i < pointsCount - 1; i++) {
      const x0 = i * step;
      const y0 = centerY + this.smoothedWaveFront[i] * 0.36;
      const x1 = (i + 1) * step;
      const y1 = centerY + this.smoothedWaveFront[i + 1] * 0.36;
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      ctx.quadraticCurveTo(x0, y0, midX, midY);
    }
    ctx.lineTo(width, centerY + this.smoothedWaveFront[pointsCount - 1] * 0.36);
    ctx.lineTo(width, centerY);
    ctx.closePath();
    ctx.fillStyle = this.waveMirrorGradient!;
    ctx.fill();

    ctx.restore();
  }

  // =========================================================================
  // Style 4: RADIAL (Beat-pulsing vinyl disc & 80 spectral rays)
  // =========================================================================
  private renderRadial(bufferLength: number, fadeMultiplier: number): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    if (width <= 0 || height <= 0) return;

    this.processLogarithmicBands(bufferLength, RADIAL_RAYS / 2);
    this.updateBeatPunch(RADIAL_RAYS / 2);

    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);
    const baseRadius = Math.max(50, minDim * 0.21);
    const maxRayLength = minDim * 0.23;
    const [r, g, b] = this.primaryRgb;

    // Beat Pulse Disc Scaling
    const diskRadius = baseRadius * (1.0 + this.beatPunch * 0.08);

    ctx.save();

    // Smooth vinyl spin when playing
    if (this.getIsPlaying()) {
      this.vinylRotation += 0.006;
      if (this.vinylRotation >= Math.PI * 2) this.vinylRotation -= Math.PI * 2;
    }

    // Outer Neon Halo Ring around Disc
    ctx.beginPath();
    ctx.arc(cx, cy, diskRadius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + this.beatPunch * 0.4})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
    ctx.shadowBlur = Math.round(12 + this.beatPunch * 16);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Vinyl Record / Album Art in Center
    ctx.beginPath();
    ctx.arc(cx, cy, diskRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();

    const coverImage = this.getCoverImage ? this.getCoverImage() : null;
    if (coverImage && coverImage.complete && coverImage.naturalWidth > 0) {
      ctx.translate(cx, cy);
      ctx.rotate(this.vinylRotation);
      ctx.drawImage(
        coverImage,
        -diskRadius,
        -diskRadius,
        diskRadius * 2,
        diskRadius * 2
      );
    } else {
      // Sleek vinyl disc placeholder with grooved concentric rings
      ctx.fillStyle = this.isDark ? '#121215' : '#e2e8f0';
      ctx.fill();

      ctx.strokeStyle = this.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 1;
      for (let cr = diskRadius * 0.35; cr < diskRadius * 0.92; cr += 10) {
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Spindle center hub
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fill();
    }
    ctx.restore(); // Restore clip

    // 80 Symmetrical Radial Spectral Rays
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.5;

    const halfRays = RADIAL_RAYS / 2;
    for (let i = 0; i < RADIAL_RAYS; i++) {
      // Symmetrical mapping: bass at bottom, sweeping upwards
      const bandIndex = i < halfRays ? i : RADIAL_RAYS - 1 - i;
      const targetLen = this.rawBandValues[bandIndex] * maxRayLength * (1.0 + this.beatPunch * 0.15) * fadeMultiplier;

      const prev = this.smoothedFreqs[i] || 0;
      const factor = targetLen > prev ? 0.42 : 0.16;
      const rayLen = prev + (targetLen - prev) * factor;
      this.smoothedFreqs[i] = rayLen;

      const r0 = diskRadius + 6;
      const r1 = r0 + Math.max(3, rayLen);

      const cos = this.radialCos[i];
      const sin = this.radialSin[i];

      const x0 = cx + cos * r0;
      const y0 = cy + sin * r0;
      const x1 = cx + cos * r1;
      const y1 = cy + sin * r1;

      const alpha = Math.min(1.0, 0.35 + (rayLen / maxRayLength) * 0.65) * fadeMultiplier;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    ctx.restore();
  }

  // =========================================================================
  // Style 5: PEAKS (Broadcast studio RTA with gravity peak caps)
  // =========================================================================
  private renderPeaks(bufferLength: number, fadeMultiplier: number): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    if (width <= 0 || height <= 0) return;

    // 56–64 studio columns
    const totalBars = Math.min(64, Math.max(36, Math.floor((width - 48) / 16)));
    this.processLogarithmicBands(bufferLength, totalBars);
    this.updateBeatPunch(totalBars);

    const barGap = 3.5;
    const totalGaps = (totalBars - 1) * barGap;
    const barWidth = Math.max(5, Math.min(12, Math.floor((width - 48 - totalGaps) / totalBars)));
    const actualTotalWidth = totalBars * barWidth + totalGaps;
    let startX = Math.floor((width - actualTotalWidth) / 2);

    const baselineY = height * 0.74;
    const maxHeight = baselineY * 0.82;
    const [r, g, b] = this.primaryRgb;
    const punchBoost = 1.0 + this.beatPunch * 0.12;

    // 4-tier studio meter gradient: Red (Peak) -> Gold (Warning) -> Primary/Emerald -> Deep base
    if (!this.peaksGradient) {
      const grad = ctx.createLinearGradient(0, baselineY - maxHeight, 0, baselineY);
      grad.addColorStop(0.0, '#ef4444'); // Overload Peak Red (top 10% ceiling)
      grad.addColorStop(0.12, '#f59e0b'); // Warning Amber (12%-30%)
      grad.addColorStop(0.42, `rgb(${r}, ${g}, ${b})`); // Primary Theme (42%-80%)
      grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0.22)`); // Noise floor base
      this.peaksGradient = grad;
    }

    const gravity = 0.42;
    const peakHoldFrames = 12;

    ctx.save();
    ctx.fillStyle = this.peaksGradient;

    for (let i = 0; i < totalBars; i++) {
      const targetH = this.rawBandValues[i] * maxHeight * punchBoost * fadeMultiplier;
      const current = this.smoothedFreqs[i] || 0;
      const factor = targetH > current ? 0.46 : 0.18;
      const barH = current + (targetH - current) * factor;
      this.smoothedFreqs[i] = barH;

      const x = startX + i * (barWidth + barGap);
      const barY = baselineY - barH;

      // Draw studio column
      ctx.fillRect(x, barY, barWidth, barH);

      // Peak Cap Ballistics with gravity and hold time
      let peakH = this.peakValues[i] || 0;
      let hold = this.peakHolds[i] || 0;
      let vel = this.peakVelocities[i] || 0;

      if (barH >= peakH) {
        peakH = barH;
        hold = peakHoldFrames;
        vel = 0;
      } else {
        if (hold > 0) {
          hold--;
        } else {
          vel += gravity;
          peakH = Math.max(0, peakH - vel);
        }
      }

      this.peakValues[i] = peakH;
      this.peakHolds[i] = hold;
      this.peakVelocities[i] = vel;

      // Draw floating white peak cap
      if (peakH > 2) {
        const capY = baselineY - peakH - 3;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, capY, barWidth, 2.5);
        ctx.fillStyle = this.peaksGradient; // Re-bind for next column
      }

      // Baseline reference tick
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
      ctx.fillRect(x, baselineY + 2, barWidth, 1.5);
      ctx.fillStyle = this.peaksGradient;
    }

    ctx.restore();
  }

  /**
   * Free all resources and observers.
   */
  public destroy(): void {
    this.stop();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (this.unsubVisibility) {
      this.unsubVisibility();
      this.unsubVisibility = null;
    }
  }
}
