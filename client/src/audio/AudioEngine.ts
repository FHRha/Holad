import { AudioDeck } from './AudioDeck';
import { WebAudioPipeline } from './WebAudioPipeline';
import { PreloadManager } from './PreloadManager';
import { TransitionManager } from './TransitionManager';
import type { AudioEngineSettings, AudioState, IAudioCore, IAudioDeck, IAudioEngine, IWebAudioPipeline, PlayTrackOptions } from './types';

export class AudioEngine implements IAudioEngine, IAudioCore {
    private static instance: AudioEngine | null = null;

    private decks: [AudioDeck, AudioDeck];
    private activeIndex: 0 | 1 = 0;
    private pipeline: WebAudioPipeline | null = null;
    private preloadManager: PreloadManager;
    private transitionManager: TransitionManager;

    private settings: AudioEngineSettings = {
        isCrossfadeEnabled: true,
        crossfadeDuration: 3,
        crossfadeCurve: 'equalPower',
        isGaplessEnabled: false,
        isLoudnessNormalizationEnabled: true,
        preloadNextTrack: true,
    };

    private volume: number = 1.0;
    private volumeMultiplier: number = 1.0;
    private currentTrack: any = null;
    private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();

    constructor(elements?: [HTMLAudioElement, HTMLAudioElement]) {
        const deck0 = new AudioDeck('deck-0', elements?.[0]);
        const deck1 = new AudioDeck('deck-1', elements?.[1]);
        this.decks = [deck0, deck1];

        this.preloadManager = new PreloadManager(15);
        this.transitionManager = new TransitionManager();

        this.initPipeline();
        this.bindDeckEvents(0);
        this.bindDeckEvents(1);
    }

    public static getInstance(): AudioEngine {
        if (!AudioEngine.instance) {
            AudioEngine.instance = new AudioEngine();
        }
        return AudioEngine.instance;
    }

    private initPipeline(): void {
        try {
            if (this.pipeline) {
                this.pipeline.destroy();
                this.pipeline = null;
            }
            this.pipeline = new WebAudioPipeline();
            this.pipeline.attachDeck(0, this.decks[0].element);
            this.pipeline.attachDeck(1, this.decks[1].element);
            this.pipeline.setNormalizationEnabled(this.settings.isLoudnessNormalizationEnabled);
            this.pipeline.setMasterVolume(this.volume, this.volumeMultiplier);
            // We no longer force native volume to 1.0 here, because we want it to follow the master volume
            // for the fallback case.
            this.decks[0].setVolume(this.volume * this.volumeMultiplier);
            this.decks[1].setVolume(this.volume * this.volumeMultiplier);
        } catch (e) {
            console.warn('AudioEngine: Web Audio pipeline initialization fallback:', e);
            this.pipeline = null;
        }
    }

    private bindDeckEvents(deckIndex: 0 | 1): void {
        const deck = this.decks[deckIndex];

        deck.on('timeupdate', (time: number) => {
            if (deckIndex === this.activeIndex) {
                this.emit('timeupdate', time);
                this.checkPreloadThreshold(time, deck.getDuration());
            }
        });

        deck.on('durationchange', (duration: number) => {
            if (deckIndex === this.activeIndex) {
                this.emit('durationchange', duration);
            }
        });

        deck.on('progress', (percent: number) => {
            if (deckIndex === this.activeIndex) {
                this.emit('progress', percent);
            }
        });

        deck.on('statechange', (state: AudioState) => {
            if (deckIndex === this.activeIndex) {
                this.emit('statechange', state);
            }
        });

        deck.on('ended', () => {
            if (deckIndex === this.activeIndex) {
                this.emit('ended');
            }
        });

        deck.on('waiting', () => {
            if (deckIndex === this.activeIndex) {
                this.emit('buffering', true);
            }
        });

        deck.on('playing', () => {
            if (deckIndex === this.activeIndex) {
                this.emit('buffering', false);
            }
        });

        deck.on('canplay', () => {
            if (deckIndex === this.activeIndex) {
                this.emit('buffering', false);
            }
        });

        deck.on('error', (err: any) => {
            if (deckIndex === this.activeIndex) {
                this.emit('error', err);
            }
        });
    }

    private checkPreloadThreshold(currentTime: number, duration: number): void {
        if (!this.settings.preloadNextTrack || !duration || duration <= 0) return;
        
        const crossfadeSec = this.settings.isCrossfadeEnabled ? this.settings.crossfadeDuration : 0;
        if (this.preloadManager.shouldPreload(currentTime, duration, crossfadeSec)) {
            this.emit('requestPreload');
        }
    }

    public initialize(deckElements: [HTMLAudioElement, HTMLAudioElement]): void {
        this.decks[0]?.destroy();
        this.decks[1]?.destroy();

        const deck0 = new AudioDeck('deck-0', deckElements[0]);
        const deck1 = new AudioDeck('deck-1', deckElements[1]);
        this.decks = [deck0, deck1];

        this.activeIndex = 0;
        this.initPipeline();
        this.bindDeckEvents(0);
        this.bindDeckEvents(1);
    }

    public async playTrack(track: any, options: PlayTrackOptions = {}): Promise<void> {
        this.currentTrack = track;
        const streamUrl = track?.streamUrl || track?.src || (typeof track === 'string' ? track : '');
        const position = options.startTime || 0;
        const activeDeck = this.getActiveDeck();
        const standbyDeck = this.getStandbyDeck();
        const trackDuration = typeof track?.duration === 'number' && track.duration > 0 ? track.duration : undefined;

        if (this.settings.isCrossfadeEnabled && !options.immediate && (activeDeck.getState() === 'playing' || !activeDeck.element.paused)) {
            // Perform crossfade to standby deck
            const outgoingIndex = this.activeIndex;
            const incomingIndex = (1 - this.activeIndex) as 0 | 1;
            const outgoingDeck = this.decks[outgoingIndex];
            const incomingDeck = this.decks[incomingIndex];

            // R7: Immediately switch activeIndex to incoming track at crossfade start,
            // emitting timeupdate and durationchange immediately so progress slider and lyrics jump to track 2's timing
            this.activeIndex = incomingIndex;
            this.emit('timeupdate', position);
            this.emit('durationchange', trackDuration || incomingDeck.getDuration() || 0);

            if (trackDuration) {
                try {
                    (incomingDeck.element as any).duration = trackDuration;
                } catch {}
            }

            if (this.pipeline) {
                await this.pipeline.unlockContext();
            }

            await incomingDeck.load(streamUrl, position);

            const rawDuration = options.transitionDuration !== undefined ? options.transitionDuration : this.settings.crossfadeDuration;
            const effectiveDuration = trackDuration !== undefined && trackDuration < 1
                ? Math.min(rawDuration, Math.max(0.05, trackDuration / 2))
                : rawDuration;

            await this.transitionManager.performCrossfade(
                outgoingDeck,
                incomingDeck,
                { duration: effectiveDuration, curve: this.settings.crossfadeCurve },
                this.pipeline || undefined,
                outgoingIndex,
                this.volume * this.volumeMultiplier
            );
        } else if (this.settings.isGaplessEnabled && this.preloadManager.isTrackPreloaded(track?.id)) {
            // Gapless handover
            const outgoingIndex = this.activeIndex;
            const incomingIndex = (1 - this.activeIndex) as 0 | 1;
            const outgoingDeck = this.decks[outgoingIndex];
            const incomingDeck = this.decks[incomingIndex];

            this.activeIndex = incomingIndex;
            this.emit('timeupdate', position);
            this.emit('durationchange', trackDuration || incomingDeck.getDuration() || 0);

            if (trackDuration) {
                try {
                    (incomingDeck.element as any).duration = trackDuration;
                } catch {}
            }

            if (this.pipeline) {
                await this.pipeline.unlockContext();
            }

            await this.transitionManager.performGaplessHandover(
                outgoingDeck,
                incomingDeck,
                this.pipeline || undefined,
                outgoingIndex,
                this.volume * this.volumeMultiplier
            );
        } else {
            // Standard direct play
            if (this.pipeline) {
                await this.pipeline.unlockContext();
            }

            if (trackDuration) {
                try {
                    (activeDeck.element as any).duration = trackDuration;
                } catch {}
            }

            this.transitionManager.abortActiveTransition(activeDeck, standbyDeck, this.pipeline || undefined, this.activeIndex, this.volume * this.volumeMultiplier);
            await activeDeck.load(streamUrl, position);
            await activeDeck.play();
            if (this.pipeline) {
                this.pipeline.setDeckGain(this.activeIndex, 1.0, 0);
                this.pipeline.setDeckGain((1 - this.activeIndex) as 0 | 1, 0.0, 0);
            }
        }
    }

    public async play(url: string, position: number = 0): Promise<void> {
        await this.playTrack({ id: url, streamUrl: url, src: url }, { startTime: position, immediate: true });
    }

    public pause(): void {
        const wasTransitioning = this.transitionManager.getIsTransitioning();
        const activeDeck = this.getActiveDeck();
        const standbyDeck = this.getStandbyDeck();
        const targetActiveIndex = wasTransitioning ? ((1 - this.activeIndex) as 0 | 1) : this.activeIndex;
        
        this.transitionManager.abortActiveTransition(activeDeck, standbyDeck, this.pipeline || undefined, targetActiveIndex, this.volume * this.volumeMultiplier);
        this.activeIndex = targetActiveIndex;
        
        this.decks[0].pause();
        this.decks[1].pause();
    }

    public async resume(): Promise<void> {
        if (this.pipeline) {
            await this.pipeline.unlockContext();
        }
        await this.getActiveDeck().play();
    }

    public seek(positionSeconds: number): void {
        const activeDeck = this.getActiveDeck();
        const curTrackDur = typeof this.currentTrack?.duration === 'number' ? this.currentTrack.duration : 0;
        if (curTrackDur > 0 && activeDeck.getDuration() < curTrackDur) {
            try {
                (activeDeck.element as any).duration = curTrackDur;
            } catch {}
        }
        activeDeck.seek(positionSeconds);
        this.emit('timeupdate', activeDeck.getCurrentTime());
    }

    public setVolume(volume: number, _isMobile: boolean = false): void {
        const safeVol = typeof volume === 'number' && !isNaN(volume) && Number.isFinite(volume) ? volume : 1.0;
        this.volume = Math.max(0, Math.min(1, safeVol));
        if (this.pipeline) {
            this.pipeline.setMasterVolume(this.volume, this.volumeMultiplier);
        }
        this.getActiveDeck().setVolume(this.volume * this.volumeMultiplier);
        this.getStandbyDeck().setVolume(this.volume * this.volumeMultiplier);
    }

    public setVolumeMultiplier(multiplier: number): void {
        const safeMul = typeof multiplier === 'number' && !isNaN(multiplier) && Number.isFinite(multiplier) ? multiplier : 1.0;
        this.volumeMultiplier = Math.max(0, safeMul);
        if (this.pipeline) {
            this.pipeline.setMasterVolume(this.volume, this.volumeMultiplier);
        }
        this.getActiveDeck().setVolume(this.volume * this.volumeMultiplier);
        this.getStandbyDeck().setVolume(this.volume * this.volumeMultiplier);
    }

    public setPlaybackRate(rate: number): void {
        this.getActiveDeck().setPlaybackRate(rate);
        this.getStandbyDeck().setPlaybackRate(rate);
    }

    public setLoop(loop: boolean): void {
        this.getActiveDeck().setLoop(loop);
    }

    public async crossfadeTo(url: string, durationSeconds: number, position: number = 0): Promise<void> {
        await this.playTrack({ id: url, streamUrl: url, src: url }, {
            startTime: position,
            transitionDuration: durationSeconds
        });
    }

    public async preload(url: string): Promise<void> {
        await this.preloadNextTrack({ id: url, streamUrl: url, src: url });
    }

    public async preloadNextTrack(track: any): Promise<void> {
        if (!this.settings.preloadNextTrack) return;
        const standbyDeck = this.getStandbyDeck();
        await this.preloadManager.preloadTrack(track, standbyDeck);
    }

    public getCurrentTrack(): any {
        return this.currentTrack;
    }

    public updateSettings(newSettings: Partial<AudioEngineSettings>): void {
        this.settings = { ...this.settings, ...newSettings };
        if (newSettings.isCrossfadeEnabled) {
            this.settings.isGaplessEnabled = false;
        } else if (newSettings.isGaplessEnabled) {
            this.settings.isCrossfadeEnabled = false;
        }
        if (newSettings.isLoudnessNormalizationEnabled !== undefined && this.pipeline) {
            this.pipeline.setNormalizationEnabled(newSettings.isLoudnessNormalizationEnabled);
        }
    }

    public getActiveDeck(): AudioDeck {
        return this.decks[this.activeIndex];
    }

    public getStandbyDeck(): AudioDeck {
        return this.decks[(1 - this.activeIndex) as 0 | 1];
    }

    public getDeck(index: number): IAudioDeck | undefined {
        return this.decks[index as 0 | 1];
    }

    public getActiveDeckIndex(): number {
        return this.activeIndex;
    }

    public getWebAudioPipeline(): IWebAudioPipeline | undefined {
        return this.pipeline || undefined;
    }

    public getCurrentTime(): number {
        return this.getActiveDeck().getCurrentTime();
    }

    public getDuration(): number {
        return this.getActiveDeck().getDuration();
    }

    public getState(): AudioState {
        return this.getActiveDeck().getState();
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

    private emit(event: string, ...args: any[]): void {
        const set = this.eventListeners.get(event);
        if (set) {
            set.forEach((listener) => {
                try {
                    listener(...args);
                } catch (e) {
                    console.error(`AudioEngine event listener error for ${event}:`, e);
                }
            });
        }
    }

    public getAudioContext(): AudioContext | undefined {
        return this.pipeline?.context;
    }

    public getMediaElementSource(): MediaElementAudioSourceNode | undefined {
        const el = this.getActiveDeck().element as any;
        return el._sourceNode;
    }

    public getAnalyserNode(): AnalyserNode | undefined {
        return this.pipeline?.analyserNode;
    }

    public destroy(): void {
        this.transitionManager.destroy();
        this.preloadManager.reset();
        this.decks.forEach((deck) => {
            deck.destroy();
            if (deck.element) {
                try {
                    deck.element.src = '';
                    deck.element.removeAttribute('src');
                    Object.defineProperty(deck.element, 'src', { value: '', writable: true, configurable: true });
                } catch {}
            }
        });
        this.pipeline?.destroy();
        this.eventListeners.clear();
    }
}

export const getAudioEngine = () => AudioEngine.getInstance();