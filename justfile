# =============================================================================
# Radio Scanner - Command Reference
# =============================================================================
# Run `just` to see all available commands
# Run `just <command>` to execute a command
# =============================================================================

# Default: show available commands
default:
    @just --list

# -----------------------------------------------------------------------------
# Setup & Build
# -----------------------------------------------------------------------------

# Install all dependencies
install:
    npm install

# Build server and client for production
build:
    npm run build

# Clean build artifacts and reinstall
clean:
    rm -rf node_modules server/dist client/dist server/data/*.db
    npm install

# -----------------------------------------------------------------------------
# Running the Stack
# -----------------------------------------------------------------------------

# Start the full stack (kills existing processes on ports first)
start: _kill-ports _ensure-built
    #!/usr/bin/env bash
    set -e
    echo "Starting Radio Scanner..."
    echo ""
    mkdir -p trunk-recorder/audio
    npm start &
    SERVER_PID=$!
    sleep 2
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Server running: http://localhost:3000"
    echo "WebSocket:      ws://localhost:3000/ws"
    echo "API Health:     http://localhost:3000/api/health"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Press Ctrl+C to stop"
    wait $SERVER_PID

# Start in development mode with hot reloading
dev: _kill-ports _ensure-deps
    #!/usr/bin/env bash
    set -e
    echo "Starting development servers..."
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Server (API):   http://localhost:3000"
    echo "Client (Vite):  http://localhost:5173"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    npm run dev

# Start only the server (no client)
server: _kill-ports _ensure-built
    npm start

# Start only the client dev server
client:
    npm run dev:client

# Stop all running services
stop:
    #!/usr/bin/env bash
    echo "Stopping Radio Scanner services..."
    for port in 3000 3001 5173 9000; do
        pids=$(lsof -ti :$port 2>/dev/null || true)
        if [[ -n "$pids" ]]; then
            echo "Killing processes on port $port: $pids"
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    done
    # Kill trunk-recorder if running
    pkill -f "trunk-recorder" 2>/dev/null || true
    echo "All services stopped"

# -----------------------------------------------------------------------------
# Trunk-Recorder
# -----------------------------------------------------------------------------

# Start trunk-recorder (requires RTL-SDR connected)
trunk-recorder:
    #!/usr/bin/env bash
    set -e
    TR_BIN=$(which trunk-recorder 2>/dev/null || echo "")
    if [[ -z "$TR_BIN" ]]; then
        for loc in /usr/local/bin/trunk-recorder /usr/bin/trunk-recorder ~/trunk-recorder/build/trunk-recorder ./tr-build/build/trunk-recorder; do
            if [[ -x "$loc" ]]; then
                TR_BIN="$loc"
                break
            fi
        done
    fi
    if [[ -z "$TR_BIN" ]]; then
        echo "Error: trunk-recorder not found"
        echo "Build it with: just build-trunk-recorder"
        exit 1
    fi
    cd trunk-recorder
    "$TR_BIN" --config=config.json

# Build trunk-recorder from source (requires cmake, gnuradio)
build-trunk-recorder:
    #!/usr/bin/env bash
    set -e
    cd tr-build
    mkdir -p build
    cd build
    cmake ..
    make -j$(sysctl -n hw.ncpu 2>/dev/null || nproc)
    echo ""
    echo "trunk-recorder built at: $(pwd)/trunk-recorder"

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

# Open the SQLite database
db:
    sqlite3 server/data/radio.db

# Reset the database (deletes all data)
db-reset:
    rm -f server/data/radio.db server/data/radio.db-shm server/data/radio.db-wal
    @echo "Database reset. Will be recreated on next server start."

# Show database statistics
db-stats:
    #!/usr/bin/env bash
    echo "Database Statistics"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    sqlite3 server/data/radio.db "SELECT 'Calls: ' || COUNT(*) FROM calls;"
    sqlite3 server/data/radio.db "SELECT 'Talkgroups: ' || COUNT(*) FROM talkgroups;"
    sqlite3 server/data/radio.db "SELECT 'Call Sources: ' || COUNT(*) FROM call_sources;"

# -----------------------------------------------------------------------------
# Logs & Monitoring
# -----------------------------------------------------------------------------

# Watch server logs
logs:
    tail -f server/data/*.log 2>/dev/null || echo "No log files found"

# Show system status
status:
    #!/usr/bin/env bash
    echo "Radio Scanner Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Ports:"
    for port in 3000 3001 5173 9000; do
        pid=$(lsof -ti :$port 2>/dev/null || true)
        if [[ -n "$pid" ]]; then
            proc=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
            echo "  :$port  ✓ $proc (PID: $pid)"
        else
            echo "  :$port  ✗ not in use"
        fi
    done
    echo ""
    echo "RTL-SDR:"
    if command -v rtl_test &>/dev/null; then
        if rtl_test -t 2>&1 | grep -q "Found 1 device"; then
            echo "  ✓ Device connected"
        else
            echo "  ✗ No device found"
        fi
    else
        echo "  ? rtl_test not installed"
    fi

# Check API health
health:
    curl -s http://localhost:3000/api/health | jq . 2>/dev/null || curl -s http://localhost:3000/api/health

# -----------------------------------------------------------------------------
# Audio Files
# -----------------------------------------------------------------------------

# List recent audio recordings
recordings:
    #!/usr/bin/env bash
    echo "Recent Recordings"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    find trunk-recorder/audio -name "*.wav" -type f 2>/dev/null | \
        xargs ls -lt 2>/dev/null | head -20 || echo "No recordings found"

# Clean old audio recordings (older than 7 days)
clean-audio days="7":
    #!/usr/bin/env bash
    echo "Removing audio files older than {{days}} days..."
    find trunk-recorder/audio -name "*.wav" -mtime +{{days}} -delete 2>/dev/null || true
    find trunk-recorder/audio -name "*.json" -mtime +{{days}} -delete 2>/dev/null || true
    echo "Done"

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------

# Run TypeScript type checking
typecheck:
    cd server && npx tsc --noEmit
    cd client && npx tsc --noEmit

# Format code with prettier (if installed)
format:
    npx prettier --write "server/src/**/*.ts" "client/src/**/*.{ts,tsx}" 2>/dev/null || echo "prettier not installed"

# Lint code
lint:
    cd client && npm run lint 2>/dev/null || echo "No lint script in client"

# -----------------------------------------------------------------------------
# Git
# -----------------------------------------------------------------------------

# Show git status
gs:
    git status

# Quick commit with message
commit message:
    git add -A && git commit -m "{{message}}"

# Commit and push
push message:
    git add -A && git commit -m "{{message}}" && git push

# -----------------------------------------------------------------------------
# Internal helpers (prefixed with _)
# -----------------------------------------------------------------------------

# Kill processes on required ports
_kill-ports:
    #!/usr/bin/env bash
    for port in 3000 3001 5173 9000; do
        pids=$(lsof -ti :$port 2>/dev/null || true)
        if [[ -n "$pids" ]]; then
            echo "Clearing port $port..."
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    done

# Ensure dependencies are installed
_ensure-deps:
    #!/usr/bin/env bash
    if [[ ! -d "node_modules" ]]; then
        echo "Installing dependencies..."
        npm install
    fi

# Ensure project is built
_ensure-built: _ensure-deps
    #!/usr/bin/env bash
    if [[ ! -d "server/dist" ]] || [[ ! -d "client/dist" ]]; then
        echo "Building project..."
        npm run build
    fi
