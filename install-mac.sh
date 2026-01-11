#!/bin/bash
# Radio Scanner - macOS Installation Script
# Run this script to set up everything from scratch
#
# Usage:
#   chmod +x install-mac.sh
#   ./install-mac.sh
#
# Or run directly:
#   bash install-mac.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

step() { echo -e "\n${CYAN}>> $1${NC}"; }
success() { echo -e "   ${GREEN}[OK]${NC} $1"; }
warn() { echo -e "   ${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "   ${RED}[FAIL]${NC} $1"; }
info() { echo -e "   ${GRAY}$1${NC}"; }

echo ""
echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}  Radio Scanner - macOS Installation${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""

INSTALLED=()
WARNINGS=()

# =============================================================================
# Step 1: Check/Install Homebrew
# =============================================================================
step "Checking Homebrew..."

if command -v brew &> /dev/null; then
    success "Homebrew is installed"
else
    info "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add to path for Apple Silicon
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi

    INSTALLED+=("Homebrew")
    success "Homebrew installed"
fi

# =============================================================================
# Step 2: Check/Install Node.js
# =============================================================================
step "Checking Node.js..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')

    if [[ $NODE_MAJOR -ge 18 ]]; then
        success "Node.js $NODE_VERSION is installed"
    else
        warn "Node.js $NODE_VERSION is too old (need v18+)"
        info "Upgrading Node.js..."
        brew upgrade node || brew install node
        INSTALLED+=("Node.js (upgraded)")
    fi
else
    info "Node.js not found. Installing..."
    brew install node
    INSTALLED+=("Node.js")
    success "Node.js installed: $(node --version)"
fi

# Verify npm
if command -v npm &> /dev/null; then
    success "npm $(npm --version) is available"
else
    fail "npm not found. Please reinstall Node.js"
    exit 1
fi

# =============================================================================
# Step 3: Check project directory
# =============================================================================
step "Checking project directory..."

if [[ ! -f "package.json" ]]; then
    fail "package.json not found in current directory"
    info "Please run this script from the radio project root directory"
    info "Current directory: $(pwd)"
    exit 1
fi

# Verify it's the radio project
PROJECT_NAME=$(grep '"name"' package.json | head -1 | sed 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
if [[ "$PROJECT_NAME" != "radio" ]]; then
    warn "This doesn't appear to be the radio project"
    info "package.json name: $PROJECT_NAME"
fi

success "Project directory: $(pwd)"

# =============================================================================
# Step 4: Install dependencies
# =============================================================================
step "Installing npm dependencies..."

# Clean install
if [[ -d "node_modules" ]]; then
    info "Removing existing node_modules..."
    rm -rf node_modules
fi

info "Running npm install (this may take a few minutes)..."
if npm install; then
    success "Dependencies installed"
else
    fail "npm install failed"
    exit 1
fi

# =============================================================================
# Step 5: Build the project
# =============================================================================
step "Building project..."

info "Compiling TypeScript and building client..."
if npm run build; then
    # Verify build outputs
    if [[ ! -f "server/dist/index.js" ]]; then
        fail "Server build output not found"
        exit 1
    fi
    if [[ ! -f "client/dist/index.html" ]]; then
        fail "Client build output not found"
        exit 1
    fi
    success "Build completed"
else
    fail "Build failed"
    exit 1
fi

# =============================================================================
# Step 6: Create data directories
# =============================================================================
step "Creating data directories..."

for dir in "server/data" "trunk-recorder/audio"; do
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        success "Created $dir"
    else
        success "$dir exists"
    fi
done

# =============================================================================
# Step 7: Verify installation
# =============================================================================
step "Verifying installation..."

VERIFY_PASSED=true

# Kill any existing processes on port 3000
info "Checking port 3000..."
if lsof -ti :3000 &> /dev/null; then
    info "Killing existing process on port 3000..."
    lsof -ti :3000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Start server in background
info "Starting server for verification..."
npm start &
SERVER_PID=$!
sleep 5

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
    success "Server process is running (PID: $SERVER_PID)"
else
    warn "Server process may have crashed"
    VERIFY_PASSED=false
fi

# Check if listening on port 3000
if lsof -ti :3000 &> /dev/null; then
    success "Server is listening on port 3000"
else
    warn "Server may not be listening on port 3000"
    VERIFY_PASSED=false
fi

# Test API health endpoint
info "Testing API health endpoint..."
HEALTH=$(curl -s --connect-timeout 5 http://localhost:3000/api/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    success "API health check passed"
else
    warn "Could not reach API health endpoint"
    VERIFY_PASSED=false
fi

# Test static file serving
info "Testing web interface..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://localhost:3000/ 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
    success "Web interface is accessible"
else
    warn "Could not load web interface (HTTP $HTTP_CODE)"
    VERIFY_PASSED=false
fi

# Stop the test server
info "Stopping verification server..."
kill $SERVER_PID 2>/dev/null || true
sleep 1

# Make sure port is freed
if lsof -ti :3000 &> /dev/null; then
    lsof -ti :3000 | xargs kill -9 2>/dev/null || true
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${CYAN}=============================================${NC}"
echo -e "${CYAN}  Installation Complete!${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""

if [[ ${#INSTALLED[@]} -gt 0 ]]; then
    echo -e "${GREEN}Installed:${NC}"
    for item in "${INSTALLED[@]}"; do
        echo -e "  ${GREEN}- $item${NC}"
    done
    echo ""
fi

if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo -e "${YELLOW}Warnings:${NC}"
    for warn in "${WARNINGS[@]}"; do
        echo -e "  ${YELLOW}- $warn${NC}"
    done
    echo ""
fi

if [[ "$VERIFY_PASSED" == "true" ]]; then
    echo -e "Verification: ${GREEN}PASSED${NC}"
else
    echo -e "Verification: ${YELLOW}PARTIAL${NC}"
    echo -e "${GRAY}(Some checks failed but installation may still work)${NC}"
fi

echo ""
echo -e "To start the server:"
echo -e "  ${CYAN}npm start${NC}"
echo ""
echo -e "Then open in browser:"
echo -e "  ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "For development mode (hot reload):"
echo -e "  ${CYAN}npm run dev${NC}"
echo ""
echo -e "Using just (if installed):"
echo -e "  ${CYAN}just start${NC}  or  ${CYAN}just dev${NC}"
echo ""
