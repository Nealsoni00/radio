# Live Audio Streaming - Testing Guide

This document explains how to test and debug the live audio streaming pipeline from trunk-recorder to the web client.

## Architecture Overview

```
trunk-recorder (C++)
        │
        │ UDP packets (port 9000)
        │ Format: [4 bytes JSON length][JSON metadata][PCM Int16 audio]
        ▼
   AudioReceiver (Node.js server)
        │
        │ EventEmitter 'audio' events
        ▼
   BroadcastServer (WebSocket)
        │
        │ Binary WebSocket messages
        │ Format: [4 bytes header length][JSON header][PCM data]
        ▼
   Client WebSocket (useWebSocket.ts)
        │
        │ CustomEvent 'audioChunk'
        ▼
   FloatingAudioPlayer (LivePCMPlayer)
        │
        │ Web Audio API with resampling
        ▼
   Browser Audio Output
```

## Critical Configuration

### trunk-recorder/config.json

The **most important setting** for live audio streaming:

```json
{
  "audioStreaming": true,  // MUST be true for live audio!
  "plugins": [
    {
      "library": ".../libsimplestream.so",
      "name": "Simple Stream",
      "enabled": true,
      "streams": [
        {
          "TGID": 0,           // 0 = all talkgroups
          "address": "127.0.0.1",
          "port": 9000,
          "sendJSON": true,     // Required for metadata
          "sendCallStart": true,
          "sendCallEnd": true
        }
      ]
    }
  ]
}
```

**If `audioStreaming` is `false`**, the simplestream plugin will ONLY send `call_start` and `call_end` events (metadata only, no audio). Setting it to `true` enables the `audio_stream` callback which sends actual PCM samples during calls.

## Debug Script Usage

### scripts/debug-live-audio.ts

A comprehensive testing script to diagnose audio streaming issues.

#### WebSocket Test (Most Common)

```bash
npx tsx scripts/debug-live-audio.ts websocket
```

This connects to the server's WebSocket and listens for audio broadcasts. You should see output like:

```
[WS] Audio packet #1: TG=929 samples=1280 duration=160ms alphaTag="3a1"
[WS] Audio packet #2: TG=929 samples=1920 duration=240ms alphaTag="3a1"
```

**Key indicators:**
- `samples=0` - BAD - No audio data, only metadata events
- `samples=1280` - GOOD - Actual audio data is streaming
- `event:"call_start"` - Metadata event, no audio
- `event:"audio"` - Actual audio data packet

#### UDP Test (Direct)

```bash
# Stop the server first (it binds to port 9000)
just stop
npx tsx scripts/debug-live-audio.ts udp
```

This listens directly on UDP port 9000 to see what trunk-recorder is sending.

#### Simulated Audio Test

```bash
npx tsx scripts/debug-live-audio.ts simulate
```

Sends test audio packets to port 9000 to verify the server processes them correctly.

## Troubleshooting

### Problem: Audio packets have 0 samples

**Symptom:**
```
Audio packet #1: TG=929 samples=0 duration=0ms
```

**Cause:** `audioStreaming: false` in trunk-recorder config

**Fix:** Set `"audioStreaming": true` and restart trunk-recorder

### Problem: No audio packets received

**Symptom:** Debug script shows no audio packets at all

**Possible causes:**
1. trunk-recorder not running (`just trunk-recorder`)
2. simplestream plugin not loaded (check trunk-recorder logs)
3. Server not listening on port 9000 (`just health`)
4. WebSocket client not subscribed (`enableAudio: true`)

### Problem: Audio plays but sounds distorted

**Possible causes:**
1. Sample rate mismatch - check `audio_sample_rate` in metadata (should be 8000)
2. Resampling issue in LivePCMPlayer
3. Buffer underrun - packets arriving too slowly

### Problem: Client receives packets but no sound

**Check:**
1. Browser console for AudioContext errors
2. Volume settings (master and per-talkgroup)
3. AudioContext suspended (needs user interaction to start)
4. `isLiveEnabled` state in client

## Server Logs to Monitor

### UDP Packet Reception (AudioReceiver)
```
[AudioReceiver] Packet #100 - TG:929 size:2560bytes rate:8000 event:audio
```

### WebSocket Broadcasting (BroadcastServer)
```
[BroadcastServer] Audio packet #100 TG:929 - sent to 2/3 clients (2 have audio enabled)
```

### Client Subscription
```
[WS Server] Client client_xxx audio streaming CHANGED to: true
```

## Quick Health Check

```bash
# 1. Check all services are running
just status

# 2. Check API health
just health

# 3. Run WebSocket test
npx tsx scripts/debug-live-audio.ts websocket

# Expected: Audio packets with samples > 0
```

## Common Fixes Summary

| Issue | Fix |
|-------|-----|
| No audio samples (0 samples) | Set `audioStreaming: true` in config |
| No packets at all | Check trunk-recorder is running |
| Server not receiving UDP | Check port 9000 isn't blocked |
| Client not receiving | Check enableAudio was sent |
| No sound in browser | Check volume, click to resume AudioContext |
