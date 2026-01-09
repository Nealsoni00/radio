# System Architecture

This document provides a detailed technical overview of how data flows from the RTL-SDR hardware through the system to the web client.

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [SDR Data Reception](#sdr-data-reception)
4. [Trunk-Recorder Integration](#trunk-recorder-integration)
5. [Spectrum Analysis System](#spectrum-analysis-system)
6. [WebSocket Broadcasting](#websocket-broadcasting)
7. [Client-Side Processing](#client-side-processing)
8. [API Endpoints](#api-endpoints)

---

## High-Level Overview

```
RTL-SDR Hardware
       │
       ▼
trunk-recorder (C++ / GNU Radio)
       │
       ├─► UDP 9000: FFT spectrum data
       ├─► UDP 9001: PCM audio streams
       ├─► WebSocket 3001: Call status
       ├─► File system: WAV recordings
       └─► Log file: Control channel events
       │
       ▼
Node.js Server (Port 3000)
       │
       ├─► SQLite database (calls, talkgroups)
       ├─► Spectrum recorder/replayer
       └─► WebSocket broadcast to clients
       │
       ▼
React Web Client
       │
       ├─► Real-time spectrum visualization
       ├─► Audio playback (live + recorded)
       ├─► Call monitoring and filtering
       └─► Control channel event feed
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              COMPLETE DATA FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

HARDWARE (RTL-SDR)
    │
    │ USB: Raw I/Q samples @ 2.4 MSPS
    ▼
trunk-recorder (C++ process)
    │
    ├─► UDP 9000 ──────────────────────────────────────────────────────────────┐
    │   FFT Packets (Binary)                                                   │
    │   ┌──────────────────────────────────────────────────────────────────┐   │
    │   │ Magic: 0x46465444 ("FFTD") | Metadata Len | FFT Size | JSON Meta │   │
    │   │ Magnitudes: Float32Array (dB power values)                       │   │
    │   └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    ├─► UDP 9001 ──────────────────────────────────────────────────────────────┤
    │   Audio Packets (Binary)                                                 │
    │   ┌──────────────────────────────────────────────────────────────────┐   │
    │   │ Format A: [JSON Length][JSON Metadata][PCM Audio]                │   │
    │   │ Format B: [4-byte TGID][PCM Audio]                               │   │
    │   └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    ├─► WebSocket 3001 ────────────────────────────────────────────────────────┤
    │   Status Messages (JSON)                                                 │
    │   • call_start: New transmission begins                                  │
    │   • call_end: Transmission complete with metadata                        │
    │   • calls_active: Periodic list of ongoing calls                         │
    │   • rates: Decode rate statistics                                        │
    │                                                                          │
    ├─► File System ───────────────────────────────────────────────────────────┤
    │   Recordings                                                             │
    │   • ./audio/{talkgroup}/call-{id}.wav                                    │
    │   • ./audio/{talkgroup}/call-{id}.json                                   │
    │                                                                          │
    └─► Log File (/tmp/trunk-recorder.log) ────────────────────────────────────┤
        Control Channel Events                                                 │
        • TG grants, call endings, encrypted calls                             │
        • Decode rates, system info, unit tracking                             │
                                                                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NODE.JS SERVER                                     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ FFTReceiver  │  │AudioReceiver │  │ StatusServer │  │  FileWatcher │    │
│  │  UDP 9000    │  │  UDP 9001    │  │   WS 3001    │  │   chokidar   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │             │
│         │                 │                 │                 │             │
│  ┌──────┴───────┐         │                 │                 │             │
│  │ LogWatcher   │         │                 │                 │             │
│  │ tail -f log  │         │                 │                 │             │
│  └──────┬───────┘         │                 │                 │             │
│         │                 │                 │                 │             │
│         ▼                 ▼                 ▼                 ▼             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      EVENT HANDLERS                                  │   │
│  │                                                                      │   │
│  │  FFT Data ──────► broadcastFFT()                                    │   │
│  │             ├───► fftRecorder.addPacket() (if recording)            │   │
│  │             └───► frequencyScanner.updateFFT()                      │   │
│  │                                                                      │   │
│  │  Audio ─────────► broadcastAudio()                                  │   │
│  │                                                                      │   │
│  │  Call Start ────► broadcastCallStart()                              │   │
│  │                                                                      │   │
│  │  Call End ──────► processCompletedCall() → SQLite                   │   │
│  │             └───► broadcastCallEnd()                                │   │
│  │                                                                      │   │
│  │  New File ──────► processCompletedCall() → SQLite                   │   │
│  │             └───► broadcastNewRecording()                           │   │
│  │                                                                      │   │
│  │  Control Event ─► broadcastControlChannel()                         │   │
│  │             └───► fftRecorder.addControlChannelEvent()              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     BROADCAST SERVER                                 │   │
│  │                    WebSocket on /ws                                  │   │
│  │                                                                      │   │
│  │  Message Types:                                                      │   │
│  │  • FFT (binary) ─────────────► clients with streamFFT enabled       │   │
│  │  • Audio (binary) ───────────► clients with streamAudio + TG match  │   │
│  │  • callStart/callEnd (JSON) ─► clients with TG subscription         │   │
│  │  • newRecording (JSON) ──────► clients with streamAudio + TG match  │   │
│  │  • controlChannel (JSON) ────► all clients                          │   │
│  │  • rates (JSON) ─────────────► all clients                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ WebSocket (JSON + Binary)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            WEB CLIENT                                        │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ WebSocket Hook  │  │  Zustand Stores │  │  React UI       │             │
│  │                 │  │                 │  │                 │             │
│  │ Binary parsing  │─►│ fft: FFTStore   │─►│ Spectrum View   │             │
│  │ JSON routing    │  │ calls: CallStore│  │ Call List       │             │
│  │ Reconnection    │  │ audio: AudioSt. │  │ Audio Player    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## SDR Data Reception

### FFT Receiver (`server/src/services/trunk-recorder/fft-receiver.ts`)

Receives real-time spectrum data from trunk-recorder via UDP.

**Configuration:**
- Port: 9000 (configurable via `config.trunkRecorder.fftPort`)
- Protocol: Binary UDP packets

**Packet Structure:**
```
┌───────────────────┬─────────────────┬─────────────┬───────────────────┬─────────────────┐
│ Magic Number      │ Metadata Length │ FFT Size    │ JSON Metadata     │ FFT Magnitudes  │
│ 4 bytes           │ 4 bytes         │ 4 bytes     │ variable          │ fftSize * 4 B   │
│ 0x46465444        │ little-endian   │ little-end. │ UTF-8 string      │ Float32Array    │
│ ("FFTD")          │                 │             │                   │ (dB values)     │
└───────────────────┴─────────────────┴─────────────┴───────────────────┴─────────────────┘
```

**Metadata JSON Fields:**
```typescript
{
  sourceIndex: number;   // trunk-recorder source/channel index
  centerFreq: number;    // Center frequency in Hz
  sampleRate: number;    // Sample rate in Hz
  timestamp: number;     // Milliseconds since epoch
  minFreq: number;       // Lower frequency bound
  maxFreq: number;       // Upper frequency bound
}
```

**Emitted Event:**
```typescript
interface FFTPacket {
  sourceIndex: number;
  centerFreq: number;
  sampleRate: number;
  timestamp: number;
  fftSize: number;
  minFreq: number;
  maxFreq: number;
  magnitudes: Float32Array;  // Power values in dB
}
```

### Audio Receiver (`server/src/services/trunk-recorder/audio-receiver.ts`)

Receives live PCM audio streams from trunk-recorder.

**Configuration:**
- Port: 9001 (configurable)
- Protocol: Binary UDP with two format variants

**Format Detection (heuristic):**
- Values < 10000 in first 4 bytes = JSON metadata length (Format A)
- Values >= 10000 = Talkgroup ID (Format B)

**Format A (JSON metadata):**
```
┌─────────────────┬─────────────────────────┬──────────────────┐
│ JSON Length     │ JSON Metadata           │ PCM Audio Data   │
│ 4 bytes         │ variable                │ remaining bytes  │
│ little-endian   │ UTF-8 string            │ 16-bit samples   │
└─────────────────┴─────────────────────────┴──────────────────┘
```

**Format B (TGID only):**
```
┌─────────────────┬──────────────────┐
│ Talkgroup ID    │ PCM Audio Data   │
│ 4 bytes         │ remaining bytes  │
│ little-endian   │ 16-bit samples   │
└─────────────────┴──────────────────┘
```

---

## Trunk-Recorder Integration

### Status Server (`server/src/services/trunk-recorder/status-server.ts`)

WebSocket server that receives status updates from trunk-recorder.

**Port:** 3001

**Incoming Messages:**
| Type | Description |
|------|-------------|
| `call_start` | New transmission begins on a talkgroup |
| `call_end` | Transmission complete with full metadata |
| `calls_active` | Periodic list of all active calls |
| `rates` | Decode rate statistics per source |

### Log Watcher (`server/src/services/trunk-recorder/log-watcher.ts`)

Tails `/tmp/trunk-recorder.log` to extract control channel events.

**Detected Event Types:**
| Type | Source Pattern |
|------|---------------|
| `grant` | "Starting P25 Recorder" |
| `end` | "Stopping P25 Recorder" |
| `encrypted` | "ENCRYPTED" keyword |
| `out_of_band` | No source coverage |
| `no_recorder` | Insufficient recorders |
| `decode_rate` | Control channel stats |
| `system_info` | WACN/NAC/System ID |
| `unit` | Mobile/radio unit ID |

**Emitted Event:**
```typescript
interface ControlChannelEvent {
  timestamp: number;
  type: string;
  talkgroup?: number;
  talkgroupTag?: string;
  frequency?: number;
  recorder?: number;
  source?: number;
  tdmaSlot?: number;
  encrypted?: boolean;
  phase2Tdma?: boolean;
  emergency?: boolean;
  unit?: number;
  decodeRate?: number;
  wacn?: string;
  nac?: string;
  systemId?: string;
}
```

### File Watcher (`server/src/services/trunk-recorder/file-watcher.ts`)

Monitors the audio directory for new recordings using chokidar.

**Watched Pattern:** `./audio/**/*.json`

When a new `.json` metadata file appears:
1. Parse the JSON metadata
2. Verify the corresponding `.wav` file exists
3. Insert the call record into SQLite
4. Broadcast `newRecording` event to clients

---

## Spectrum Analysis System

### Frequency Scanner (`server/src/services/spectrum/frequency-scanner.ts`)

Real-time signal detection and analysis engine.

**Singleton Pattern:** Maintains the latest FFT packet for on-demand analysis.

**Analysis Algorithm:**
```
1. Find FFT bin closest to target frequency
   bin_index = (target_freq - min_freq) / bin_width

2. Get signal strength at that bin (dB)

3. Calculate noise floor (excluding 50kHz radius around target)
   noise_floor = average(bins > 50kHz away)

4. Calculate SNR
   snr = signal_strength - noise_floor

5. Determine activity status
   active = (signal > -85 dB) AND (snr > 10 dB)
```

**API:**
```typescript
getCoverage(): { minFreq, maxFreq, centerFreq, sampleRate, fftSize } | null
isFrequencyInRange(freq: number): boolean
getSignalStrength(freq: number): { strength, noiseFloor, snr } | null
scanFrequencies(freqs: number[]): ScanResult[]
hasData(): boolean
getDataAge(): number  // milliseconds since last update
```

### FFT Recorder (`server/src/services/spectrum/fft-recorder.ts`)

Records FFT data and control channel events for later replay.

**Recording Lifecycle:**
```
startRecording(duration, name?)
    → Collect FFT packets + control events
    → stopRecording()
    → Save to JSON file

Recording stored at: server/data/recordings/{id}.json
```

**Recording Format:**
```typescript
{
  metadata: {
    id: string;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    centerFreq: number;
    sampleRate: number;
    fftSize: number;
    minFreq: number;
    maxFreq: number;
    packetCount: number;
    controlChannelEvents: number;
    transmissions: number;  // grant events
    uniqueTalkgroups: number;
    fileSize: number;
  },
  packets: [{
    timestamp: number;
    relativeTime: number;  // ms from start
    magnitudes: number[];
  }],
  controlChannelEvents: [{
    ...event,
    relativeTime: number;
  }]
}
```

### FFT Replayer (`server/src/services/spectrum/fft-replayer.ts`)

Plays back recorded spectrum data at original timing.

**Features:**
- Maintains relative timing between packets
- Pause/resume support
- Optional looping
- Progress events every 30 packets
- Emits FFT events identical to live data

---

## WebSocket Broadcasting

### Broadcast Server (`server/src/services/broadcast/websocket.ts`)

Central hub for all client communications.

**Client Subscription Model:**
```typescript
interface ClientState {
  subscribedTalkgroups: Set<number>;  // empty = all
  streamAudio: boolean;
  streamFFT: boolean;
}
```

**Message Types:**

| Type | Format | Filtering |
|------|--------|-----------|
| `callStart` | JSON | Talkgroup subscription |
| `callEnd` | JSON | Talkgroup subscription |
| `callsActive` | JSON | None (all clients) |
| `newRecording` | JSON | streamAudio + talkgroup |
| `controlChannel` | JSON | None (all clients) |
| `rates` | JSON | None (all clients) |
| FFT data | Binary | streamFFT enabled |
| Audio data | Binary | streamAudio + talkgroup |

**Binary Message Format (FFT/Audio):**
```
┌─────────────────┬─────────────────────────┬──────────────────┐
│ Header Length   │ JSON Header             │ Data Payload     │
│ 4 bytes         │ variable                │ remaining bytes  │
│ little-endian   │ {type, ...metadata}     │ Float32/Int16    │
└─────────────────┴─────────────────────────┴──────────────────┘
```

**Client Commands:**
| Command | Description |
|---------|-------------|
| `subscribeAll` | Receive all talkgroup traffic |
| `subscribe` | Subscribe to specific talkgroups |
| `unsubscribe` | Unsubscribe from specific talkgroups |
| `enableAudio` | Start/stop audio streaming |
| `enableFFT` | Start/stop FFT streaming |

---

## Client-Side Processing

### WebSocket Hook (`client/src/hooks/useWebSocket.ts`)

Singleton WebSocket manager with reference counting.

**Features:**
- Single connection shared across components
- Automatic reconnection (3-second retry)
- Binary message parsing
- Event routing to stores

**Binary Parsing:**
```typescript
// Parse header
const headerLen = dataView.getUint32(0, true);
const headerJson = decoder.decode(data.slice(4, 4 + headerLen));
const header = JSON.parse(headerJson);

// Parse payload
if (header.type === 'fft') {
  magnitudes = new Float32Array(data.slice(4 + headerLen).buffer);
} else if (header.type === 'audio') {
  samples = new Int16Array(data.slice(4 + headerLen).buffer);
}
```

### FFT Store (`client/src/store/fft.ts`)

Zustand store for spectrum visualization state.

**State:**
```typescript
{
  isEnabled: boolean;
  currentFFT: FFTData | null;
  waterfallHistory: Float32Array[];  // Ring buffer, max 256 rows
  minDb: number;
  maxDb: number;
  colorScheme: 'viridis' | 'plasma' | 'grayscale' | 'classic';
  showWaterfall: boolean;
  showSpectrum: boolean;
}
```

**Auto-Scaling:**
- Calculates min/max from incoming data
- On first data or range mismatch: adjusts to data range ± 10dB
- Maintains history as ring buffer for waterfall display

---

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health status |
| `/api/calls` | GET | List calls with pagination |
| `/api/calls/:id` | GET | Get specific call |
| `/api/audio/:id` | GET | Stream call audio file |
| `/api/talkgroups` | GET | List all talkgroups |
| `/api/talkgroups/:id` | GET | Get specific talkgroup |

### Spectrum Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sdr` | GET | Current SDR configuration |
| `/api/sdr/devices` | GET | Detect RTL-SDR devices |
| `/api/spectrum/recordings` | GET | List saved recordings |
| `/api/spectrum/recording/start` | POST | Start spectrum recording |
| `/api/spectrum/recording/stop` | POST | Stop current recording |
| `/api/spectrum/recording/status` | GET | Recording progress |
| `/api/spectrum/recordings/:id` | GET | Get recording metadata |
| `/api/spectrum/recordings/:id` | DELETE | Delete recording |
| `/api/spectrum/replay/status` | GET | Replay state |
| `/api/spectrum/replay/start` | POST | Start playback |
| `/api/spectrum/replay/stop` | POST | Stop playback |
| `/api/spectrum/replay/pause` | POST | Pause playback |
| `/api/spectrum/replay/resume` | POST | Resume playback |
| `/api/spectrum/scanner/status` | GET | Scanner data availability |
| `/api/spectrum/scanner/scan` | POST | Scan frequency array |
| `/api/spectrum/scanner/signal/:freq` | GET | Signal at frequency |

### RadioReference Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rr/states` | GET | List states |
| `/api/rr/counties/:stateId` | GET | Counties in state |
| `/api/rr/systems` | GET | List P25 systems |
| `/api/rr/systems/:id` | GET | System details |
| `/api/rr/systems/:id/sites` | GET | System sites |
| `/api/rr/systems/:id/talkgroups` | GET | System talkgroups |
| `/api/rr/control-channels/:county` | GET | Control channels for county |
| `/api/rr/stats` | GET | Database statistics |

---

## Key Technical Details

### Frequency Calculations

**SDR Coverage:**
```
minFreq = centerFreq - (sampleRate / 2)
maxFreq = centerFreq + (sampleRate / 2)
```

**FFT Bin Mapping:**
```
binWidth = (maxFreq - minFreq) / fftSize
binIndex = (targetFreq - minFreq) / binWidth
```

### Signal Detection Thresholds

| Parameter | Default Value |
|-----------|---------------|
| Signal threshold | -85 dB |
| SNR threshold | 10 dB |
| Noise floor exclusion radius | 50 kHz |

### Performance Considerations

- FFT broadcast skipped if no subscribers
- Waterfall history limited to 256 rows
- Control channel feed limited to 200 events
- WebSocket reconnect delay: 3 seconds
- Recording auto-stops at specified duration
