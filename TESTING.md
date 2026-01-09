# Testing Plan

This document defines the testing strategy for the Radio Scanner project. All code changes must follow this testing plan.

## Quick Reference

| Change Type | Required Tests |
|-------------|----------------|
| Bug fix | Manual verification + regression check |
| New component | Build + manual UI test |
| API change | Build + API endpoint test |
| Database change | Build + DB operation test |
| WebSocket change | Build + connection test |
| Audio change | Build + playback test |
| Spectrum/FFT change | Build + spectrum page test |
| Scanner change | Build + scanner API test |
| RadioReference | Build + RR API test |

## Testing Commands

```bash
# Build everything (required before all tests)
just build

# Start the stack for manual testing
just dev

# Check system status
just status

# Test API health
just health

# Check database
just db-stats

# Type checking (optional, stricter)
just typecheck
```

---

## Pre-Change Checklist

Before making any code changes:

1. **Verify current state works**
   ```bash
   just build
   just status
   ```

2. **Note what you're changing** - Record affected:
   - Files
   - Components
   - API endpoints
   - Database tables

---

## Post-Change Verification

### Level 1: Build Verification (REQUIRED for all changes)

```bash
just build
```

Must complete without errors. If build fails:
1. Fix TypeScript/compilation errors
2. Do not proceed until build passes

### Level 2: Server Verification (for server changes)

```bash
just start
# In another terminal:
just health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": <number>,
  "trunkRecorder": <boolean>,
  "audioReceiver": <boolean>,
  "clients": <number>
}
```

### Level 3: API Endpoint Tests (for API changes)

Test affected endpoints:

```bash
# Calls API
curl -s http://localhost:3000/api/calls | head -c 500
curl -s http://localhost:3000/api/calls?limit=5
curl -s http://localhost:3000/api/calls/<call-id>

# Talkgroups API
curl -s http://localhost:3000/api/talkgroups | head -c 500
curl -s http://localhost:3000/api/talkgroups/<tg-id>

# Audio API (if call exists with audio)
curl -I http://localhost:3000/api/audio/<call-id>

# RadioReference API
curl -s http://localhost:3000/api/rr/states | head -c 500
curl -s http://localhost:3000/api/rr/systems?limit=5
curl -s http://localhost:3000/api/rr/stats

# SDR/Spectrum API
curl -s http://localhost:3000/api/sdr
curl -s http://localhost:3000/api/spectrum/recordings
curl -s http://localhost:3000/api/spectrum/scanner/status
```

### Level 4: WebSocket Tests (for WebSocket changes)

```bash
# Install websocat if needed: brew install websocat
websocat ws://localhost:3000/ws
```

Expected: Receive `{"type":"connected","clientId":"..."}` message

Test subscription:
```json
{"type":"subscribeAll"}
```

### Level 5: UI Verification (for client changes)

1. Open http://localhost:3000 (or http://localhost:5173 in dev mode)
2. Verify affected components render correctly
3. Test user interactions (clicks, inputs, etc.)
4. Check browser console for errors

---

## Component-Specific Tests

### Database Changes

After modifying `/server/src/db/*.ts`:

```bash
just build
just db-reset  # If schema changed
just start

# Verify tables exist
just db
.tables
.schema calls
.schema talkgroups
.quit

# After some traffic, verify data
just db-stats
```

### Audio Components

After modifying `WaveformPlayer` or audio handling:

1. Start the stack: `just dev`
2. Navigate to a call with audio
3. Test:
   - [ ] Waveform renders
   - [ ] Play/pause works
   - [ ] Scrubbing works (click on waveform)
   - [ ] Volume slider works without stopping playback
   - [ ] Time display updates
   - [ ] Keyboard shortcuts (space, arrows)

### WebSocket/Real-time

After modifying WebSocket handling:

1. Start with `just dev`
2. Open browser to http://localhost:5173
3. Check:
   - [ ] Connection status indicator
   - [ ] Calls appear in real-time (if trunk-recorder running)
   - [ ] No console errors
   - [ ] Reconnection works (stop/start server)

### Talkgroup Filter

After modifying talkgroup selection:

1. Open the UI
2. Test:
   - [ ] All talkgroups listed
   - [ ] Toggle selection works
   - [ ] "All" button works
   - [ ] "None" button works
   - [ ] Search/filter works
   - [ ] Selection persists

### Control Channel Feed

After modifying control channel handling:

1. Verify events appear in feed (if trunk-recorder running)
2. Check event formatting (time, frequency, talkgroup)
3. Verify color coding by event type

### Spectrum/FFT Visualization

After modifying spectrum components:

1. Navigate to the Spectrum page
2. Test:
   - [ ] Start/stop FFT streaming
   - [ ] Waterfall renders with data
   - [ ] Color scheme selector works
   - [ ] Gain/range controls adjust display
   - [ ] Recording start/stop works
   - [ ] Recorded spectrum can be replayed

### Spectrum Recording/Replay

After modifying recording functionality:

```bash
# Test recording API
curl -X POST http://localhost:3000/api/spectrum/recording/start \
  -H "Content-Type: application/json" \
  -d '{"duration": 10}'

# Check status
curl http://localhost:3000/api/spectrum/recording/status

# List recordings
curl http://localhost:3000/api/spectrum/recordings
```

### Control Channel Scanner

After modifying the scanner:

1. Navigate to the Scanner page
2. Test:
   - [ ] State/county selection works
   - [ ] Control channels load from database
   - [ ] Scan button triggers frequency analysis
   - [ ] Auto-scan toggle works
   - [ ] Signal strength indicators update
   - [ ] In-range/active counts are correct

### Frequency Scanner API

```bash
# Check scanner status
curl http://localhost:3000/api/spectrum/scanner/status

# Scan specific frequencies
curl -X POST http://localhost:3000/api/spectrum/scanner/scan \
  -H "Content-Type: application/json" \
  -d '{"frequencies": [770106250, 770356250]}'

# Get signal at frequency
curl http://localhost:3000/api/spectrum/scanner/signal/770106250
```

### RadioReference Integration

After modifying RadioReference functionality:

```bash
# Test database stats
curl http://localhost:3000/api/rr/stats

# Test state listing
curl http://localhost:3000/api/rr/states

# Test control channel lookup
curl "http://localhost:3000/api/rr/control-channels/maricopa"
```

---

## Regression Tests

When fixing a bug, verify these still work:

### Core Functionality
- [ ] Server starts without errors
- [ ] WebSocket connects
- [ ] API endpoints respond
- [ ] Database operations work

### UI Functionality
- [ ] App loads in browser
- [ ] Navigation works (Live/Browse tabs)
- [ ] Call list displays
- [ ] Call details panel works
- [ ] Audio playback works

### Real-time Features (if trunk-recorder available)
- [ ] Live calls appear
- [ ] Control channel events stream
- [ ] Audio streaming works
- [ ] Talkgroup filtering works

---

## Test Data

### Without trunk-recorder

The system will show empty call lists. This is expected. Test:
- UI renders correctly with no data
- API returns empty arrays
- No console errors

### With previous recordings

If `trunk-recorder/audio/` has recordings:
```bash
just recordings
```

Verify calls from recordings appear in UI and can be played back.

---

## Error Scenarios to Test

### Server not running
- Client should show disconnected status
- Should attempt reconnection

### Database file missing
- Server should create new database
- Tables should be initialized

### Audio file missing
- Should show error message (not crash)
- API should return 404

### Invalid API parameters
- Should return appropriate error codes
- Should not crash server

---

## Performance Checks

### Large datasets
- Call list should handle 500+ calls
- Talkgroup list should handle 100+ talkgroups
- Control channel feed limited to 200 events

### Memory leaks
- WebSocket connections should clean up
- Audio players should release resources
- File watchers should not accumulate

---

## Before Committing

1. **Build passes**: `just build`
2. **Server starts**: `just start` (Ctrl+C to stop)
3. **UI loads**: Check http://localhost:3000
4. **No console errors**: Check browser dev tools
5. **Affected features tested**: Run through relevant test sections above

---

## Test Failure Resolution

### Build fails
1. Read the error message carefully
2. Fix TypeScript/syntax errors
3. Re-run `just build`

### Server won't start
1. Check port conflicts: `just status`
2. Clear ports: `just stop`
3. Check logs for errors
4. Verify database: `just db-reset` if schema issues

### API returns errors
1. Check server logs
2. Verify request format
3. Check database state

### UI doesn't render
1. Check browser console
2. Verify API responses
3. Check component props

### Audio doesn't play
1. Verify audio file exists
2. Check browser audio permissions
3. Test with simple HTML audio element first
