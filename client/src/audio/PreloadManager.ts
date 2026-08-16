import type { IAudioDeck } from './types';

export class PreloadManager {
    private lookaheadSeconds: number = 15;
    private preloadedTrackId: string | null = null;
    private isPreloading: boolean = false;

    constructor(lookaheadSeconds: number = 15) {
        this.lookaheadSeconds = lookaheadSeconds;
    }

    public setLookaheadSeconds(seconds: number): void {
        this.lookaheadSeconds = Math.max(5, Math.min(60, seconds));
    }

    public getLookaheadSeconds(): number {
        return this.lookaheadSeconds;
    }

    public shouldPreload(currentTime: number, duration: number, crossfadeDuration: number = 0): boolean {
        if (!duration || duration <= 0) return false;
        const remaining = duration - currentTime;
        const triggerWindow = Math.max(this.lookaheadSeconds, crossfadeDuration + 2);
        return remaining > 0 && remaining <= triggerWindow;
    }

    public async preloadTrack(track: any, standbyDeck: IAudioDeck): Promise<void> {
        if (!track || !track.id) return;
        if (this.preloadedTrackId === track.id) return;

        const streamUrl = track.streamUrl || (track.src ? track.src : null);
        if (!streamUrl) return;

        this.isPreloading = true;
        this.preloadedTrackId = track.id;

        try {
            await standbyDeck.load(streamUrl, 0);
        } catch (e) {
            console.warn(`PreloadManager: Failed to preload track ${track.id}:`, e);
        } finally {
            this.isPreloading = false;
        }
    }

    public getPreloadedTrackId(): string | null {
        return this.preloadedTrackId;
    }

    public getIsPreloading(): boolean {
        return this.isPreloading;
    }

    public isTrackPreloaded(trackId: string): boolean {
        return this.preloadedTrackId === trackId;
    }

    public cancelPreload(standbyDeck?: IAudioDeck): void {
        this.preloadedTrackId = null;
        this.isPreloading = false;
        if (standbyDeck) {
            standbyDeck.pause();
            standbyDeck.load('', 0).catch(() => {});
        }
    }

    public reset(): void {
        this.preloadedTrackId = null;
        this.isPreloading = false;
    }
}
