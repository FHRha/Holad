import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';
import type { JamRole, JamParticipant } from '../../types';

export interface JamSlice {
  roomId: string | null;
  role: JamRole;
  userName: string;
  participants: JamParticipant[];
  syncDrift: number;
  jamError: string | null;
  isMinimized: boolean;

  setRoomInfo: (roomId: string | null, role: JamRole) => void;
  setJamError: (error: string | null) => void;
  setUserName: (name: string) => void;
  setParticipants: (participants: JamParticipant[]) => void;
  setIsMinimized: (minimized: boolean) => void;
  setSyncDrift: (drift: number) => void;
}

export const createJamSlice: StateCreator<
  PlayerState,
  [],
  [],
  JamSlice
> = (set) => ({
  roomId: null,
  role: null,
  userName: '',
  participants: [],
  syncDrift: 0,
  jamError: null,
  isMinimized: false,

  setRoomInfo: (roomId, role) => set(() => {
    if (roomId) {
      return { roomId, role, jamError: null };
    } else {
      return { roomId: null, role: null, participants: [], isMinimized: false };
    }
  }),
  setJamError: (error) => set({ jamError: error }),
  setUserName: (userName) => set({ userName }),
  setParticipants: (participants) => set({ participants }),
  setIsMinimized: (isMinimized) => set({ isMinimized }),
  setSyncDrift: (syncDrift) => set({ syncDrift }),
});
