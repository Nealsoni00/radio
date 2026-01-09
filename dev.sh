#!/bin/bash

# =============================================================================
# Radio Scanner Development Mode
# =============================================================================
# Starts the stack in development mode with hot reloading
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
    echo -e "\n${YELLOW}Shutting down dev servers...${NC}"
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Kill existing processes on ports
echo -e "${BLUE}▶ Clearing ports...${NC}"
for port in 3000 3001 5173 9000; do
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        echo -e "${YELLOW}  Killing processes on port $port${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
done

cd "$SCRIPT_DIR"

# Install dependencies if needed
if [[ ! -d "node_modules" ]]; then
    echo -e "${BLUE}▶ Installing dependencies...${NC}"
    npm install
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Starting development servers...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Server (API):${NC}     http://localhost:3000"
echo -e "  ${CYAN}Client (Vite):${NC}    http://localhost:5173"
echo -e "  ${CYAN}WebSocket:${NC}        ws://localhost:3000/ws"
echo ""
echo -e "Press ${YELLOW}Ctrl+C${NC} to stop"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Start dev mode (server + client with hot reload)
npm run dev
