import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useHoladStore } from '../../store/holadStore';
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
});
