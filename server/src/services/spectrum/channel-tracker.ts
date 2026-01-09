/**
 * Tracks control channels and active voice channels for spectrum display markers
 */

export interface ChannelMarker {
  frequency: number;
  type: 'control' | 'voice';
  label?: string;
  talkgroupId?: number;
  active?: boolean;
}

interface ActiveCall {
  id: string;
  frequency: number;
  talkgroupId: number;
  alphaTag?: string;
  startTime: number;
}

class ChannelTracker {
  private controlChannels: number[] = [];
  private activeCalls: Map<string, ActiveCall> = new Map();
  private currentControlChannel: number | null = null;

  /**
   * Set the control channel frequencies for the system
   */
  setControlChannels(frequencies: number[]): void {
    this.controlChannels = frequencies;
  }

  /**
   * Update which control channel is currently active
   */
  setCurrentControlChannel(frequency: number): void {
    this.currentControlChannel = frequency;
  }

  /**
   * Add or update an active call
   */
  addActiveCall(call: { id: string; frequency: number; talkgroupId: number; alphaTag?: string }): void {
    this.activeCalls.set(call.id, {
      ...call,
      startTime: Date.now(),
    });
  }

  /**
   * Remove a completed call
   */
  removeCall(callId: string): void {
    this.activeCalls.delete(callId);
  }

  /**
   * Update active calls from trunk-recorder callsActive message
   */
  updateActiveCalls(calls: Array<{ id: string; frequency: number; talkgroupId: number; alphaTag?: string }>): void {
    // Clear old calls and set new ones
    this.activeCalls.clear();
    for (const call of calls) {
      this.activeCalls.set(call.id, {
        ...call,
        startTime: Date.now(),
      });
    }
  }

  /**
   * Get all channel markers for spectrum display
   */
  getChannelMarkers(): ChannelMarker[] {
    const markers: ChannelMarker[] = [];

    // Add control channel markers
    for (const freq of this.controlChannels) {
      markers.push({
        frequency: freq,
        type: 'control',
        label: 'CC',
        active: freq === this.currentControlChannel,
      });
    }

    // Add voice channel markers from active calls
    for (const call of this.activeCalls.values()) {
      markers.push({
        frequency: call.frequency,
        type: 'voice',
        label: call.alphaTag || `TG ${call.talkgroupId}`,
        talkgroupId: call.talkgroupId,
        active: true,
      });
    }

    return markers;
  }

  /**
   * Get just control channel frequencies
   */
  getControlChannels(): number[] {
    return [...this.controlChannels];
  }

  /**
   * Get active voice channel frequencies
   */
  getActiveVoiceChannels(): Array<{ frequency: number; talkgroupId: number; alphaTag?: string }> {
    return Array.from(this.activeCalls.values()).map(call => ({
      frequency: call.frequency,
      talkgroupId: call.talkgroupId,
      alphaTag: call.alphaTag,
    }));
  }
}

// Singleton instance
export const channelTracker = new ChannelTracker();
