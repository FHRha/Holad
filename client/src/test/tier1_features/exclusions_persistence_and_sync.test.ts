import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useHoladStore } from '../../store/holadStore';
import { useUIStore } from '../../store/uiStore';
import * as exclusionsApi from '../../api/exclusions';

vi.mock('../../api/exclusions', () => ({
  fetchExclusions: vi.fn(),
  syncToggleExclusion: vi.fn().mockResolvedValue(true),
  syncSetExclusions: vi.fn().mockResolvedValue(true)
}));

describe('Exclusions Persistence & Real-Time Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlayerStore.setState({
      excludedTrackIds: [],
      excludedAlbumIds: []
    });
  });

  it('preserves locally saved exclusions when fetchExclusions returns null (server/network failure)', async () => {
    // Simulate user previously having excluded items in store / localStorage
    usePlayerStore.setState({
      excludedTrackIds: ['track-saved-1', 'track-saved-2'],
      excludedAlbumIds: ['album-saved-1']
    });

    // Simulate fetchExclusions returning null on network or server error (e.g. 403 or 502)
    vi.mocked(exclusionsApi.fetchExclusions).mockResolvedValueOnce(null);

    const exclusions = await exclusionsApi.fetchExclusions();
    if (exclusions) {
      usePlayerStore.getState().setExcludedItems(exclusions.excludedTrackIds, exclusions.excludedAlbumIds);
    }

    // Exclusions MUST be preserved, not wiped!
    const state = usePlayerStore.getState();
    expect(state.excludedTrackIds).toEqual(['track-saved-1', 'track-saved-2']);
    expect(state.excludedAlbumIds).toEqual(['album-saved-1']);
  });

  it('updates exclusions when fetchExclusions succeeds', async () => {
    usePlayerStore.setState({
      excludedTrackIds: ['old-track'],
      excludedAlbumIds: []
    });

    vi.mocked(exclusionsApi.fetchExclusions).mockResolvedValueOnce({
      excludedTrackIds: ['new-track-1'],
      excludedAlbumIds: ['new-album-1']
    });

    const exclusions = await exclusionsApi.fetchExclusions();
    if (exclusions) {
      usePlayerStore.getState().setExcludedItems(exclusions.excludedTrackIds, exclusions.excludedAlbumIds);
    }

    const state = usePlayerStore.getState();
    expect(state.excludedTrackIds).toEqual(['new-track-1']);
    expect(state.excludedAlbumIds).toEqual(['new-album-1']);
  });

  it('toggleTrackExclude broadcasts exclusionToggled event via useHoladStore sendRemoteCommand', () => {
    const sendRemoteCommandSpy = vi.spyOn(useHoladStore.getState(), 'sendRemoteCommand').mockImplementation(() => {});

    // Toggle ban on track
    usePlayerStore.getState().toggleTrackExclude('track-999');

    expect(usePlayerStore.getState().excludedTrackIds).toContain('track-999');
    expect(sendRemoteCommandSpy).toHaveBeenCalledWith('exclusionToggled', {
      entityId: 'track-999',
      entityType: 'track',
      isExcluded: true
    });

    // Toggle unban on track
    usePlayerStore.getState().toggleTrackExclude('track-999');
    expect(usePlayerStore.getState().excludedTrackIds).not.toContain('track-999');
    expect(sendRemoteCommandSpy).toHaveBeenCalledWith('exclusionToggled', {
      entityId: 'track-999',
      entityType: 'track',
      isExcluded: false
    });

    sendRemoteCommandSpy.mockRestore();
  });

  it('toggleAlbumExclude broadcasts exclusionToggled event via useHoladStore sendRemoteCommand', () => {
    const sendRemoteCommandSpy = vi.spyOn(useHoladStore.getState(), 'sendRemoteCommand').mockImplementation(() => {});

    // Toggle ban on album
    usePlayerStore.getState().toggleAlbumExclude('album-42');

    expect(usePlayerStore.getState().excludedAlbumIds).toContain('album-42');
    expect(sendRemoteCommandSpy).toHaveBeenCalledWith('exclusionToggled', {
      entityId: 'album-42',
      entityType: 'album',
      isExcluded: true
    });

    // Toggle unban on album
    usePlayerStore.getState().toggleAlbumExclude('album-42');
    expect(usePlayerStore.getState().excludedAlbumIds).not.toContain('album-42');
    expect(sendRemoteCommandSpy).toHaveBeenCalledWith('exclusionToggled', {
      entityId: 'album-42',
      entityType: 'album',
      isExcluded: false
    });

    sendRemoteCommandSpy.mockRestore();
  });

  it('setQueueAndPlay automatically skips excluded track at startIndex=0 and plays first available track', () => {
    usePlayerStore.setState({
      excludedTrackIds: ['t1'],
      excludedAlbumIds: [],
      queue: [],
      currentIndex: -1,
      isPlaying: false
    });

    const albumTracks = [
      { id: 't1', title: 'Ignored Intro', artist: 'Artist', duration: 100 },
      { id: 't2', title: 'Main Hit', artist: 'Artist', duration: 200 },
      { id: 't3', title: 'Outro', artist: 'Artist', duration: 150 }
    ] as any;

    // Playing the album (startIndex = 0)
    usePlayerStore.getState().setQueueAndPlay(albumTracks, 0);

    const state = usePlayerStore.getState();
    // Excluded t1 must be filtered out
    expect(state.queue.map(t => t.id)).toEqual(['t2', 't3']);
    // Playback must start from t2 (first non-ignored track)
    expect(state.currentIndex).toBe(0);
    expect(state.queue[state.currentIndex].id).toBe('t2');
    expect(state.isPlaying).toBe(true);
  });

  it('uiStore manages unignoreModal state and callbacks properly', () => {
    const onConfirmMock = vi.fn();
    const testTrack = { id: 't-99', title: 'Banned Track' } as any;

    // Initially closed
    expect(useUIStore.getState().unignoreModal.isOpen).toBe(false);

    // Open modal
    useUIStore.getState().openUnignoreModal(testTrack, onConfirmMock);
    expect(useUIStore.getState().unignoreModal.isOpen).toBe(true);
    expect(useUIStore.getState().unignoreModal.track).toEqual(testTrack);

    // Call onConfirm and close
    useUIStore.getState().unignoreModal.onConfirm?.();
    expect(onConfirmMock).toHaveBeenCalledTimes(1);

    useUIStore.getState().closeUnignoreModal();
    expect(useUIStore.getState().unignoreModal.isOpen).toBe(false);
    expect(useUIStore.getState().unignoreModal.track).toBeNull();
  });
});
