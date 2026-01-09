#!/bin/bash

# =============================================================================
# Radio Scanner Stack Startup Script
# =============================================================================
# This script starts the entire radio scanner stack:
#   1. Kills any processes on required ports
#   2. Builds the project if needed
#   3. Starts the Node.js server
#   4. Optionally starts trunk-recorder
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PORT=3000
TR_STATUS_PORT=3001
TR_AUDIO_PORT=9000

# Trap to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"

    # Kill background processes
    if [[ -n "$SERVER_PID" ]]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    if [[ -n "$TR_PID" ]]; then
        kill $TR_PID 2>/dev/null || true
    fi

    echo -e "${GREEN}Cleanup complete${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

print_header() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║                    Radio Scanner Stack                            ║"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Kill process on a specific port
kill_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null || true)

    if [[ -n "$pids" ]]; then
        print_warning "Killing processes on port $port: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
        print_success "Port $port cleared"
    else
        print_success "Port $port is available"
    fi
}

# Check if a command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# -----------------------------------------------------------------------------
# Main Script
# -----------------------------------------------------------------------------

print_header

cd "$SCRIPT_DIR"

# Step 1: Kill processes on required ports
print_step "Clearing ports..."
kill_port $SERVER_PORT
kill_port $TR_STATUS_PORT
kill_port $TR_AUDIO_PORT
echo ""

# Step 2: Check dependencies
print_step "Checking dependencies..."

if ! command_exists node; then
    print_error "Node.js is not installed. Please install Node.js 18+."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [[ $NODE_VERSION -lt 18 ]]; then
    print_error "Node.js version 18+ required (found v$NODE_VERSION)"
    exit 1
fi
print_success "Node.js $(node -v)"

if ! command_exists npm; then
    print_error "npm is not installed."
    exit 1
fi
print_success "npm $(npm -v)"
echo ""

# Step 3: Install dependencies if needed
if [[ ! -d "node_modules" ]]; then
    print_step "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
    echo ""
fi

# Step 4: Build if needed
if [[ ! -d "server/dist" ]] || [[ ! -d "client/dist" ]]; then
    print_step "Building project..."
    npm run build
    print_success "Build complete"
    echo ""
fi

# Step 5: Check for trunk-recorder
TR_BINARY=""
TR_CONFIG="$SCRIPT_DIR/trunk-recorder/config.json"

# Common trunk-recorder locations
TR_LOCATIONS=(
    "/usr/local/bin/trunk-recorder"
    "/usr/bin/trunk-recorder"
    "$HOME/trunk-recorder/build/trunk-recorder"
    "$SCRIPT_DIR/tr-build/build/trunk-recorder"
)

for loc in "${TR_LOCATIONS[@]}"; do
    if [[ -x "$loc" ]]; then
        TR_BINARY="$loc"
        break
    fi
done

# Step 6: Create audio directory if needed
mkdir -p "$SCRIPT_DIR/trunk-recorder/audio"

# Step 7: Start the stack
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

print_step "Starting Node.js server..."
cd "$SCRIPT_DIR"
npm start &
SERVER_PID=$!
sleep 2

# Check if server started successfully
if kill -0 $SERVER_PID 2>/dev/null; then
    print_success "Server running on http://localhost:$SERVER_PORT (PID: $SERVER_PID)"
else
    print_error "Failed to start server"
    exit 1
fi

echo ""

# Step 8: Start trunk-recorder if available
if [[ -n "$TR_BINARY" ]] && [[ -f "$TR_CONFIG" ]]; then
    print_step "Starting trunk-recorder..."

    # Check if RTL-SDR is connected
    if command_exists rtl_test; then
        if rtl_test -t 2>&1 | grep -q "Found 1 device"; then
            cd "$SCRIPT_DIR/trunk-recorder"
            "$TR_BINARY" --config="$TR_CONFIG" &
            TR_PID=$!
            sleep 3

            if kill -0 $TR_PID 2>/dev/null; then
                print_success "trunk-recorder running (PID: $TR_PID)"
            else
                print_warning "trunk-recorder failed to start - check RTL-SDR connection"
            fi
        else
            print_warning "No RTL-SDR device found - skipping trunk-recorder"
            print_warning "Connect an RTL-SDR and restart to enable live radio capture"
        fi
    else
        print_warning "rtl_test not found - cannot verify RTL-SDR"
        print_warning "Attempting to start trunk-recorder anyway..."

        cd "$SCRIPT_DIR/trunk-recorder"
        "$TR_BINARY" --config="$TR_CONFIG" &
        TR_PID=$!
        sleep 3

        if kill -0 $TR_PID 2>/dev/null; then
            print_success "trunk-recorder running (PID: $TR_PID)"
        else
            print_warning "trunk-recorder failed to start"
        fi
    fi
else
    if [[ -z "$TR_BINARY" ]]; then
        print_warning "trunk-recorder binary not found"
        echo -e "         To install trunk-recorder:"
        echo -e "         ${CYAN}cd tr-build && mkdir build && cd build${NC}"
        echo -e "         ${CYAN}cmake .. && make -j$(nproc)${NC}"
    fi
    if [[ ! -f "$TR_CONFIG" ]]; then
        print_warning "trunk-recorder config not found at $TR_CONFIG"
    fi
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}Stack is running!${NC}"
echo ""
echo -e "  ${CYAN}Web Interface:${NC}    http://localhost:$SERVER_PORT"
echo -e "  ${CYAN}WebSocket:${NC}        ws://localhost:$SERVER_PORT/ws"
echo -e "  ${CYAN}API Health:${NC}       http://localhost:$SERVER_PORT/api/health"
echo ""
if [[ -n "$TR_PID" ]]; then
    echo -e "  ${CYAN}trunk-recorder:${NC}   Running (status → ws://localhost:$TR_STATUS_PORT)"
else
    echo -e "  ${YELLOW}trunk-recorder:${NC}   Not running (server will use file watcher only)"
fi
echo ""
echo -e "Press ${YELLOW}Ctrl+C${NC} to stop all services"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Keep script running and wait for processes
wait $SERVER_PID
