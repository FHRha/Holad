import type { AudioState, IAudioCore } from './types';
import { volumeManager } from './VolumeManager';

export class UnifiedAudioEngine implements IAudioCore {
    private driver: IAudioCore;

    constructor(driver: IAudioCore) {
        this.driver = driver;
    }

    public async play(url: string, position?: number): Promise<void> {
        await this.driver.play(url, position);
        this.driver.getState(); 
    }

    public pause(): void {
        this.driver.pause();
    }

    public async resume(): Promise<void> {
        await this.driver.resume();
    }

    public seek(time: number): void {
        this.driver.seek(time);
    }

    public setVolume(volume: number): void {
        volumeManager.setMasterVolume(volume);
        this.driver.setVolume(volumeManager.getFinalVolume());
    }

    public setPlaybackRate(rate: number): void {
        this.driver.setPlaybackRate(rate);
    }

    public setLoop(loop: boolean): void {
        this.driver.setLoop(loop);
    }

    public async crossfadeTo(url: string, durationSeconds: number, position?: number): Promise<void> {
        await this.driver.crossfadeTo(url, durationSeconds, position);
    }

    public getCurrentTime(): number {
        return this.driver.getCurrentTime();
    }

    public getDuration(): number {
        return this.driver.getDuration();
    }

    public getState(): AudioState {
        return this.driver.getState();
    }

    public on(event: 'timeupdate' | 'statechange' | 'ended' | 'durationchange' | 'error', listener: (...args: any[]) => void): void {
        (this.driver as any).on(event, listener);
    }

    public off(event: 'timeupdate' | 'statechange' | 'ended' | 'durationchange' | 'error', listener: (...args: any[]) => void): void {
        (this.driver as any).off(event, listener);
    }

    public getAudioContext?(): AudioContext | undefined {
        return this.driver.getAudioContext?.();
    }

    public getMediaElementSource?(): MediaElementAudioSourceNode | undefined {
        return this.driver.getMediaElementSource?.();
    }

    public getAnalyserNode?(): AnalyserNode | undefined {
        return this.driver.getAnalyserNode?.();
    }

    public destroy(): void {
        this.driver.destroy();
    }
}