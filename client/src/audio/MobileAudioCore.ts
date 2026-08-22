import type { AudioState, IAudioCore } from './types';
import { isLocalMediaUrl } from './AudioDeck';

export class MobileAudioCore implements IAudioCore {
    private audioElement: HTMLAudioElement;
    private secondaryElement: HTMLAudioElement;
    private currentState: AudioState = 'idle';
    private crossfadeInterval: any = null;
    
    private audioCtx: AudioContext | null = null;
    private primaryGain: GainNode | null = null;
    private secondaryGain: GainNode | null = null;
    private primarySource: MediaElementAudioSourceNode | null = null;
    private secondarySource: MediaElementAudioSourceNode | null = null;
    
    constructor() {
        this.audioElement = new Audio();
        this.audioElement.style.display = 'none';
        this.audioElement.id = 'mobile-audio-core-element';
        this.audioElement.crossOrigin = 'anonymous';
        
        this.secondaryElement = new Audio();
        this.secondaryElement.style.display = 'none';
        this.secondaryElement.id = 'mobile-audio-core-element-secondary';
        this.secondaryElement.crossOrigin = 'anonymous';
        
        // Append to DOM to prevent strict browsers from pausing background audio
        if (typeof document.body !== 'undefined') {
            document.body.appendChild(this.audioElement);
            document.body.appendChild(this.secondaryElement);
        }

        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.audioCtx = new AudioContextClass();
                this.primarySource = this.audioCtx.createMediaElementSource(this.audioElement);
                this.primaryGain = this.audioCtx.createGain();
                this.primarySource.connect(this.primaryGain);
                this.primaryGain.connect(this.audioCtx.destination);

                this.secondarySource = this.audioCtx.createMediaElementSource(this.secondaryElement);
                this.secondaryGain = this.audioCtx.createGain();
                this.secondarySource.connect(this.secondaryGain);
                this.secondaryGain.connect(this.audioCtx.destination);
            }
        } catch (e) {
            console.warn("Web Audio API not supported", e);
        }

        // Events will be handled by UnifiedAudioEngine
    }

    async play(url: string, position: number = 0): Promise<void> {
        try {
            if (this.crossfadeInterval) clearInterval(this.crossfadeInterval);
            
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            // Ensure volume is reset in case it was crossfaded
            if (this.primaryGain && this.audioCtx) {
                this.primaryGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
                this.primaryGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
            }
            this.audioElement.volume = 1.0;
            this.secondaryElement.pause();
        
            if (isLocalMediaUrl(url)) {
                this.audioElement.removeAttribute('crossorigin');
                this.audioElement.crossOrigin = null;
            } else {
                this.audioElement.crossOrigin = 'anonymous';
            }

            if (this.audioElement.src !== url && url) {
                this.audioElement.src = url;
                this.audioElement.load();
            }
            if (position > 0) this.audioElement.currentTime = position;
            
            this.currentState = 'loading';
            const playPromise = this.audioElement.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.currentState = 'playing';
                }).catch(e => {
                    console.error("Mobile play failed:", e);
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

    pause(): void { this.audioElement.pause(); }
    async resume(): Promise<void> { await this.audioElement.play().catch(e => console.warn(e)); }
    seek(time: number): void { this.audioElement.currentTime = time; }
    
    setVolume(volume: number): void {
        if (this.primaryGain && this.audioCtx) {
            this.primaryGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
            this.primaryGain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
        } else if (this.audioElement) {
            this.audioElement.volume = volume;
        }
    }
    setPlaybackRate(rate: number): void { this.audioElement.playbackRate = rate; }
    setLoop(loop: boolean): void { this.audioElement.loop = loop; }

    async crossfadeTo(url: string, durationSeconds: number, position: number = 0): Promise<void> {
        if (this.crossfadeInterval) clearInterval(this.crossfadeInterval);
        
        // Swap primary and secondary elements
        const oldAudio = this.audioElement;
        this.audioElement = this.secondaryElement;
        this.secondaryElement = oldAudio;

        // Swap gain nodes
        const oldGain = this.primaryGain;
        this.primaryGain = this.secondaryGain;
        this.secondaryGain = oldGain;

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        
        if (isLocalMediaUrl(url)) {
            this.audioElement.removeAttribute('crossorigin');
            this.audioElement.crossOrigin = null;
        } else {
            this.audioElement.crossOrigin = 'anonymous';
        }

        if (this.audioElement.src !== url && url) {
            this.audioElement.src = url;
            this.audioElement.load();
        }
        if (position > 0) this.audioElement.currentTime = position;
        
        this.currentState = 'loading';
        
        if (this.primaryGain && this.secondaryGain && this.audioCtx) {
            const currTime = this.audioCtx.currentTime;
            this.primaryGain.gain.cancelScheduledValues(currTime);
            this.primaryGain.gain.setValueAtTime(0, currTime);
            
            this.secondaryGain.gain.cancelScheduledValues(currTime);
            this.secondaryGain.gain.setValueAtTime(this.secondaryGain.gain.value, currTime);
        } else {
            this.audioElement.volume = 0;
        }
        
        try {
            const playPromise = this.audioElement.play();
            if (playPromise !== undefined) {
                await playPromise.catch(e => console.warn("Crossfade play warning", e));
            }
            this.currentState = 'playing';
        } catch (e) {
            console.warn("Crossfade play error", e);
        }
        
        if (this.primaryGain && this.secondaryGain && this.audioCtx) {
            const currTime = this.audioCtx.currentTime;
            this.primaryGain.gain.linearRampToValueAtTime(1.0, currTime + durationSeconds);
            this.secondaryGain.gain.linearRampToValueAtTime(0.0, currTime + durationSeconds);
            
            setTimeout(() => {
                this.secondaryElement.pause();
                this.secondaryElement.src = '';
            }, durationSeconds * 1000);
        } else {
            const steps = 20;
            const stepTime = (durationSeconds * 1000) / steps;
            let currentStep = 0;
            
            this.crossfadeInterval = setInterval(() => {
                currentStep++;
                const ratio = currentStep / steps;
                
                this.audioElement.volume = Math.min(1.0, ratio);
                this.secondaryElement.volume = Math.max(0.0, 1.0 - ratio);
            
                if (currentStep >= steps) {
                    clearInterval(this.crossfadeInterval);
                    this.secondaryElement.pause();
                    this.secondaryElement.src = ''; 
                }
            }, stepTime);
        }
    }
    
    async preload(_url: string): Promise<void> {}

    getCurrentTime(): number { return this.audioElement.currentTime; }
    getDuration(): number { return this.audioElement.duration || 0; }
    getState(): AudioState { return this.currentState; }

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
    
    destroy(): void {
        if (this.crossfadeInterval) clearInterval(this.crossfadeInterval);
        this.audioElement.pause();
        this.secondaryElement.pause();
        this.audioElement.src = '';
        this.secondaryElement.src = '';
    }
}
