import type { AudioState, IAudioCore } from './types';

export class WebAudioCore implements IAudioCore {
    private audioElement: HTMLAudioElement;
    private audioContext: AudioContext;
    private sourceNode: MediaElementAudioSourceNode;
    private gainNode: GainNode;
    private analyserNode: AnalyserNode;
    private currentState: AudioState = 'idle';
    
    constructor() {
        this.audioElement = new Audio();
        this.audioElement.style.display = 'none';
        this.audioElement.id = 'web-audio-core-element';
        this.audioElement.crossOrigin = 'anonymous';
        
        // Append to DOM to prevent strict browsers from pausing background audio
        if (typeof document !== 'undefined') {
            document.body.appendChild(this.audioElement);
        }
        
        // Use global audio context to prevent creating too many contexts
        this.audioContext = (window as any)._globalAudioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
        if (!(window as any)._globalAudioContext) {
            (window as any)._globalAudioContext = this.audioContext;
        }

        this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
        this.gainNode = this.audioContext.createGain();
        this.analyserNode = this.audioContext.createAnalyser();
        
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = 0.8;

        // Routing: AudioElement -> Source -> Gain -> Analyser -> Destination
        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioContext.destination);

        // Events will be handled by UnifiedAudioEngine
    }

    async play(url: string, position: number = 0): Promise<void> {
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume().catch(e => console.warn("Context resume failed", e));
            }
            
            if (this.audioElement.src !== url && url) {
                this.audioElement.src = url;
                this.audioElement.load();
            }
            
            if (position > 0) {
                this.audioElement.currentTime = position;
            }
            
            this.currentState = 'loading';
            
            const playPromise = this.audioElement.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.currentState = 'playing';
                }).catch(e => {
                    console.error("Audio play failed:", e);
                    this.currentState = 'error';
                });
            } else {
                this.currentState = 'playing';
            }
        // oxlint-disable-next-line
        } catch (e) {
            this.currentState = 'error';
        }
    }

    pause(): void {
        this.audioElement.pause();
    }

    async resume(): Promise<void> {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        await this.audioElement.play();
    }

    seek(time: number): void {
        this.audioElement.currentTime = time;
    }

    setVolume(volume: number): void {
        if (this.gainNode) {
            this.gainNode.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.01);
        }
    }

    setPlaybackRate(rate: number): void {
        this.audioElement.playbackRate = rate;
    }

    setLoop(loop: boolean): void {
        this.audioElement.loop = loop;
    }

    async crossfadeTo(url: string, durationSeconds: number, position: number = 0): Promise<void> {
        const currentGain = this.gainNode.gain.value;
        this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + (durationSeconds / 2));
        
        setTimeout(async () => {
            await this.play(url, position);
            this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(currentGain, this.audioContext.currentTime + (durationSeconds / 2));
        }, (durationSeconds / 2) * 1000);
    }
    
    async preload(_url: string): Promise<void> {}

    getCurrentTime(): number {
        return this.audioElement.currentTime;
    }

    getDuration(): number {
        return this.audioElement.duration || 0;
    }

    getState(): AudioState {
        return this.currentState;
    }

    on(event: 'timeupdate' | 'statechange' | 'ended' | 'durationchange' | 'error', listener: (...args: any[]) => void): void {
        if (event === 'timeupdate') {
            this.audioElement.addEventListener('timeupdate', listener);
        } else if (event === 'statechange') {
            this.audioElement.addEventListener('play', listener);
            this.audioElement.addEventListener('pause', listener);
            this.audioElement.addEventListener('waiting', listener);
            this.audioElement.addEventListener('canplay', listener);
        } else if (event === 'ended') {
            this.audioElement.addEventListener('ended', listener);
        } else if (event === 'durationchange') {
            this.audioElement.addEventListener('durationchange', listener);
        } else if (event === 'error') {
            this.audioElement.addEventListener('error', listener);
        }
    }

    off(event: 'timeupdate' | 'statechange' | 'ended' | 'durationchange' | 'error', listener: (...args: any[]) => void): void {
        if (event === 'timeupdate') {
            this.audioElement.removeEventListener('timeupdate', listener);
        } else if (event === 'statechange') {
            this.audioElement.removeEventListener('play', listener);
            this.audioElement.removeEventListener('pause', listener);
            this.audioElement.removeEventListener('waiting', listener);
            this.audioElement.removeEventListener('canplay', listener);
        } else if (event === 'ended') {
            this.audioElement.removeEventListener('ended', listener);
        } else if (event === 'durationchange') {
            this.audioElement.removeEventListener('durationchange', listener);
        } else if (event === 'error') {
            this.audioElement.removeEventListener('error', listener);
        }
    }
    
    getAudioContext(): AudioContext {
        return this.audioContext;
    }
    
    getMediaElementSource(): MediaElementAudioSourceNode {
        return this.sourceNode;
    }
    
    getAnalyserNode(): AnalyserNode {
        return this.analyserNode;
    }

    destroy(): void {
        this.pause();
        this.audioElement.src = '';
        this.sourceNode.disconnect();
        this.gainNode.disconnect();
        this.analyserNode.disconnect();
    }
}
