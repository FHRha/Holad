import type { VolumeState } from './types';

export class VolumeManager {
    private state: VolumeState = {
        master: 1.0,
        track: 1.0,
        category: 1.0,
    };

    /**
     * Get the final calculated volume.
     * Final volume is the product of master, track, and category volumes.
     * Clamped between 0.0 and 1.0.
     */
    public getFinalVolume(): number {
        const volume = this.state.master * this.state.track * this.state.category;
        return Math.max(0, Math.min(1, volume));
    }

    public setMasterVolume(volume: number): void {
        this.state.master = Math.max(0, Math.min(1, volume));
    }

    public setTrackVolume(volume: number): void {
        this.state.track = Math.max(0, Math.min(1, volume));
    }

    public setCategoryVolume(volume: number): void {
        this.state.category = Math.max(0, Math.min(1, volume));
    }

    public reset(): void {
        this.state = {
            master: 1.0,
            track: 1.0,
            category: 1.0,
        };
    }

    public getState(): VolumeState {
        return { ...this.state };
    }
}

export const volumeManager = new VolumeManager();