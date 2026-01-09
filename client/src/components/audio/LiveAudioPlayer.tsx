import { useEffect, useRef, useCallback } from 'react';
import { useAudioStore, useTalkgroupsStore } from '../../store';

// PCM Player implementation for live audio
class PCMPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sampleRate: number;
  private nextTime = 0;

  constructor(sampleRate = 8000) {
    this.sampleRate = sampleRate;
  }

  init() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.nextTime = this.audioContext.currentTime;
  }

  setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  feed(int16Data: Int16Array) {
    if (!this.audioContext || !this.gainNode) {
      this.init();
    }

    // Convert Int16 to Float32
    const floatData = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      floatData[i] = int16Data[i] / 32768;
    }

    // Create audio buffer
    const buffer = this.audioContext!.createBuffer(1, floatData.length, this.sampleRate);
    buffer.getChannelData(0).set(floatData);

    // Create buffer source
    const source = this.audioContext!.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode!);

    // Schedule playback
    const currentTime = this.audioContext!.currentTime;
    if (this.nextTime < currentTime) {
      this.nextTime = currentTime;
    }

    source.start(this.nextTime);
    this.nextTime += buffer.duration;
  }

  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.gainNode = null;
    }
  }
}

export function LiveAudioPlayer() {
  const playerRef = useRef<PCMPlayer | null>(null);
  const { isLiveEnabled, volume, setPlaying } = useAudioStore();
  const { selectedTalkgroups } = useTalkgroupsStore();

  const handleAudioChunk = useCallback(
    (event: CustomEvent) => {
      const { talkgroupId, pcmData } = event.detail;

      // Check if we're subscribed to this talkgroup
      const isSubscribed = selectedTalkgroups.size === 0 || selectedTalkgroups.has(talkgroupId);

      if (isLiveEnabled && isSubscribed && playerRef.current) {
        playerRef.current.feed(pcmData);
        setPlaying(true);
      }
    },
    [isLiveEnabled, selectedTalkgroups, setPlaying]
  );

  useEffect(() => {
    if (isLiveEnabled) {
      playerRef.current = new PCMPlayer(8000);
      playerRef.current.init();
      playerRef.current.setVolume(volume);

      window.addEventListener('audioChunk', handleAudioChunk as EventListener);

      return () => {
        window.removeEventListener('audioChunk', handleAudioChunk as EventListener);
        playerRef.current?.destroy();
        playerRef.current = null;
        setPlaying(false);
      };
    }
  }, [isLiveEnabled, handleAudioChunk, setPlaying]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  }, [volume]);

  // This component doesn't render anything visible
  // It just handles live audio playback in the background
  return null;
}
