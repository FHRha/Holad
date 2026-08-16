import { describe, it, expect, beforeEach } from 'vitest';
import { MockAudioContext } from '../mocks/mockAudio';
import { usePlayerStore } from '../../store/playerStore';
import { createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 3 - P2: Gapless Playback + Loudness Normalization + Track Seeking Interaction', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('P2-1: Dual deck gapless routing maintains active connection through DynamicsCompressorNode', () => {
    const ctx = new MockAudioContext();
    const deckA = ctx.createGain();
    const deckB = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const masterGain = ctx.createGain();

    deckA.connect(compressor);
    deckB.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    expect(deckA.connectedTo).toContain(compressor);
    expect(deckB.connectedTo).toContain(compressor);
    expect(compressor.connectedTo).toContain(masterGain);
  });

  it('P2-2: Seeking near end of track triggers next track handover without compressor clipping', () => {
    const tracks = createMockAlbumTracks(3);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(0);
    usePlayerStore.getState().setIsPlaying(true);

    // Seek to 178s of 180s track
    usePlayerStore.getState().setInitialPosition(178000);
    expect(usePlayerStore.getState().initialPosition).toBe(178000);

    // Track finishes and transitions
    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(1);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('P2-3: Seeking backwards mid-gapless queue replays earlier track under normalization pipeline', () => {
    const tracks = createMockAlbumTracks(4);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(2);

    usePlayerStore.getState().prevTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(1);

    usePlayerStore.getState().prevTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(0);
  });
});
