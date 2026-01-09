/**
 * Server-side constants for the Radio Scanner application.
 * Centralizes magic numbers and configuration values.
 */

// =============================================================================
// Server Ports
// =============================================================================

export const PORTS = {
  /** trunk-recorder status WebSocket server */
  TRUNK_RECORDER_STATUS: 3001,
} as const;

// =============================================================================
// File Paths
// =============================================================================

export const PATHS = {
  /** Default trunk-recorder log file location */
  TRUNK_RECORDER_LOG: '/tmp/trunk-recorder.log',
} as const;

// =============================================================================
// Audio Processing
// =============================================================================

export const AUDIO = {
  /** Sample rate for PCM audio (Hz) */
  SAMPLE_RATE: 8000,

  /** Threshold for detecting valid audio packets */
  PACKET_DETECTION_THRESHOLD: 10000,
} as const;

// =============================================================================
// API Pagination Defaults
// =============================================================================

export const PAGINATION = {
  /** Default limit for system queries */
  SYSTEMS_DEFAULT_LIMIT: 50,

  /** Default limit for talkgroup queries */
  TALKGROUPS_DEFAULT_LIMIT: 100,

  /** Default limit for search results */
  SEARCH_DEFAULT_LIMIT: 20,

  /** Default offset */
  DEFAULT_OFFSET: 0,
} as const;

// =============================================================================
// trunk-recorder Configuration Generation
// =============================================================================

export const TR_CONFIG = {
  /** Bandwidth multiplier for frequency range calculation */
  BANDWIDTH_MULTIPLIER: 1.2,

  /** Maximum number of digital recorders to configure */
  MAX_DIGITAL_RECORDERS: 8,
} as const;

// =============================================================================
// Formatting
// =============================================================================

export const FORMAT = {
  /** Divisor to convert Hz to MHz */
  HZ_TO_MHZ: 1_000_000,
} as const;

// =============================================================================
// Log Watcher
// =============================================================================

export const LOG_WATCHER = {
  /** tail command flags */
  TAIL_FLAGS: ['-F', '-n', '0'] as const,
} as const;
