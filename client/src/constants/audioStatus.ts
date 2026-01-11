/**
 * Audio Status Constants
 *
 * This file documents the reasons why audio recordings may be unavailable
 * for a call in the radio scanner system.
 *
 * The system captures audio from P25 trunked radio systems using an SDR
 * (Software Defined Radio) and trunk-recorder. Audio may be unavailable
 * for several reasons documented below.
 */

/**
 * Reasons why audio may be missing from a call recording.
 *
 * @property OUT_OF_SPECTRUM - The voice channel frequency was outside the SDR's
 *   tuned bandwidth. The SDR can only capture frequencies within its configured
 *   range (centerFrequency ± bandwidth/2). Calls on frequencies outside this
 *   range are detected via control channel but cannot be recorded.
 *
 * @property ENCRYPTED - The transmission was encrypted (usually AES-256 in P25
 *   systems). Encrypted calls are detected but the audio cannot be decoded
 *   without the encryption key.
 *
 * @property RECORDING_IN_PROGRESS - The call is still active and being recorded.
 *   Audio will be available once the transmission ends and the file is processed.
 *
 * @property NO_RECORDER_AVAILABLE - All available recorders were busy when the
 *   call started. trunk-recorder has a limited number of concurrent recorders
 *   based on CPU/SDR capacity.
 *
 * @property UNKNOWN - Audio is missing for an undetermined reason. This could be
 *   due to file system errors, processing failures, or other edge cases.
 */
export const AUDIO_MISSING_REASONS = {
  OUT_OF_SPECTRUM: 'out_of_spectrum',
  ENCRYPTED: 'encrypted',
  RECORDING_IN_PROGRESS: 'recording_in_progress',
  NO_RECORDER_AVAILABLE: 'no_recorder',
  UNKNOWN: 'unknown',
} as const;

export type AudioMissingReason = typeof AUDIO_MISSING_REASONS[keyof typeof AUDIO_MISSING_REASONS];

/**
 * Human-readable information for each audio missing reason.
 */
export const AUDIO_MISSING_INFO: Record<AudioMissingReason, {
  title: string;
  description: string;
  icon: 'spectrum' | 'encrypted' | 'active' | 'recorder' | 'unknown';
  severity: 'info' | 'warning' | 'error';
}> = {
  [AUDIO_MISSING_REASONS.OUT_OF_SPECTRUM]: {
    title: 'Out of spectrum range',
    description: 'The voice frequency was outside the SDR\'s tuned bandwidth',
    icon: 'spectrum',
    severity: 'warning',
  },
  [AUDIO_MISSING_REASONS.ENCRYPTED]: {
    title: 'Encrypted transmission',
    description: 'This call was encrypted and could not be decoded',
    icon: 'encrypted',
    severity: 'warning',
  },
  [AUDIO_MISSING_REASONS.RECORDING_IN_PROGRESS]: {
    title: 'Recording in progress',
    description: 'Audio will be available when the call ends',
    icon: 'active',
    severity: 'info',
  },
  [AUDIO_MISSING_REASONS.NO_RECORDER_AVAILABLE]: {
    title: 'No recorder available',
    description: 'All recorders were busy when this call started',
    icon: 'recorder',
    severity: 'error',
  },
  [AUDIO_MISSING_REASONS.UNKNOWN]: {
    title: 'Recording unavailable',
    description: 'Audio was not captured for this call',
    icon: 'unknown',
    severity: 'error',
  },
};

/**
 * Determines why audio is missing for a given call.
 *
 * @param call - The call object to check
 * @param activeSystem - The active system configuration (for spectrum range check)
 * @returns The reason code, or null if audio is available
 *
 * @example
 * ```ts
 * const reason = getAudioMissingReason(call, activeSystem);
 * if (reason) {
 *   const info = AUDIO_MISSING_INFO[reason];
 *   console.log(`Audio unavailable: ${info.title}`);
 * }
 * ```
 */
export function getAudioMissingReasonCode(
  call: {
    frequency: number;
    encrypted: boolean;
    isActive?: boolean;
    audio_file: string | null;
  },
  activeSystem: { centerFrequency: number; bandwidth: number } | null
): AudioMissingReason | null {
  // Audio is available
  if (call.audio_file) return null;

  // Check reasons in order of priority
  if (call.isActive) {
    return AUDIO_MISSING_REASONS.RECORDING_IN_PROGRESS;
  }

  if (call.encrypted) {
    return AUDIO_MISSING_REASONS.ENCRYPTED;
  }

  // Check if frequency is out of SDR range
  if (activeSystem) {
    const minFreq = activeSystem.centerFrequency - activeSystem.bandwidth / 2;
    const maxFreq = activeSystem.centerFrequency + activeSystem.bandwidth / 2;

    if (call.frequency < minFreq || call.frequency > maxFreq) {
      return AUDIO_MISSING_REASONS.OUT_OF_SPECTRUM;
    }
  }

  return AUDIO_MISSING_REASONS.UNKNOWN;
}

/**
 * Formats a detailed description for out-of-spectrum errors.
 *
 * @param callFrequency - The call's voice channel frequency in Hz
 * @param activeSystem - The active system configuration
 * @returns A formatted string describing the spectrum mismatch
 */
export function formatSpectrumRangeError(
  callFrequency: number,
  activeSystem: { centerFrequency: number; bandwidth: number }
): string {
  const minFreq = activeSystem.centerFrequency - activeSystem.bandwidth / 2;
  const maxFreq = activeSystem.centerFrequency + activeSystem.bandwidth / 2;

  const freqMHz = (callFrequency / 1_000_000).toFixed(4);
  const minMHz = (minFreq / 1_000_000).toFixed(3);
  const maxMHz = (maxFreq / 1_000_000).toFixed(3);

  return `${freqMHz} MHz is outside SDR coverage (${minMHz} - ${maxMHz} MHz)`;
}
