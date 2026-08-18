import type { AudioState, BufferedRange, IAudioDeck } from './types';

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
    public readonly element: HTMLAudioElement;
    public state: AudioState = 'idle';

    private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
    private boundHandlers: Map<string, (...args: any[]) => void> = new Map();

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

        this.element.crossOrigin = 'anonymous';
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
            this.setState('loading');
            
            const isCapacitorLocal = src.includes('_capacitor_file_') || src.startsWith('capacitor://');
            if (isCapacitorLocal) {
                this.element.removeAttribute('crossorigin');
            } else {
                this.element.crossOrigin = 'anonymous';
            }

            if (this.element.src !== src) {
                this.element.src = src;
                this.element.load();
            }
        
            // Force the UI to reset immediately
            this.emit('timeupdate', position);
            
            await new Promise<void>((resolve) => {
                if (this.element.readyState >= 1) {
                    this.element.currentTime = position;
                    resolve();
                } else {
                    const onReady = () => {
                        this.element.currentTime = position;
                        this.element.removeEventListener('loadedmetadata', onReady);
                        resolve();
                    };
                    this.element.addEventListener('loadedmetadata', onReady);
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

    public seek(positionSeconds: number): void {
        const duration = this.getDuration();
        const safePosition = Math.max(0, duration > 0 ? Math.min(positionSeconds, duration) : positionSeconds);
        this.element.currentTime = safePosition;
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
        return this.element.currentTime || 0;
    }

    public getDuration(): number {
        return this.element.duration && !isNaN(this.element.duration) ? this.element.duration : 0;
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

    public getBufferedPercent(): number {
        const duration = this.getDuration();
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
