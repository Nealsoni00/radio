import { EventEmitter } from 'events';
import type { FFTPacket } from '../trunk-recorder/fft-receiver.js';

export interface FrequencyScanResult {
  frequency: number;
  inRange: boolean;
  signalStrength: number | null; // dB, null if out of range
  noiseFloor: number | null;
  snr: number | null; // Signal to noise ratio
  hasSignal: boolean;
}

export interface ScanResults {
  timestamp: number;
  centerFreq: number;
  minFreq: number;
  maxFreq: number;
  sampleRate: number;
  results: FrequencyScanResult[];
  inRangeCount: number;
  activeCount: number;
}

export class FrequencyScanner extends EventEmitter {
  private latestPacket: FFTPacket | null = null;
  private signalThresholdDb = -85; // Signals above this are considered "active"
  private snrThresholdDb = 10; // SNR above this is considered a good signal

  constructor() {
    super();
  }

  /**
   * Update with the latest FFT packet
   */
  updateFFT(packet: FFTPacket): void {
    this.latestPacket = packet;
    this.emit('update', packet);
  }

  /**
   * Get current SDR coverage info
   */
  getCoverage(): { centerFreq: number; minFreq: number; maxFreq: number; sampleRate: number } | null {
    if (!this.latestPacket) return null;
    return {
      centerFreq: this.latestPacket.centerFreq,
      minFreq: this.latestPacket.minFreq,
      maxFreq: this.latestPacket.maxFreq,
      sampleRate: this.latestPacket.sampleRate,
    };
  }

  /**
   * Check if a frequency is within current SDR range
   */
  isFrequencyInRange(frequency: number): boolean {
    if (!this.latestPacket) return false;
    return frequency >= this.latestPacket.minFreq && frequency <= this.latestPacket.maxFreq;
  }

  /**
   * Get signal strength at a specific frequency
   */
  getSignalStrength(frequency: number): { strength: number; noiseFloor: number; snr: number } | null {
    if (!this.latestPacket) return null;
    if (!this.isFrequencyInRange(frequency)) return null;

    const { minFreq, maxFreq, fftSize, magnitudes } = this.latestPacket;
    const freqRange = maxFreq - minFreq;
    const binWidth = freqRange / fftSize;

    // Find the bin for this frequency
    const binIndex = Math.floor((frequency - minFreq) / binWidth);
    if (binIndex < 0 || binIndex >= fftSize) return null;

    // Get the magnitude at this bin and nearby bins for averaging
    const strength = magnitudes[binIndex];

    // Calculate noise floor from surrounding bins (excluding the signal area)
    // Use bins at least 50kHz away from the target
    const excludeBins = Math.ceil(50000 / binWidth);
    let noiseSum = 0;
    let noiseCount = 0;

    for (let i = 0; i < fftSize; i++) {
      if (Math.abs(i - binIndex) > excludeBins) {
        noiseSum += magnitudes[i];
        noiseCount++;
      }
    }

    const noiseFloor = noiseCount > 0 ? noiseSum / noiseCount : -100;
    const snr = strength - noiseFloor;

    return { strength, noiseFloor, snr };
  }

  /**
   * Scan multiple frequencies and return results
   */
  scanFrequencies(frequencies: number[]): ScanResults | null {
    if (!this.latestPacket) {
      return null;
    }

    const results: FrequencyScanResult[] = [];
    let inRangeCount = 0;
    let activeCount = 0;

    for (const freq of frequencies) {
      const inRange = this.isFrequencyInRange(freq);
      let signalStrength: number | null = null;
      let noiseFloor: number | null = null;
      let snr: number | null = null;
      let hasSignal = false;

      if (inRange) {
        inRangeCount++;
        const signal = this.getSignalStrength(freq);
        if (signal) {
          signalStrength = signal.strength;
          noiseFloor = signal.noiseFloor;
          snr = signal.snr;
          // Consider it an active signal if above threshold and good SNR
          hasSignal = signalStrength > this.signalThresholdDb && snr > this.snrThresholdDb;
          if (hasSignal) activeCount++;
        }
      }

      results.push({
        frequency: freq,
        inRange,
        signalStrength,
        noiseFloor,
        snr,
        hasSignal,
      });
    }

    return {
      timestamp: this.latestPacket.timestamp,
      centerFreq: this.latestPacket.centerFreq,
      minFreq: this.latestPacket.minFreq,
      maxFreq: this.latestPacket.maxFreq,
      sampleRate: this.latestPacket.sampleRate,
      results,
      inRangeCount,
      activeCount,
    };
  }

  /**
   * Set detection thresholds
   */
  setThresholds(signalThresholdDb: number, snrThresholdDb: number): void {
    this.signalThresholdDb = signalThresholdDb;
    this.snrThresholdDb = snrThresholdDb;
  }

  /**
   * Check if we have FFT data available
   */
  hasData(): boolean {
    return this.latestPacket !== null;
  }

  /**
   * Get the age of the latest FFT data in milliseconds
   */
  getDataAge(): number | null {
    if (!this.latestPacket) return null;
    return Date.now() - this.latestPacket.timestamp;
  }
}

// Singleton instance
export const frequencyScanner = new FrequencyScanner();
