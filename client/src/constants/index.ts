/**
 * Client-side constants for the Radio Scanner application.
 * Centralizes magic numbers and configuration values.
 */

// =============================================================================
// UI Layout
// =============================================================================

export const PANEL_SIZES = {
  /** Default sidebar width in pixels */
  SIDEBAR_DEFAULT: 288,
  SIDEBAR_MIN: 200,
  SIDEBAR_MAX: 500,

  /** Default control panel height in pixels */
  CONTROL_PANEL_DEFAULT: 200,
  CONTROL_PANEL_MIN: 100,
  CONTROL_PANEL_MAX: 500,

  /** Default call details panel width in pixels */
  DETAILS_DEFAULT: 320,
  DETAILS_MIN: 250,
  DETAILS_MAX: 600,
} as const;

// =============================================================================
// WebSocket
// =============================================================================

export const WEBSOCKET = {
  /** Delay before attempting reconnection (ms) */
  RECONNECT_DELAY: 3000,

  /** Binary header size for audio/FFT packets */
  HEADER_SIZE: 12,

  /** Threshold to detect FFT vs audio packets */
  FFT_PACKET_THRESHOLD: 3000,
} as const;

// =============================================================================
// Audio
// =============================================================================

export const AUDIO = {
  /** Default sample rate for PCM audio (Hz) */
  SAMPLE_RATE: 8000,

  /** Default volume (0-1) */
  DEFAULT_VOLUME: 0.8,

  /** Audio buffer size for live streaming */
  BUFFER_SIZE: 4096,
} as const;

// =============================================================================
// Data Limits
// =============================================================================

export const LIMITS = {
  /** Maximum number of calls to keep in state */
  MAX_CALLS: 500,

  /** Maximum control channel events to display */
  MAX_CONTROL_EVENTS: 200,

  /** Default number of calls to fetch */
  DEFAULT_FETCH_LIMIT: 100,
} as const;

// =============================================================================
// Spectrum Display
// =============================================================================

export const SPECTRUM = {
  /** Update interval for waiting time tracking (ms) */
  WAITING_TIME_INTERVAL: 1000,

  /** Seconds threshold before showing connection warning */
  CONNECTION_WARNING_THRESHOLD: 3,
} as const;

// =============================================================================
// Formatting
// =============================================================================

export const FORMAT = {
  /** Divisor to convert Hz to MHz */
  HZ_TO_MHZ: 1_000_000,

  /** Seconds per minute */
  SECONDS_PER_MINUTE: 60,

  /** Decimal places for frequency display */
  FREQUENCY_DECIMALS: 5,
} as const;

// =============================================================================
// LocalStorage Keys
// =============================================================================

export const STORAGE_KEYS = {
  PANEL_SIZE_PREFIX: 'panel-size-',
  TALKGROUPS_SIDEBAR: 'talkgroups-sidebar',
  CONTROL_PANEL: 'control-panel',
  CALL_DETAILS: 'call-details',
} as const;
