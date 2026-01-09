import { create } from 'zustand';

interface ConnectionState {
  isConnected: boolean;
  trunkRecorderConnected: boolean;
  decodeRate: number;
  setConnected: (connected: boolean) => void;
  setTrunkRecorderConnected: (connected: boolean) => void;
  setDecodeRate: (rate: number) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  isConnected: false,
  trunkRecorderConnected: false,
  decodeRate: 0,

  setConnected: (connected) => set({ isConnected: connected }),
  setTrunkRecorderConnected: (connected) => set({ trunkRecorderConnected: connected }),
  setDecodeRate: (rate) => set({ decodeRate: rate }),
}));
