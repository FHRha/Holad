export type AudioState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'stalled' | 'ended' | 'error';

export type CrossfadeCurve = 'equalPower' | 'linear';

export interface VolumeState {
    master: number;
    track: number;
    category: number;
}

export interface AudioEngineSettings {
    isCrossfadeEnabled: boolean;
    crossfadeDuration: number; // in seconds (1 - 12)
    crossfadeCurve: CrossfadeCurve;
    isGaplessEnabled: boolean;
    isLoudnessNormalizationEnabled: boolean;
    preloadNextTrack: boolean;
}

export interface TransitionOptions {
    duration?: number;
    curve?: CrossfadeCurve;
    immediate?: boolean;
    isAutoSkip?: boolean;
}

export interface PlayTrackOptions {
    startTime?: number;
    immediate?: boolean;
    transitionDuration?: number;
}

export interface BufferedRange {
    start: number;
    end: number;
}

export interface IAudioDeck {
    readonly id: string;
    readonly element: HTMLAudioElement;
    state: AudioState;
    
    load(src: string, position?: number): Promise<void>;
    play(): Promise<void>;
    pause(): void;
    seek(positionSeconds: number): void;
    setVolume(volume: number): void;
    setPlaybackRate(rate: number): void;
    setLoop(loop: boolean): void;
    
    getCurrentTime(): number;
    getDuration(): number;
    getState(): AudioState;
    getBufferedRanges(): BufferedRange[];
    getBufferedPercent(): number;
    
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    destroy(): void;
}

export interface IWebAudioPipeline {
    readonly context: AudioContext;
    readonly masterGainNode: GainNode;
    readonly compressorNode: DynamicsCompressorNode;
    readonly analyserNode: AnalyserNode;
    
    attachDeck(deckIndex: 0 | 1, element: HTMLAudioElement): void;
    setDeckGain(deckIndex: 0 | 1, gain: number, rampDuration?: number): void;
    setMasterVolume(volume: number, multiplier?: number, rampDuration?: number): void;
    setNormalizationEnabled(enabled: boolean): void;
    unlockContext(): Promise<void>;
    getFrequencyData(array: Uint8Array): void;
    getDeckGain(deckIndex: 0 | 1): number;
    destroy(): void;
}

export interface IAudioEngine {
    initialize(deckElements: [HTMLAudioElement, HTMLAudioElement]): void;
    playTrack(track: any, options?: PlayTrackOptions): Promise<void>;
    pause(): void;
    resume(): Promise<void>;
    seek(positionSeconds: number): void;
    setVolume(volume: number, isMobile?: boolean): void;
    setVolumeMultiplier(multiplier: number): void;
    updateSettings(settings: Partial<AudioEngineSettings>): void;
    preloadNextTrack(track: any): Promise<void>;
    getDeck(index: number): IAudioDeck | undefined;
    getActiveDeckIndex(): number;
    getWebAudioPipeline(): IWebAudioPipeline | undefined;
    destroy(): void;
}

export interface IAudioCore {
    // Core playback methods
    play(url: string, position?: number): Promise<void>;
    pause(): void;
    resume(): Promise<void>;
    seek(time: number): void;
    
    // Volume & fading
    setVolume(volume: number): void; // Expects 0.0 to 1.0
    setPlaybackRate(rate: number): void;
    setLoop(loop: boolean): void;
    
    // Gapless / Crossfade support
    crossfadeTo(url: string, durationSeconds: number, position?: number): Promise<void>;
    
    // Preload
    preload?(url: string): Promise<void>;
    
    // State
    getCurrentTime(): number;
    getDuration(): number;
    getState(): AudioState;

    // Events
    on(event: 'timeupdate', listener: (time: number) => void): void;
    on(event: 'statechange', listener: (state: AudioState) => void): void;
    on(event: 'ended', listener: () => void): void;
    on(event: 'durationchange', listener: (duration: number) => void): void;
    on(event: 'error', listener: (error: any) => void): void;
    on(event: string, listener: (...args: any[]) => void): void;
    
    // Extensibility (for visualizer)
    getAudioContext?(): AudioContext | undefined;
    getMediaElementSource?(): MediaElementAudioSourceNode | undefined;
    getAnalyserNode?(): AnalyserNode | undefined;

    off(event: string, listener: (...args: any[]) => void): void;
    
    // Lifecycle
    destroy(): void;
}
