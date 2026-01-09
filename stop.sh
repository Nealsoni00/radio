#!/bin/bash

# =============================================================================
# Radio Scanner Stack Stop Script
# =============================================================================
# Kills all processes related to the radio scanner stack
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping Radio Scanner Stack...${NC}"
echo ""

# Ports to clear
PORTS=(3000 3001 9000)

for port in "${PORTS[@]}"; do
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        echo -e "Killing processes on port $port: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
done

# Kill any trunk-recorder processes
TR_PIDS=$(pgrep -f "trunk-recorder" 2>/dev/null || true)
if [[ -n "$TR_PIDS" ]]; then
    echo -e "Killing trunk-recorder processes: $TR_PIDS"
    echo "$TR_PIDS" | xargs kill -9 2>/dev/null || true
fi

# Kill any node processes in this directory
NODE_PIDS=$(pgrep -f "node.*radio" 2>/dev/null || true)
if [[ -n "$NODE_PIDS" ]]; then
    echo -e "Killing node processes: $NODE_PIDS"
    echo "$NODE_PIDS" | xargs kill -9 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}All services stopped${NC}"
