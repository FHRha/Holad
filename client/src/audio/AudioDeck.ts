import type { AudioState, BufferedRange, IAudioDeck } from './types';
import { isCapacitor } from '../utils/StorageManager';

export const isLocalMediaUrl = (url: string): boolean => {
    if (!url) return false;
    return (
        url.startsWith('http://asset.localhost') ||
        url.startsWith('asset://') ||
        url.startsWith('_capacitor_file_') ||
        url.includes('/_capacitor_file_') ||
        url.startsWith('capacitor://') ||
        url.startsWith('file://') ||
        url.startsWith('blob:') ||
        url.startsWith('data:')
    );
};

export class AudioDeck implements IAudioDeck {
    public readonly id: string;
    public element: HTMLAudioElement;
    private primaryElement: HTMLAudioElement;
    public state: AudioState = 'idle';
    public targetPosition: number = 0;

    private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
    private boundHandlers: Map<string, (...args: any[]) => void> = new Map();
    private isTainted: boolean = false;
    private rawSrc: string = '';

    constructor(id: string, element?: HTMLAudioElement) {
        this.id = id;
        if (element) {
            this.element = element;
        } else {
            this.element = typeof document !== 'undefined' ? document.createElement('audio') : (new Audio() as HTMLAudioElement);
            this.element.style.display = 'none';
            this.element.id = `audio-deck-${id}`;
            if (typeof document !== 'undefined' && document.body) {
                document.body.appendChild(this.element);
            }
        }
        
        this.primaryElement = this.element;

        if (isCapacitor()) {
            this.element.removeAttribute('crossorigin');
            this.element.crossOrigin = null;
        } else {
            this.element.crossOrigin = 'anonymous';
        }
        this.element.preload = 'auto';
        (this.element as any).playsInline = true;
        this.element.setAttribute('playsinline', 'true');

        this.attachMediaEvents();
    }

    private attachMediaEvents(): void {
        const register = (event: string, handler: (...args: any[]) => void) => {
            this.boundHandlers.set(event, handler);
            this.element.addEventListener(event, handler);
        };

        register('loadstart', () => {
            this.setState('loading');
        });

        register('waiting', () => {
            this.setState('stalled');
            this.emit('waiting');
        });

        register('canplay', () => {
            if (this.state === 'loading' || this.state === 'stalled') {
                this.setState(this.element.paused ? 'ready' : 'playing');
            }
            this.emit('canplay');
        });

        register('canplaythrough', () => {
            if (this.state === 'loading' || this.state === 'stalled') {
                this.setState(this.element.paused ? 'ready' : 'playing');
            }
            this.emit('canplaythrough');
        });

        register('play', () => {
            this.setState('playing');
            this.emit('play');
        });

        register('playing', () => {
            this.setState('playing');
            this.emit('playing');
        });

        register('pause', () => {
            if (this.state !== 'ended') {
                this.setState('paused');
            }
            this.emit('pause');
        });

        register('ended', () => {
            this.setState('ended');
            this.emit('ended');
        });

        register('timeupdate', () => {
            this.emit('timeupdate', this.getCurrentTime());
        });

        register('durationchange', () => {
            this.emit('durationchange', this.getDuration());
        });

        register('progress', () => {
            this.emit('progress', this.getBufferedPercent());
        });

        register('seeking', () => {
            this.emit('seeking');
        });

        register('seeked', () => {
            this.emit('seeked');
        });

        register('error', (e: any) => {
            const actualError = (e && e.error) || this.element.error || e;
            const errMsg = actualError instanceof Error ? actualError.message : (actualError && typeof actualError.message === 'string' ? actualError.message : String(actualError));
            const isFatalOrDecoder = errMsg.includes('MEDIA_ERR_DECODE') || errMsg.includes('decoder') || errMsg.includes('corrupt') || errMsg.includes('Decode');
            
            if (!isFatalOrDecoder && !this.isTainted && this.element === this.primaryElement && this.element.getAttribute('crossorigin') === 'anonymous') {
                console.warn('AudioDeck: Error with crossOrigin anonymous, falling back to secondary element');
                
                const oldElement = this.element;
                const newElement = new Audio();
                newElement.crossOrigin = null;
                newElement.preload = 'auto';
                (newElement as any).playsInline = true;
                newElement.setAttribute('playsinline', 'true');
                newElement.style.display = 'none';
                newElement.id = `audio-deck-${this.id}-fallback`;
                if (typeof document !== 'undefined' && document.body) {
                    document.body.appendChild(newElement);
                }
                
                newElement.src = oldElement.src;
                newElement.volume = oldElement.volume;
                newElement.playbackRate = oldElement.playbackRate;
                
                this.boundHandlers.forEach((handler, event) => {
                    oldElement.removeEventListener(event, handler);
                    newElement.addEventListener(event, handler);
                });
                
                this.element = newElement;
                this.isTainted = true;
                
                const currentTime = this.state === 'loading' ? this.targetPosition : oldElement.currentTime;
                
                oldElement.pause();
                oldElement.removeAttribute('src');
                oldElement.load();
                
                this.element.load();
                this.element.currentTime = currentTime;
                this.element.play().catch(() => {});
                return;
            }
            this.setState('error');
            const err = this.element.error || e;
            this.emit('error', err);
        });
    }

    private setState(newState: AudioState): void {
        if (this.state !== newState) {
            this.state = newState;
            this.emit('statechange', newState);
        }
    }

    public async load(src: string, position: number = 0): Promise<void> {
        try {
            this.targetPosition = position;
            this.setState('loading');
            
            if (this.element !== this.primaryElement) {
                this.boundHandlers.forEach((handler, event) => {
                    this.element.removeEventListener(event, handler);
                    this.primaryElement.addEventListener(event, handler);
                });
                this.element.pause();
                this.element.removeAttribute('src');
                this.element.load();
                
                if (this.element.parentNode) {
                    try { this.element.parentNode.removeChild(this.element); } catch {}
                }
                
                this.element = this.primaryElement;
                (this as any).isTainted = false;
            }
            
            if (isLocalMediaUrl(src) || isCapacitor()) {
                this.element.removeAttribute('crossorigin');
                this.element.crossOrigin = null;
            } else {
                this.element.crossOrigin = 'anonymous';
            }

            this.element.preload = 'auto';

            let isSameSource = Boolean(this.rawSrc && this.rawSrc === src);
            if (!isSameSource && typeof window !== 'undefined' && src) {
                try {
                    const resolvedNew = new URL(src, window.location.href).href;
                    const resolvedCurrent = this.element.src ? new URL(this.element.src, window.location.href).href : '';
                    if (resolvedNew && resolvedCurrent && resolvedNew === resolvedCurrent) {
                        isSameSource = true;
                    }
                } catch {}
            }

            this.rawSrc = src;

            if (!isSameSource) {
                this.element.src = src;
                this.element.load();
            } else {
                try {
                    if (Math.abs(this.element.currentTime - position) > 0.05) {
                        this.element.currentTime = position;
                    }
                } catch {}
            }
        
            // Force the UI to reset immediately
            this.emit('timeupdate', position);
            
            await new Promise<void>((resolve, reject) => {
                if (this.element.readyState >= 1) {
                    try {
                        this.element.currentTime = position;
                    } catch {}
                    resolve();
                } else {
                    let cleanup = () => {};
                    // Safety timeout: on mobile WebViews, if metadata takes >1500ms, resolve so play() can start immediately
                    const timer = setTimeout(() => {
                        cleanup();
                        try {
                            this.element.currentTime = position;
                        } catch {}
                        resolve();
                    }, 1500);

                    const onReady = () => {
                        cleanup();
                        try {
                            this.element.currentTime = position;
                        } catch {}
                        resolve();
                    };

                    const onError = () => {
                        cleanup();
                        reject(this.element.error || new Error('Audio element load error'));
                    };

                    cleanup = () => {
                        clearTimeout(timer);
                        this.element.removeEventListener('loadedmetadata', onReady);
                        this.element.removeEventListener('loadeddata', onReady);
                        this.element.removeEventListener('canplay', onReady);
                        this.element.removeEventListener('durationchange', onReady);
                        this.element.removeEventListener('error', onError);
                    };

                    this.element.addEventListener('loadedmetadata', onReady);
                    this.element.addEventListener('loadeddata', onReady);
                    this.element.addEventListener('canplay', onReady);
                    this.element.addEventListener('durationchange', onReady);
                    this.element.addEventListener('error', onError);
                }
            });
        } catch (err) {
            this.setState('error');
            this.emit('error', err);
        }
    }

    public async play(): Promise<void> {
        try {
            const playPromise = this.element.play();
            if (playPromise !== undefined) {
                await playPromise;
            }
            this.setState('playing');
        } catch (err: any) {
            // Check if error is an intentional abort
            if (err?.name === 'AbortError') {
                return;
            }
            if (this.element.getAttribute('crossorigin') === 'anonymous') {
                console.warn('AudioDeck: Play error with crossOrigin, retrying without it');
                this.element.removeAttribute('crossorigin');
                this.element.crossOrigin = null;
                const currentTime = this.state === 'loading' ? this.targetPosition : this.element.currentTime;
                this.element.load();
                this.element.currentTime = currentTime;
                try {
                    await this.element.play();
                    this.setState('playing');
                    return;
                } catch (retryErr: any) {
                    this.setState('error');
                    this.emit('error', retryErr);
                    throw retryErr;
                }
            }
            this.setState('error');
            this.emit('error', err);
            throw err;
        }
    }

    public pause(): void {
        this.element.pause();
        if (this.state !== 'ended') {
            this.setState('paused');
        }
    }

    public getRawSrc(): string {
        return this.rawSrc;
    }

    public releaseMedia(): void {
        this.pause();
        this.rawSrc = '';
        this.element.removeAttribute('src');
        this.element.load();
        this.setState('idle');
    }

    public seek(positionSeconds: number, maxDuration?: number): void {
        if (!isFinite(positionSeconds) || isNaN(positionSeconds)) return;
        this.targetPosition = positionSeconds;
        const deckDuration = this.getDuration();
        const effectiveDuration = (typeof maxDuration === 'number' && maxDuration > 0 && isFinite(maxDuration))
            ? maxDuration
            : (deckDuration > 0 ? deckDuration : 0);
        const safePosition = Math.max(0, effectiveDuration > 0 ? Math.min(positionSeconds, effectiveDuration) : positionSeconds);
        try {
            this.element.currentTime = safePosition;
        } catch {
            // Some environments throw if metadata has not loaded yet
        }
    }

    public setVolume(volume: number): void {
        const clamped = Math.max(0, Math.min(1, volume));
        this.element.volume = clamped;
    }

    public setPlaybackRate(rate: number): void {
        this.element.playbackRate = Math.max(0.25, Math.min(4.0, rate));
    }

    public setLoop(loop: boolean): void {
        this.element.loop = loop;
    }

    public getCurrentTime(): number {
        if (this.element.seeking && this.targetPosition > 0) {
            return this.targetPosition;
        }
        return this.element.currentTime || 0;
    }

    public getDuration(): number {
        return this.element.duration && !isNaN(this.element.duration) && isFinite(this.element.duration) ? this.element.duration : 0;
    }

    public getState(): AudioState {
        return this.state;
    }

    public getBufferedRanges(): BufferedRange[] {
        const buffered = this.element.buffered;
        if (!buffered || buffered.length === 0) {
            return [];
        }

        const ranges: BufferedRange[] = [];
        for (let i = 0; i < buffered.length; i++) {
            ranges.push({
                start: buffered.start(i),
                end: buffered.end(i),
            });
        }
        return ranges;
    }

    public getBufferedPercent(knownDuration?: number): number {
        const deckDuration = this.getDuration();
        const duration = (typeof knownDuration === 'number' && knownDuration > 0 && isFinite(knownDuration))
            ? knownDuration
            : deckDuration;
        if (duration <= 0) return 0;

        const buffered = this.element.buffered;
        if (!buffered || buffered.length === 0) return 0;

        try {
            const end = buffered.end(buffered.length - 1);
            return Math.min(100, Math.max(0, (end / duration) * 100));
        } catch {
            return 0;
        }
    }

    public on(event: string, listener: (...args: any[]) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
    }

    public off(event: string, listener: (...args: any[]) => void): void {
        const eventSet = this.listeners.get(event);
        if (eventSet) {
            eventSet.delete(listener);
        }
    }

    public emit(event: string, ...args: any[]): void {
        const eventSet = this.listeners.get(event);
        if (eventSet) {
            eventSet.forEach((listener) => {
                try {
                    listener(...args);
                } catch (e) {
                    console.error(`Error in deck ${this.id} event listener for ${event}:`, e);
                }
            });
        }
    }

    public destroy(): void {
        this.pause();
        this.rawSrc = '';
        this.element.src = '';
        
        // Remove all attached media event listeners
        this.boundHandlers.forEach((handler, event) => {
            this.element.removeEventListener(event, handler);
        });
        this.boundHandlers.clear();
        this.listeners.clear();
        this.setState('idle');
    }
}
