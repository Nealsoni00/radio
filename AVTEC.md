# Avtec Integration Guide

This document describes how to stream radio traffic from this Radio Scanner to an Avtec-compatible audio receiver, such as Prepared911's `audio-collector`.

## Overview

The Avtec integration allows real-time streaming of P25 radio traffic to external systems that speak the Avtec protocol. This is useful for:

- Integrating with CAD (Computer-Aided Dispatch) systems
- Feeding audio to transcription services
- Connecting to Prepared911's audio-collector for AI-powered dispatch

## How It Works

The Avtec protocol uses two channels:

| Channel | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Metadata | 50911 | TCP | Call start/end events, talkgroup info, unit IDs |
| Audio | 50911 | UDP/RTP | G.711 μ-law encoded audio packets |

### Data Flow

```
trunk-recorder
      │
      ├── UDP 9000 (PCM audio) ──────────────────┐
      │                                          │
      └── WebSocket 3001 (call events) ────┐     │
                                           │     │
                                           ▼     ▼
                                    ┌─────────────────┐
                                    │  Radio Scanner  │
                                    │     Server      │
                                    └────────┬────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          │                  │                  │
                          ▼                  ▼                  ▼
                    TCP 50911          UDP 50911          Web Browser
                    (metadata)         (RTP audio)        (localhost:3000)
                          │                  │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ audio-collector │
                          │  (Prepared911)  │
                          └─────────────────┘
```

### Protocol Details

**Metadata Packet (TCP):**
```
Bytes 0-1:   Magic "PM" (0x50 0x4d)
Bytes 2-3:   Reserved
Bytes 4-7:   Session ID (uint32 LE) - matches SSRC in audio
Bytes 8-9:   Reserved
Bytes 10-11: Sequence number (uint16 LE)
Bytes 12-13: Message type (uint16 LE)
Bytes 14-15: Payload size (uint16 LE)
Bytes 16+:   Payload (varies by message type)
```

**Audio Packet (UDP/RTP):**
```
Bytes 0-11:  RTP Header
  - Byte 0:     Version (2), Padding, Extension, CSRC count
  - Byte 1:     Marker bit, Payload type (0 = G.711 μ-law)
  - Bytes 2-3:  Sequence number (uint16 BE)
  - Bytes 4-7:  Timestamp (uint32 BE)
  - Bytes 8-11: SSRC (uint32 BE) - matches Session ID in metadata
Bytes 12+:   G.711 μ-law audio payload
```

## Configuration

### Environment Variables

The Avtec streamer can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AVTEC_HOST` | `127.0.0.1` | Target host for audio-collector |
| `AVTEC_PORT` | `50911` | Target port (same for TCP and UDP) |
| `AVTEC_ENABLED` | `true` | Enable/disable streaming |

### Runtime Configuration

You can also configure via the API at runtime:

```bash
# Get current config
curl http://localhost:3000/api/avtec/config

# Update config
curl -X PUT http://localhost:3000/api/avtec/config \
  -H "Content-Type: application/json" \
  -d '{"targetHost": "192.168.1.100", "targetPort": 50911, "enabled": true}'
```

### Server Code Configuration

In `server/src/index.ts`, the Avtec streamer is initialized with:

```typescript
const avtecStreamer = new AvtecStreamer({
  targetHost: process.env.AVTEC_HOST || '127.0.0.1',
  targetPort: parseInt(process.env.AVTEC_PORT || '50911'),
  enabled: process.env.AVTEC_ENABLED !== 'false',
});
```

## Setting Up audio-collector

### Prerequisites

1. Docker installed on your system
2. Network connectivity between Radio Scanner and audio-collector

### Running audio-collector Locally

```bash
# Pull the latest audio-collector image
docker pull ghcr.io/prepared911/audio-collector:latest

# Run audio-collector
docker run -d \
  --name audio-collector \
  -p 50911:50911 \
  -p 50911:50911/udp \
  -e LOG_LEVEL=debug \
  ghcr.io/prepared911/audio-collector:latest
```

### Running with Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  audio-collector:
    image: ghcr.io/prepared911/audio-collector:latest
    ports:
      - "50911:50911"      # TCP for metadata
      - "50911:50911/udp"  # UDP for audio
    environment:
      - LOG_LEVEL=debug
    restart: unless-stopped
```

Start with:
```bash
docker-compose up -d
```

### Verifying Connection

1. Start the Radio Scanner:
   ```bash
   npm start
   ```

2. Check Avtec status:
   ```bash
   curl http://localhost:3000/api/avtec/status
   ```

   You should see:
   ```json
   {
     "enabled": true,
     "connected": true,
     "targetHost": "127.0.0.1",
     "targetPort": 50911,
     "activeCalls": 0,
     "stats": {
       "packetsUdpSent": 0,
       "packetsTcpSent": 0,
       "bytesUdpSent": 0,
       "bytesTcpSent": 0,
       "udpErrors": 0,
       "tcpErrors": 0,
       "callsStarted": 0,
       "callsEnded": 0
     }
   }
   ```

3. Check audio-collector logs:
   ```bash
   docker logs -f audio-collector
   ```

## API Endpoints

### GET /api/avtec/status

Returns current status and statistics.

**Response:**
```json
{
  "enabled": true,
  "connected": true,
  "targetHost": "127.0.0.1",
  "targetPort": 50911,
  "activeCalls": 2,
  "stats": {
    "packetsUdpSent": 15420,
    "packetsTcpSent": 48,
    "bytesUdpSent": 2468800,
    "bytesTcpSent": 3840,
    "udpErrors": 0,
    "tcpErrors": 0,
    "callsStarted": 24,
    "callsEnded": 22,
    "lastPacketTime": 1704931200000,
    "lastConnectionTime": 1704928000000,
    "lastError": null,
    "lastErrorTime": null
  },
  "uptime": 3600000
}
```

### GET /api/avtec/config

Returns current configuration.

**Response:**
```json
{
  "targetHost": "127.0.0.1",
  "targetPort": 50911,
  "enabled": true
}
```

### PUT /api/avtec/config

Update configuration. Changes take effect immediately.

**Request:**
```json
{
  "targetHost": "192.168.1.100",
  "targetPort": 50911,
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "targetHost": "192.168.1.100",
    "targetPort": 50911,
    "enabled": true
  }
}
```

### POST /api/avtec/reset-stats

Reset all statistics counters.

**Response:**
```json
{
  "success": true
}
```

## Complete Local Setup

Here's a complete setup to run everything locally:

### 1. Start audio-collector

```bash
docker run -d \
  --name audio-collector \
  -p 50911:50911 \
  -p 50911:50911/udp \
  ghcr.io/prepared911/audio-collector:latest
```

### 2. Start Radio Scanner

```bash
cd /path/to/radio
npm start
```

### 3. Start trunk-recorder

```bash
cd trunk-recorder
./trunk-recorder --config=config.json
```

### 4. Verify Everything is Connected

```bash
# Check Radio Scanner health
curl http://localhost:3000/api/health

# Check Avtec streamer status
curl http://localhost:3000/api/avtec/status

# Watch audio-collector logs
docker logs -f audio-collector
```

## Network Configuration

### Same Machine

When running everything on the same machine:

```
Radio Scanner (localhost:3000) ──► audio-collector (localhost:50911)
```

Default configuration works out of the box.

### Remote audio-collector

When audio-collector is on a different machine:

1. Update Avtec config:
   ```bash
   curl -X PUT http://localhost:3000/api/avtec/config \
     -H "Content-Type: application/json" \
     -d '{"targetHost": "AUDIO_COLLECTOR_IP", "targetPort": 50911}'
   ```

2. Ensure firewall allows:
   - TCP 50911 (metadata)
   - UDP 50911 (audio)

### Docker Networking

If Radio Scanner runs in Docker alongside audio-collector:

```yaml
version: '3.8'

services:
  radio-scanner:
    build: .
    ports:
      - "3000:3000"
    environment:
      - AVTEC_HOST=audio-collector
      - AVTEC_PORT=50911

  audio-collector:
    image: ghcr.io/prepared911/audio-collector:latest
    ports:
      - "50911:50911"
      - "50911:50911/udp"
```

Use the service name `audio-collector` as the host.

## Troubleshooting

### Connection Refused

**Symptom:** `TCP error: connect ECONNREFUSED`

**Solutions:**
1. Verify audio-collector is running: `docker ps`
2. Check port is listening: `netstat -an | grep 50911`
3. Verify firewall rules allow the connection

### No Audio Received

**Symptom:** TCP connected but no audio packets sent

**Check:**
1. Verify trunk-recorder is sending audio:
   ```bash
   curl http://localhost:3000/api/health
   # Look for "trunkRecorder": true
   ```

2. Check for active calls in Avtec status:
   ```bash
   curl http://localhost:3000/api/avtec/status | jq '.activeCalls'
   ```

3. Verify UDP isn't being blocked:
   ```bash
   # On the audio-collector machine
   tcpdump -i any port 50911 -n
   ```

### High UDP Errors

**Symptom:** `stats.udpErrors` increasing

**Possible causes:**
1. Network congestion
2. audio-collector not listening on UDP
3. Firewall blocking UDP

**Debug:**
```bash
# Check UDP socket on audio-collector
ss -ulnp | grep 50911
```

### Call Metadata Not Matching Audio

**Symptom:** Audio plays but wrong talkgroup info

**Note:** The Session ID in TCP metadata must match the SSRC in UDP audio packets. The Radio Scanner handles this automatically by using the same value for both.

## Audio Format Details

| Parameter | Value |
|-----------|-------|
| Codec | G.711 μ-law (PCMU) |
| Sample Rate | 8000 Hz |
| Channels | Mono |
| Bit Depth | 8-bit (after μ-law compression) |
| RTP Payload Type | 0 |

The Radio Scanner receives 16-bit signed PCM at 8000 Hz from trunk-recorder and converts it to G.711 μ-law before sending via RTP.

## Logging

Enable debug logging to see Avtec packet flow:

```bash
# Server logs show Avtec activity
npm start 2>&1 | grep AvtecStreamer
```

You'll see:
```
[AvtecStreamer] Starting - connecting to 127.0.0.1:50911
[AvtecStreamer] TCP connected
[AvtecStreamer] Call started: 812-1704931200 TG:812 (Fire Dispatch) sessionId:53215232 ssrc:53215232
[AvtecStreamer] First audio packet TG:812 - PCM input: 640 bytes
[AvtecStreamer] First audio packet TG:812 - μ-law output: 320 bytes
[AvtecStreamer] Call ended: 812-1704931200 TG:812
```
