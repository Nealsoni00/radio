#!/bin/bash
# Radio Scanner - Linux Installation Script
# Run this script to set up everything from scratch
#
# Supports: Ubuntu/Debian, Fedora/RHEL, Arch Linux
#
# Usage:
#   chmod +x install-linux.sh
#   ./install-linux.sh
#
# Or run directly:
#   bash install-linux.sh

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
echo -e "${CYAN}  Radio Scanner - Linux Installation${NC}"
echo -e "${CYAN}=============================================${NC}"
echo ""

INSTALLED=()
WARNINGS=()

# Detect package manager
detect_distro() {
    if command -v apt-get &> /dev/null; then
        PKG_MANAGER="apt"
        PKG_INSTALL="sudo apt-get install -y"
        PKG_UPDATE="sudo apt-get update"
    elif command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
        PKG_INSTALL="sudo dnf install -y"
        PKG_UPDATE="sudo dnf check-update || true"
    elif command -v yum &> /dev/null; then
        PKG_MANAGER="yum"
        PKG_INSTALL="sudo yum install -y"
        PKG_UPDATE="sudo yum check-update || true"
    elif command -v pacman &> /dev/null; then
        PKG_MANAGER="pacman"
        PKG_INSTALL="sudo pacman -S --noconfirm"
        PKG_UPDATE="sudo pacman -Sy"
    else
        PKG_MANAGER="unknown"
    fi
}

detect_distro
info "Detected package manager: $PKG_MANAGER"

# =============================================================================
# Step 1: Install system dependencies
# =============================================================================
step "Checking system dependencies..."

DEPS_TO_INSTALL=()

# Check for curl
if ! command -v curl &> /dev/null; then
    DEPS_TO_INSTALL+=("curl")
fi

# Check for build essentials (needed for native npm modules)
if ! command -v gcc &> /dev/null; then
    case $PKG_MANAGER in
        apt) DEPS_TO_INSTALL+=("build-essential") ;;
        dnf|yum) DEPS_TO_INSTALL+=("gcc-c++" "make") ;;
        pacman) DEPS_TO_INSTALL+=("base-devel") ;;
    esac
fi

# Check for python (needed by node-gyp)
if ! command -v python3 &> /dev/null; then
    DEPS_TO_INSTALL+=("python3")
fi

if [[ ${#DEPS_TO_INSTALL[@]} -gt 0 ]]; then
    info "Installing system dependencies: ${DEPS_TO_INSTALL[*]}"

    if [[ "$PKG_MANAGER" == "unknown" ]]; then
        fail "Unknown package manager. Please install manually: ${DEPS_TO_INSTALL[*]}"
        exit 1
    fi

    $PKG_UPDATE
    $PKG_INSTALL ${DEPS_TO_INSTALL[*]}
    INSTALLED+=("System deps: ${DEPS_TO_INSTALL[*]}")
fi

success "System dependencies OK"

# =============================================================================
# Step 2: Check/Install Node.js
# =============================================================================
step "Checking Node.js..."

install_nodejs() {
    info "Installing Node.js via NodeSource..."

    case $PKG_MANAGER in
        apt)
            # NodeSource setup for Debian/Ubuntu
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        dnf|yum)
            # NodeSource setup for Fedora/RHEL
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            $PKG_INSTALL nodejs
            ;;
        pacman)
            sudo pacman -S --noconfirm nodejs npm
            ;;
        *)
            fail "Cannot auto-install Node.js for this distribution"
            info "Please install Node.js 18+ manually from https://nodejs.org/"
            exit 1
            ;;
    esac

    INSTALLED+=("Node.js")
}

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo $NODE_VERSION | sed 's/v\([0-9]*\).*/\1/')

    if [[ $NODE_MAJOR -ge 18 ]]; then
        success "Node.js $NODE_VERSION is installed"
    else
        warn "Node.js $NODE_VERSION is too old (need v18+)"
        info "Installing newer version..."
        install_nodejs
        success "Node.js upgraded: $(node --version)"
    fi
else
    info "Node.js not found. Installing..."
    install_nodejs
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

    # Check for common issues
    if ! command -v python3 &> /dev/null; then
        info "Hint: python3 is required for node-gyp. Install it and try again."
    fi
    if ! command -v gcc &> /dev/null; then
        info "Hint: build tools are required. Install build-essential (Debian/Ubuntu) or base-devel (Arch)."
    fi

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
if command -v lsof &> /dev/null; then
    EXISTING_PID=$(lsof -ti :3000 2>/dev/null || true)
elif command -v ss &> /dev/null; then
    EXISTING_PID=$(ss -tlnp 2>/dev/null | grep ':3000' | sed 's/.*pid=\([0-9]*\).*/\1/' || true)
elif command -v netstat &> /dev/null; then
    EXISTING_PID=$(netstat -tlnp 2>/dev/null | grep ':3000' | awk '{print $7}' | cut -d'/' -f1 || true)
fi

if [[ -n "$EXISTING_PID" ]]; then
    info "Killing existing process on port 3000 (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID 2>/dev/null || true
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
if command -v lsof &> /dev/null; then
    lsof -ti :3000 2>/dev/null | xargs kill -9 2>/dev/null || true
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
    for warn_msg in "${WARNINGS[@]}"; do
        echo -e "  ${YELLOW}- $warn_msg${NC}"
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
