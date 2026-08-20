import type { CrossfadeCurve, IAudioDeck, IWebAudioPipeline, TransitionOptions } from './types';

export class TransitionManager {
    private isTransitioning: boolean = false;
    private transitionInterval: any = null;
    private abortController: AbortController | null = null;

    /**
     * Perform a sample-accurate, zero-latency synchronous gapless handover.
     */
    public async performGaplessHandover(
        outgoingDeck: IAudioDeck,
        incomingDeck: IAudioDeck,
        pipeline?: IWebAudioPipeline,
        outgoingIndex: 0 | 1 = 0,
        masterVolume: number = 1.0
    ): Promise<void> {
        this.abortActiveTransition();

        this.isTransitioning = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const incomingIndex: 0 | 1 = (1 - outgoingIndex) as 0 | 1;

        // Set incoming deck gain to full immediately
        if (pipeline) {
            pipeline.setDeckGain(incomingIndex, 1.0, 0);
            pipeline.setDeckGain(outgoingIndex, 0.0, 0);
        }
        incomingDeck.setVolume(1.0 * masterVolume);
        // oxlint-disable-next-line
        outgoingDeck.setVolume(0.0 * masterVolume);

        // Start incoming deck immediately
        try {
            await incomingDeck.play();
        } catch (e) {
            console.warn('Gapless transition playback error:', e);
        }

        if (signal.aborted) {
            this.isTransitioning = false;
            return;
        }

        // Reset and pause outgoing deck
        outgoingDeck.pause();
        outgoingDeck.seek(0);
        this.isTransitioning = false;
        this.abortController = null;
    }

    /**
     * Perform an equal-power or linear dual-deck crossfade transition.
     */
    public async performCrossfade(
        outgoingDeck: IAudioDeck,
        incomingDeck: IAudioDeck,
        options: TransitionOptions = {},
        pipeline?: IWebAudioPipeline,
        outgoingIndex: 0 | 1 = 0,
        masterVolume: number = 1.0
    ): Promise<void> {
        this.abortActiveTransition();

        const rawDuration = typeof options.duration === 'number' && !isNaN(options.duration) ? options.duration : 3;
        const durationSeconds = Math.max(0.05, Math.min(12, rawDuration));
        const curve: CrossfadeCurve = options.curve || 'equalPower';
        const incomingIndex: 0 | 1 = (1 - outgoingIndex) as 0 | 1;

        this.isTransitioning = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        // Start incoming deck silent
        if (pipeline) {
            pipeline.setDeckGain(incomingIndex, 0.0, 0);
        }
        // oxlint-disable-next-line
        incomingDeck.setVolume(0.0 * masterVolume);

        // Start playing the incoming deck but do NOT await it.
        // This ensures the crossfade transition starts immediately without waiting for buffering,
        // eliminating the sluggishness on manual skip and automatic transitions.
        incomingDeck.play().catch((e) => {
            console.warn('Crossfade incoming deck play warning:', e);
            // On mobile/browsers with strict autoplay policies, if the incoming deck fails to play,
            // we abort the crossfade transition immediately.
            
            if (pipeline) {
                pipeline.setDeckGain(outgoingIndex, 0.0, 0);
                pipeline.setDeckGain(incomingIndex, 1.0, 0);
            }
            // oxlint-disable-next-line
            outgoingDeck.setVolume(0.0 * masterVolume);
            incomingDeck.setVolume(1.0 * masterVolume);
            
            outgoingDeck.pause();
            outgoingDeck.seek(0);
            
            if (this.abortController) {
                this.abortController.abort();
            }
        });

        if (signal.aborted) {
            this.isTransitioning = false;
            return;
        }

        return new Promise<void>((resolve) => {
            const stepDurationMs = 50;
            const durationMs = durationSeconds * 1000;
            const startTime = Date.now();

            const cleanup = () => {
                if (this.transitionInterval) {
                    clearInterval(this.transitionInterval);
                    this.transitionInterval = null;
                }
                this.isTransitioning = false;
                signal.removeEventListener('abort', onAbort);
            };

            const onAbort = () => {
                cleanup();
                resolve();
            };

            signal.addEventListener('abort', onAbort, { once: true });

            this.transitionInterval = setInterval(() => {
                if (signal.aborted) {
                    cleanup();
                    resolve();
                    return;
                }

                const elapsed = Date.now() - startTime;
                const progress = Math.min(1.0, elapsed / durationMs);

                let fadeOutGain: number;
                let fadeInGain: number;

                if (curve === 'equalPower') {
                    // Equal power: cos(t * PI / 2) and sin(t * PI / 2)
                    // Note: cos^2 + sin^2 = 1.0 (constant acoustic power)
                    const angle = progress * (Math.PI / 2);
                    fadeOutGain = Math.cos(angle);
                    fadeInGain = Math.sin(angle);
                } else {
                    // Linear: (1 - t) and t
                    fadeOutGain = 1.0 - progress;
                    fadeInGain = progress;
                }

                // Apply gains
                if (pipeline) {
                    pipeline.setDeckGain(outgoingIndex, fadeOutGain, 0.02);
                    pipeline.setDeckGain(incomingIndex, fadeInGain, 0.02);
                }
                outgoingDeck.setVolume(fadeOutGain * masterVolume);
                incomingDeck.setVolume(fadeInGain * masterVolume);

                if (progress >= 1.0) {
                    cleanup();

                    // Ensure final state
                    if (pipeline) {
                        pipeline.setDeckGain(outgoingIndex, 0.0, 0);
                        pipeline.setDeckGain(incomingIndex, 1.0, 0);
                    }
                    // oxlint-disable-next-line
                    outgoingDeck.setVolume(0.0 * masterVolume);
                    incomingDeck.setVolume(1.0 * masterVolume);

                    outgoingDeck.pause();
                    outgoingDeck.seek(0);
                    resolve();
                }
            }, stepDurationMs);
        });
    }

    /**
     * Abort any active crossfade or transition immediately.
     */
    public abortActiveTransition(
        activeDeck?: IAudioDeck,
        standbyDeck?: IAudioDeck,
        pipeline?: IWebAudioPipeline,
        activeIndex: 0 | 1 = 0,
        masterVolume: number = 1.0
    ): void {
        if (this.transitionInterval) {
            clearInterval(this.transitionInterval);
            this.transitionInterval = null;
        }

        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        this.isTransitioning = false;

        if (pipeline) {
            const standbyIndex = (1 - activeIndex) as 0 | 1;
            pipeline.setDeckGain(activeIndex, 1.0, 0);
            pipeline.setDeckGain(standbyIndex, 0.0, 0);
        }
        
        if (activeDeck) {
            activeDeck.setVolume(1.0 * masterVolume);
            if (standbyDeck) {
                // oxlint-disable-next-line
                standbyDeck.setVolume(0.0 * masterVolume);
                standbyDeck.pause();
            }
        }
    }

    public getIsTransitioning(): boolean {
        return this.isTransitioning;
    }

    public destroy(): void {
        this.abortActiveTransition();
    }
}
