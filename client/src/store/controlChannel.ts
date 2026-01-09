import { create } from 'zustand';
import type { ControlChannelEvent } from '../types';
import { LIMITS } from '../constants';

interface ControlChannelState {
  events: ControlChannelEvent[];
  isLoading: boolean;
  maxEvents: number;
  addEvent: (event: ControlChannelEvent) => void;
  setEvents: (events: ControlChannelEvent[]) => void;
  clearEvents: () => void;
}

export const useControlChannelStore = create<ControlChannelState>((set) => ({
  events: [],
  isLoading: false,
  maxEvents: LIMITS.MAX_CONTROL_EVENTS,

  addEvent: (event) => {
    set((state) => ({
      events: [event, ...state.events].slice(0, state.maxEvents),
    }));
  },

  setEvents: (events) => {
    set((state) => ({
      events: events.slice(0, state.maxEvents),
      isLoading: false,
    }));
  },

  clearEvents: () => {
    set({ events: [] });
  },
}));
