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
