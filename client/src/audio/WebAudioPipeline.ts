import type { IWebAudioPipeline } from './types';

export class WebAudioPipeline implements IWebAudioPipeline {
    public readonly context: AudioContext;
    public readonly masterGainNode: GainNode;
    public readonly compressorNode: DynamicsCompressorNode;
    public readonly analyserNode: AnalyserNode;

    private deckSources: [MediaElementAudioSourceNode | null, MediaElementAudioSourceNode | null] = [null, null];
    private deckGains: [GainNode, GainNode];
    private normalizationEnabled: boolean = true;
    private masterVolume: number = 1.0;
    private volumeMultiplier: number = 1.0;

    constructor() {
        // Reuse global context or create new
        this.context = (window as any)._globalAudioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
        if (!(window as any)._globalAudioContext) {
            (window as any)._globalAudioContext = this.context;
        }

        // Create master gain
        this.masterGainNode = this.context.createGain();
        this.masterGainNode.gain.setValueAtTime(1.0, this.context.currentTime);

        // Create dynamics compressor for Loudness Normalization
        this.compressorNode = this.context.createDynamicsCompressor();
        this.compressorNode.threshold.setValueAtTime(-18, this.context.currentTime);
        this.compressorNode.knee.setValueAtTime(30, this.context.currentTime);
        this.compressorNode.ratio.setValueAtTime(3, this.context.currentTime);
        this.compressorNode.attack.setValueAtTime(0.003, this.context.currentTime);
        this.compressorNode.release.setValueAtTime(0.25, this.context.currentTime);

        // Create analyser node for visualizer
        this.analyserNode = this.context.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = 0.8;

        // Create dedicated deck gain nodes
        const gain0 = this.context.createGain();
        gain0.gain.setValueAtTime(1.0, this.context.currentTime);
        const gain1 = this.context.createGain();
        gain1.gain.setValueAtTime(1.0, this.context.currentTime);
        this.deckGains = [gain0, gain1];

        // Wire graph:
        // Deck Gains -> Compressor -> Master Gain -> Analyser -> Destination
        this.reconnectGraph();
    }

    private reconnectGraph(): void {
        try {
            // Disconnect deck gains first
            this.deckGains[0].disconnect();
            this.deckGains[1].disconnect();
            this.compressorNode.disconnect();
            this.masterGainNode.disconnect();
            this.analyserNode.disconnect();

            if (this.normalizationEnabled) {
                // Route through compressor
                this.deckGains[0].connect(this.compressorNode);
                this.deckGains[1].connect(this.compressorNode);
                this.compressorNode.connect(this.masterGainNode);
            } else {
                // Bypass compressor directly to master gain
                this.deckGains[0].connect(this.masterGainNode);
                this.deckGains[1].connect(this.masterGainNode);
            }

            this.masterGainNode.connect(this.analyserNode);
            this.analyserNode.connect(this.context.destination);
        } catch (e) {
            console.warn('WebAudioPipeline reconnectGraph warning:', e);
        }
    }

    public attachDeck(deckIndex: 0 | 1, element: HTMLAudioElement): void {
        try {
            // Check if element already has a source node attached
            const audioEl = element as any;
            let source = audioEl._sourceNode;

            if (!source) {
                source = this.context.createMediaElementSource(element);
                audioEl._sourceNode = source;
            }

            this.deckSources[deckIndex] = source;
            source.connect(this.deckGains[deckIndex]);
        } catch (e) {
            console.warn(`WebAudioPipeline attachDeck ${deckIndex} warning:`, e);
        }
    }

    public setDeckGain(deckIndex: 0 | 1, gain: number, rampDuration: number = 0): void {
        const safeGain = typeof gain === 'number' && !isNaN(gain) && Number.isFinite(gain) ? gain : 0;
        const target = Math.max(0, Math.min(1, safeGain));
        const gainParam = this.deckGains[deckIndex].gain;
        const now = this.context.currentTime;

        if (typeof (gainParam as any).cancelAndHoldAtTime === 'function') {
            (gainParam as any).cancelAndHoldAtTime(now);
        } else {
            const currentValue = gainParam.value;
            gainParam.cancelScheduledValues(now);
            gainParam.setValueAtTime(currentValue, now);
        }

        if (rampDuration > 0) {
            gainParam.linearRampToValueAtTime(target, now + rampDuration);
        } else {
            gainParam.setTargetAtTime(target, now, 0.015);
        }
    }

    public getDeckGain(deckIndex: 0 | 1): number {
        return this.deckGains[deckIndex].gain.value;
    }

    public setMasterVolume(volume: number, multiplier: number = 1.0, rampDuration: number = 0): void {
        const safeVol = typeof volume === 'number' && !isNaN(volume) && Number.isFinite(volume) ? volume : 0;
        const safeMul = typeof multiplier === 'number' && !isNaN(multiplier) && Number.isFinite(multiplier) ? multiplier : 1.0;
        this.masterVolume = Math.max(0, Math.min(1, safeVol));
        this.volumeMultiplier = Math.max(0, safeMul);
        const finalGain = this.masterVolume * this.volumeMultiplier;

        const gainParam = this.masterGainNode.gain;
        const now = this.context.currentTime;

        if (typeof (gainParam as any).cancelAndHoldAtTime === 'function') {
            (gainParam as any).cancelAndHoldAtTime(now);
        } else {
            const currentValue = gainParam.value;
            gainParam.cancelScheduledValues(now);
            gainParam.setValueAtTime(currentValue, now);
        }

        if (rampDuration > 0) {
            gainParam.linearRampToValueAtTime(finalGain, now + rampDuration);
        } else {
            gainParam.setTargetAtTime(finalGain, now, 0.015);
        }
    }

    public setNormalizationEnabled(enabled: boolean): void {
        if (this.normalizationEnabled !== enabled) {
            this.normalizationEnabled = enabled;
            this.reconnectGraph();
        }
    }

    public async unlockContext(): Promise<void> {
        if (this.context.state === 'suspended') {
            await this.context.resume().catch((e) => console.warn('AudioContext unlock failed:', e));
        }
    }

    public getFrequencyData(array: any): void {
        this.analyserNode.getByteFrequencyData(array);
    }

    public destroy(): void {
        try {
            this.deckSources.forEach((src) => {
                if (src) src.disconnect();
            });
            this.deckGains.forEach((g) => g.disconnect());
            this.compressorNode.disconnect();
            this.masterGainNode.disconnect();
            this.analyserNode.disconnect();
        } catch (e) {
            console.warn('WebAudioPipeline destruction warning:', e);
        }
    }
}
