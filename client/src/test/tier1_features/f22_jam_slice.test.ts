import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
// oxlint-disable-next-line
import { JamParticipant, JamRole } from '../../types';

describe('jamSlice', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      roomId: null,
      role: null,
      userName: '',
      participants: [],
      syncDrift: 0,
      jamError: null,
      isMinimized: false,
    });
  });

  it('sets room info correctly', () => {
    usePlayerStore.getState().setRoomInfo('room1', 'host');
    const state = usePlayerStore.getState();
    expect(state.roomId).toBe('room1');
    expect(state.role).toBe('host');
    expect(state.jamError).toBeNull();
  });

  it('clears room info when roomId is null', () => {
    usePlayerStore.getState().setRoomInfo('room1', 'host');
    usePlayerStore.getState().setRoomInfo(null, null);
    
    const state = usePlayerStore.getState();
    expect(state.roomId).toBeNull();
    expect(state.role).toBeNull();
    expect(state.participants).toEqual([]);
    expect(state.isMinimized).toBe(false);
  });

  it('sets jam error', () => {
    usePlayerStore.getState().setJamError('connection failed');
    expect(usePlayerStore.getState().jamError).toBe('connection failed');
  });

  it('sets participants', () => {
    const participants: JamParticipant[] = [{ id: '1', name: 'User 1', isHost: true }];
    usePlayerStore.getState().setParticipants(participants);
    expect(usePlayerStore.getState().participants).toEqual(participants);
  });
});
