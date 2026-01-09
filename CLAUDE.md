# Claude Code Instructions

This project uses `just` as the command runner. Always use `just <command>` instead of raw npm/bash commands.

## Quick Reference

| Command | Description |
|---------|-------------|
| `just` | Show all available commands |
| `just start` | Start production server (auto-kills ports, auto-builds) |
| `just dev` | Start development mode with hot reloading |
| `just stop` | Stop all running services |
| `just status` | Show what's running on each port |
| `just health` | Check API health endpoint |

## All Commands

### Running the Stack
- `just start` - Start full production stack
- `just dev` - Development mode with hot reload
- `just server` - Start only the backend server
- `just client` - Start only the Vite dev server
- `just stop` - Stop all services and free ports

### Setup & Build
- `just install` - Install npm dependencies
- `just build` - Build server and client
- `just clean` - Remove node_modules and dist, reinstall

### Trunk-Recorder
- `just trunk-recorder` - Start trunk-recorder (needs RTL-SDR)
- `just build-trunk-recorder` - Compile trunk-recorder from source

### Database
- `just db` - Open SQLite database in interactive mode
- `just db-reset` - Delete database (recreated on next start)
- `just db-stats` - Show call/talkgroup counts

### Audio Files
- `just recordings` - List 20 most recent recordings
- `just clean-audio` - Delete recordings older than 7 days
- `just clean-audio 30` - Delete recordings older than 30 days

### Development
- `just typecheck` - Run TypeScript type checking
- `just format` - Format code with prettier
- `just lint` - Run linter

### Unit Testing
- `just test-unit` - Run all unit tests (server + client)
- `just test-server` - Run server unit tests only
- `just test-client` - Run client unit tests only
- `just test-coverage` - Run unit tests with coverage report
- `just ci` - Run all CI checks locally (build + tests + typecheck)

### Monitoring
- `just status` - Show port usage and RTL-SDR status
- `just health` - Query API health endpoint
- `just logs` - Tail server logs

### Git Shortcuts
- `just gs` - git status
- `just commit "message"` - Stage all and commit
- `just push "message"` - Stage, commit, and push

## Port Reference

| Port | Service |
|------|---------|
| 3000 | Node.js HTTP server + WebSocket |
| 3001 | trunk-recorder status WebSocket |
| 5173 | Vite dev server (dev mode only) |
| 9000 | trunk-recorder UDP audio stream |

## When Asked to Run/Start/Build

Always use `just`:
- "Run the server" → `just start` or `just dev`
- "Build the project" → `just build`
- "Stop everything" → `just stop`
- "Check if it's running" → `just status`

## Audio Playback Components

### WaveformPlayer

**ALWAYS use `WaveformPlayer` for audio file playback.** Never use a basic `<audio>` element.

Location: `client/src/components/audio/WaveformPlayer.tsx`

Features:
- Visual waveform display
- Click/drag to scrub through audio
- Play/pause controls
- Volume control with slider
- Time display (current / duration)
- Keyboard shortcuts (space, arrows)
- Touch support for mobile

```tsx
import { WaveformPlayer } from '../components/audio/WaveformPlayer';

// Basic usage
<WaveformPlayer src="/api/audio/call-123" />

// Full props
<WaveformPlayer
  src="/api/audio/call-123"
  title="Phoenix PD Dispatch"
  height={80}                    // Waveform height in px
  waveColor="#475569"            // Unplayed portion color
  progressColor="#3b82f6"        // Played portion color
  cursorColor="#ef4444"          // Playhead color
  backgroundColor="#0f172a"      // Canvas background
  autoPlay={false}
  initialVolume={0.8}
  showVolumeControl={true}
  showTimeDisplay={true}
  compact={false}                // Smaller controls
  onPlay={() => {}}
  onPause={() => {}}
  onEnded={() => {}}
  onTimeUpdate={(time) => {}}
/>
```

Recommended colors for dark theme:
- `waveColor="#475569"` (slate-600)
- `progressColor="#3b82f6"` (blue-500)
- `cursorColor="#ef4444"` (red-500)
- `backgroundColor="#0f172a"` (slate-950)

## Testing Requirements

**ALWAYS follow the testing plan in `TESTING.md` after making changes.**

### Mandatory Steps After Every Change

1. **Build must pass:**
   ```bash
   just build
   ```
   Do NOT commit if build fails.

2. **Verify server starts** (for server changes):
   ```bash
   just start
   # Then in another terminal:
   just health
   ```

3. **Test affected features** - See TESTING.md for component-specific tests.

### Quick Test Commands

| Change Type | Test Command |
|-------------|--------------|
| Any change | `just build` |
| Server/API | `just build && just start` then `just health` |
| Database | `just build && just db-stats` |
| UI Component | `just dev` then check browser |
| WebSocket | `just dev` then check connection status in UI |
| Audio | `just dev` then play a recording |

### Before Committing Checklist

- [ ] `just build` passes
- [ ] Server starts without errors
- [ ] UI loads without console errors
- [ ] Affected features work correctly
- [ ] No regressions in related features

### Test Failure Protocol

If tests fail:
1. Fix the issue
2. Re-run `just build`
3. Verify fix didn't break other features
4. Only then commit

See `TESTING.md` for the full testing plan.

## Traffic Rules

**NEVER create a "demo" mode, mock data, simulated traffic, or fake radio calls.**

This project works exclusively with real trunk-recorder traffic. When implementing features:

- Only integrate with real trunk-recorder WebSocket feeds and audio streams
- Do not generate synthetic or sample radio traffic
- Do not create placeholder data or mock calls
- Do not implement any "demo", "test mode", or "simulation" functionality
- All traffic must come from actual trunk-recorder instances

If trunk-recorder is not available, the application should show no traffic rather than generating fake data.
