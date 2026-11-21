import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AudioEngineSettings, AudioState, IAudioDeck, IAudioEngine, IWebAudioPipeline, PlayTrackOptions } from './types';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';

export interface NativeAudioState {
    status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
    currentTime: number;
    duration: number;
    volume: number;
    isPlaying: boolean;
    url?: string | null;
    bufferedPercent?: number;
}

/**
 * TauriAudioBackend - Native Rust audio playback backend for Tauri (Desktop & Android).
 * Interacts with Tauri Rust commands (audio_load, audio_play, audio_pause, audio_seek, audio_set_volume)
 * and listens to Rust audio ticker events ('timeupdate', 'playback-state-changed', 'track-ended').
 */
export class TauriAudioBackend implements IAudioEngine {
    private static instance: TauriAudioBackend | null = null;

    private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
    private currentTrack: any = null;
    private isPlaying: boolean = false;
    private currentTime: number = 0;
    private duration: number = 0;
    private volume: number = 1.0;
    private volumeMultiplier: number = 1.0;
    private activeTrackId: string | null = null;
    private activeTrackUrl: string | null = null;
    private bufferedPercent: number = 100;
    private isTransitioningActive: boolean = false;
    private transitionTimeoutId: any = null;
    private unlistenFns: UnlistenFn[] = [];
    // private isInitialized

    private settings: AudioEngineSettings = {
        isCrossfadeEnabled: false,
        crossfadeDuration: 0,
        crossfadeCurve: 'equalPower',
        crossfadeTension: { x: 0.5, y: 0.707 },
        isGaplessEnabled: false,
        isLoudnessNormalizationEnabled: false,
        preloadNextTrack: false,
        compressorThreshold: -24,
        compressorRatio: 12,
        compressorAttack: 0.003,
        compressorRelease: 0.25,
    };

    private constructor() {
        this.setupEventListeners();
    }

    public static getInstance(): TauriAudioBackend {
        if (!TauriAudioBackend.instance) {
            TauriAudioBackend.instance = new TauriAudioBackend();
        }
        return TauriAudioBackend.instance;
    }

    private async setupEventListeners(): Promise<void> {
        if (typeof window === 'undefined') return;

        try {
            const unlistenTime = await listen<NativeAudioState>('timeupdate', (event) => {
                const payload = event.payload;
                if (!payload) return;
                this.currentTime = payload.currentTime;
                if (payload.duration > 0 && Math.abs(this.duration - payload.duration) > 0.5) {
                    this.duration = payload.duration;
                    this.emit('durationchange', this.duration);
                }
                if (typeof payload.bufferedPercent === 'number') {
                    this.bufferedPercent = payload.bufferedPercent;
                    this.emit('progress', this.bufferedPercent);
                    useAudioStore.getState().setBuffered(this.bufferedPercent);
                }
                this.emit('timeupdate', this.currentTime, this.activeTrackId);
            });
            this.unlistenFns.push(unlistenTime);

            const handleNativeStateChange = (payload: NativeAudioState) => {
                if (!payload) return;
                this.isPlaying = payload.isPlaying;
                this.currentTime = payload.currentTime;
                if (payload.duration > 0 && Math.abs(this.duration - payload.duration) > 0.5) {
                    this.duration = payload.duration;
                    this.emit('durationchange', this.duration);
                }
                if (typeof payload.bufferedPercent === 'number') {
                    this.bufferedPercent = payload.bufferedPercent;
                    this.emit('progress', this.bufferedPercent);
                    useAudioStore.getState().setBuffered(this.bufferedPercent);
                }

                // CRITICAL SYNC: Ensure playerStore.isPlaying is reactive and in sync with native Rust engine
                const store = usePlayerStore.getState();
                if (store.isPlaying !== payload.isPlaying) {
                    console.log(`[TauriAudioBackend] Syncing playerStore.isPlaying: ${store.isPlaying} -> ${payload.isPlaying} (status: ${payload.status})`);
                    usePlayerStore.setState({ isPlaying: payload.isPlaying });
                }

                const audioState: AudioState = payload.status === 'playing'
                    ? 'playing'
                    : payload.status === 'paused'
                    ? 'paused'
                    : payload.status === 'loading'
                    ? 'loading'
                    : 'idle';
                this.emit('statechange', audioState);

                if (payload.isPlaying) {
                    this.emit('play');
                    if (payload.status === 'playing') {
                        this.emit('playing');
                    }
                } else {
                    this.emit('pause');
                }
            };

            const unlistenState = await listen<NativeAudioState>('playback-state-changed', (event) => {
                handleNativeStateChange(event.payload);
            });
            this.unlistenFns.push(unlistenState);

            const unlistenStateAlias = await listen<NativeAudioState>('state-changed', (event) => {
                handleNativeStateChange(event.payload);
            });
            this.unlistenFns.push(unlistenStateAlias);

            const unlistenEnded = await listen<NativeAudioState>('track-ended', (event) => {
                const payload = event.payload;
                // Protection against premature or phantom ended events from fading-out tracks
                if (this.isTransitioningActive) {
                    console.log('[TauriAudioBackend] Ignoring track-ended during active crossfade transition');
                    return;
                }
                const currentUrl = this.activeTrackUrl || this.currentTrack?.streamUrl || this.currentTrack?.src;
                if (payload?.url && currentUrl && payload.url !== currentUrl) {
                    console.log(`[TauriAudioBackend] Ignoring track-ended from previous track URL: "${payload.url}" (active: "${currentUrl}")`);
                    return;
                }
                this.isPlaying = false;
                this.emit('ended', this.activeTrackId);
            });
            this.unlistenFns.push(unlistenEnded);
        } catch (err) {
            console.warn('[TauriAudioBackend] Failed to register Tauri audio event listeners:', err);
        }
    }

    public initialize(_deckElements: [HTMLAudioElement, HTMLAudioElement]): void {
        // initialized
    }

    public setCurrentTrack(track: any): void {
        this.currentTrack = track;
        this.activeTrackId = track?.id || null;
        this.activeTrackUrl = track?.streamUrl || track?.src || (typeof track === 'string' ? track : null);
    }

    public async playTrack(track: any, options: PlayTrackOptions = {}): Promise<void> {
        this.currentTrack = track;
        this.activeTrackId = track?.id || null;
        const autoplay = options.autoplay ?? true;
        this.isPlaying = autoplay;

        let streamUrl = track?.streamUrl || track?.src || (typeof track === 'string' ? track : '');
        if (!streamUrl && track?.id) {
            try {
                const { resolveTrackAudioSource } = await import('../hooks/useTrackSource');
                const resolved = await resolveTrackAudioSource(track);
                streamUrl = resolved.src;
            } catch (err) {
                console.error('[TauriAudioBackend] Failed to resolve track audio source:', err);
            }
        }

        if (!streamUrl) {
            console.warn('[TauriAudioBackend] No stream URL provided to playTrack');
            return;
        }

        this.activeTrackUrl = streamUrl;

        const startPos = options.startTime || 0;
        const isGapless = Boolean(this.settings.isGaplessEnabled);
        const shouldCrossfade = !isGapless && !options.immediate && (options.crossfade || this.settings.isCrossfadeEnabled) && this.isPlaying && autoplay;
        const crossfadeDur = options.transitionDuration || this.settings.crossfadeDuration || 2.0;
        const crossfadeCurve = this.settings.crossfadeCurve || 'equalPower';

        if (shouldCrossfade) {
            console.log(`[TauriAudioBackend] audio_crossfade initiating with url: "${streamUrl}", duration: ${crossfadeDur}, curve: ${crossfadeCurve}`);
            this.isTransitioningActive = true;
            if (this.transitionTimeoutId) clearTimeout(this.transitionTimeoutId);
            this.transitionTimeoutId = setTimeout(() => {
                this.isTransitioningActive = false;
            }, (crossfadeDur + 0.5) * 1000);

            try {
                const state = await invoke<NativeAudioState>('audio_crossfade', {
                    url: streamUrl,
                    durationSecs: crossfadeDur,
                    curve: crossfadeCurve,
                });
                console.log('[TauriAudioBackend] audio_crossfade successful, state:', state);

                if (state) {
                    this.duration = state.duration || track?.duration || 0;
                    this.currentTime = state.currentTime;
                    this.isPlaying = state.isPlaying;
                    const pct = typeof state.bufferedPercent === 'number' ? state.bufferedPercent : 100;
                    this.bufferedPercent = pct;
                    this.emit('progress', pct);
                    useAudioStore.getState().setBuffered(pct);
                }

                if (startPos > 0) {
                    console.log(`[TauriAudioBackend] audio_seek to startPos: ${startPos}`);
                    await invoke<NativeAudioState>('audio_seek', { position: startPos });
                    this.currentTime = startPos;
                }

                this.emit('timeupdate', this.currentTime, this.activeTrackId);
                if (this.duration > 0) {
                    this.emit('durationchange', this.duration);
                }
                return;
            } catch (e) {
                console.warn('[TauriAudioBackend] audio_crossfade error, falling back to audio_load:', e);
            }
        }

        console.log(`[TauriAudioBackend] audio_load initiating with url: "${streamUrl}", autoplay: ${autoplay}, startPos: ${startPos}`);
        try {
            const state = await invoke<NativeAudioState>('audio_load', {
                url: streamUrl,
                autoplay,
                position: startPos,
            });
            console.log('[TauriAudioBackend] audio_load successful, state:', state);

            if (state) {
                this.duration = state.duration || track?.duration || 0;
                this.currentTime = state.currentTime;
                this.isPlaying = state.isPlaying;
                const pct = typeof state.bufferedPercent === 'number' ? state.bufferedPercent : 100;
                this.bufferedPercent = pct;
                this.emit('progress', pct);
                useAudioStore.getState().setBuffered(pct);
            }

            this.emit('timeupdate', this.currentTime, this.activeTrackId);
            if (this.duration > 0) {
                this.emit('durationchange', this.duration);
            }
        } catch (e) {
            console.error('[TauriAudioBackend] audio_load error:', e);
            this.emit('error', e);
            throw e;
        }
    }

    public pause(): void {
        this.isPlaying = false;
        console.log('[TauriAudioBackend] Pausing playback via audio_pause');
        invoke<NativeAudioState>('audio_pause').catch((e) => {
            console.warn('[TauriAudioBackend] audio_pause error:', e);
        });
    }

    public async resume(): Promise<void> {
        const store = usePlayerStore.getState();
        if (!store.isPlaying && !this.isPlaying) {
            console.log('[TauriAudioBackend] Skipping resume() because player is paused in store');
            return;
        }
        this.isPlaying = true;
        try {
            console.log('[TauriAudioBackend] Resuming playback via audio_play');
            const state = await invoke<NativeAudioState>('audio_play');
            if (state) {
                this.isPlaying = state.isPlaying;
                this.currentTime = state.currentTime;
            }
        } catch (e: any) {
            console.warn('[TauriAudioBackend] audio_play resume error:', e);
            const errMsg = String(e?.message || e || '');
            const fallbackTrack = this.currentTrack || usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
            if (fallbackTrack && usePlayerStore.getState().isPlaying && (errMsg.includes('No audio loaded') || errMsg.includes('empty') || errMsg.includes('not loaded'))) {
                let startPos = this.currentTime;
                if (startPos <= 0) {
                    const savedTime = localStorage.getItem('holad_time');
                    const savedTrack = localStorage.getItem('holad_track');
                    if (savedTime && (!savedTrack || savedTrack === fallbackTrack.id)) {
                        const parsed = parseFloat(savedTime);
                        if (!isNaN(parsed) && parsed > 0) {
                            startPos = parsed;
                        }
                    }
                }
                console.log('[TauriAudioBackend] Fallback: reloading track in Rust engine via playTrack:', fallbackTrack.title || fallbackTrack.id, 'at pos:', startPos);
                await this.playTrack(fallbackTrack, { startTime: startPos, autoplay: true });
                return;
            }
            throw e;
        }
    }

    public seek(positionSeconds: number): void {
        const safePos = Math.max(0, positionSeconds);
        this.currentTime = safePos;
        const store = usePlayerStore.getState();
        const isCurrentlyPlaying = this.isPlaying || store.isPlaying;

        // If player is paused and no track is playing, do NOT load audio or trigger autoplay on seek
        if (!isCurrentlyPlaying) {
            console.log(`[TauriAudioBackend] seek() while paused - saved currentTime: ${safePos}s without loading audio`);
            this.emit('timeupdate', safePos, this.activeTrackId);
            return;
        }

        console.log(`[TauriAudioBackend] audio_seek to position: ${safePos}`);
        invoke<NativeAudioState>('audio_seek', { position: safePos }).catch(async (e) => {
            console.warn('[TauriAudioBackend] audio_seek error:', e);
            const errMsg = String(e?.message || e || '');
            if (errMsg.includes('No audio loaded')) {
                const fallbackTrack = this.currentTrack || store.queue[store.currentIndex];
                if (fallbackTrack && (this.isPlaying || usePlayerStore.getState().isPlaying)) {
                    console.log('[TauriAudioBackend] Reloading track upon seek error (playing):', fallbackTrack.title || fallbackTrack.id);
                    try {
                        await this.playTrack(fallbackTrack, { startTime: safePos, autoplay: true });
                    } catch (err) {
                        console.error('[TauriAudioBackend] Failed fallback seek playTrack:', err);
                    }
                }
            }
        });
        this.emit('timeupdate', safePos, this.activeTrackId);
    }

    public setVolume(volume: number, _isMobile: boolean = false): void {
        const safeVol = typeof volume === 'number' && !isNaN(volume) && Number.isFinite(volume) ? volume : 1.0;
        this.volume = Math.max(0, Math.min(1, safeVol));
        const effectiveVol = this.volume * this.volumeMultiplier;
        invoke<NativeAudioState>('audio_set_volume', { volume: effectiveVol }).catch((e) => {
            console.warn('[TauriAudioBackend] audio_set_volume error:', e);
        });
    }

    public setVolumeMultiplier(multiplier: number): void {
        const safeMul = typeof multiplier === 'number' && !isNaN(multiplier) && Number.isFinite(multiplier) ? multiplier : 1.0;
        this.volumeMultiplier = Math.max(0, safeMul);
        const effectiveVol = this.volume * this.volumeMultiplier;
        invoke<NativeAudioState>('audio_set_volume', { volume: effectiveVol }).catch((e) => {
            console.warn('[TauriAudioBackend] audio_set_volume error:', e);
        });
    }

    public setPlaybackRate(_rate: number): void {
        // Rust audio playback currently runs at 1.0x native rate
    }

    public setLoop(_loop: boolean): void {
        // Loop handled at playerStore queue level
    }

    public async preloadNextTrack(track: any): Promise<void> {
        if (!track) return;
        let streamUrl = track?.streamUrl || track?.src;
        if (!streamUrl && track?.id) {
            try {
                const { resolveTrackAudioSource } = await import('../hooks/useTrackSource');
                const resolved = await resolveTrackAudioSource(track);
                streamUrl = resolved.src;
            } catch (err) {
                console.warn('[TauriAudioBackend] Failed to preload track source:', err);
            }
        }
        if (streamUrl && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
            try {
                fetch(streamUrl, { method: 'HEAD', mode: 'no-cors' }).catch(() => {});
            } catch {}
        }
    }

    public updateSettings(settings: Partial<AudioEngineSettings>): void {
        this.settings = { ...this.settings, ...settings };
        if (this.settings.isGaplessEnabled) {
            this.settings.isCrossfadeEnabled = false;
        }
    }

    public getActiveDeck(): any {
        return undefined;
    }

    public getStandbyDeck(): any {
        return undefined;
    }

    public getDeck(_index: number): IAudioDeck | undefined {
        return undefined;
    }

    public getActiveDeckIndex(): number {
        return 0;
    }

    public getActiveTrackId(): string | null {
        return this.activeTrackId;
    }

    public setDeckTrackId(_deckIndex: 0 | 1, trackId: string | null): void {
        this.activeTrackId = trackId;
    }

    public getWebAudioPipeline(): IWebAudioPipeline | undefined {
        return undefined;
    }

    public getBufferedPercent(_knownDuration?: number): number {
        return this.bufferedPercent;
    }

    public getCurrentTime(): number {
        return this.currentTime;
    }

    public getDuration(): number {
        if (this.duration > 0 && isFinite(this.duration)) return this.duration;
        const trackDur = typeof this.currentTrack?.duration === 'number' ? this.currentTrack.duration : 0;
        return trackDur > 0 && isFinite(trackDur) ? trackDur : 0;
    }

    public getState(): AudioState {
        return this.isPlaying ? 'playing' : 'paused';
    }

    public isTransitioning(): boolean {
        return this.isTransitioningActive;
    }

    public on(event: string, listener: (...args: any[]) => void): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event)!.add(listener);
    }

    public off(event: string, listener: (...args: any[]) => void): void {
        const set = this.eventListeners.get(event);
        if (set) {
            set.delete(listener);
        }
    }

    public emit(event: string, ...args: any[]): void {
        const set = this.eventListeners.get(event);
        if (set) {
            set.forEach((listener) => {
                try {
                    listener(...args);
                } catch (e) {
                    console.error(`[TauriAudioBackend] Event listener error for ${event}:`, e);
                }
            });
        }
    }

        public getAnalyserNode(): AnalyserNode | undefined {
        return undefined;
    }

    public destroy(): void {
        this.unlistenFns.forEach((fn) => fn());
        this.unlistenFns = [];
        this.eventListeners.clear();
    }
}
