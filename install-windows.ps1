# Radio Scanner - Windows Installation Script
# Run this script in PowerShell to set up everything from scratch
#
# Usage:
#   1. Open PowerShell as Administrator
#   2. Run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#   3. Run: .\install-windows.ps1
#
# Or run directly with bypass:
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1

param(
    [switch]$SkipNodeInstall,
    [switch]$SkipBuild,
    [switch]$StartAfterInstall
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "   [FAIL] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "   $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Radio Scanner - Windows Installation" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Track what we installed
$installed = @()
$warnings = @()

# =============================================================================
# Step 1: Check/Install Node.js
# =============================================================================
Write-Step "Checking Node.js..."

$nodeVersion = $null
try {
    $nodeVersion = (node --version 2>$null)
} catch {}

if ($nodeVersion) {
    $versionNum = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($versionNum -ge 18) {
        Write-Success "Node.js $nodeVersion is installed"
    } else {
        Write-Warn "Node.js $nodeVersion is too old (need v18+)"
        $nodeVersion = $null
    }
}

if (-not $nodeVersion -and -not $SkipNodeInstall) {
    Write-Info "Node.js not found. Attempting to install..."

    # Try winget first
    $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
    if ($hasWinget) {
        Write-Info "Installing Node.js via winget..."
        try {
            winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            $installed += "Node.js (via winget)"
        } catch {
            Write-Warn "winget install failed, trying alternative..."
        }
    }

    # Check again
    try { $nodeVersion = (node --version 2>$null) } catch {}

    if (-not $nodeVersion) {
        Write-Fail "Could not install Node.js automatically"
        Write-Host ""
        Write-Host "   Please install Node.js manually:" -ForegroundColor Yellow
        Write-Host "   1. Go to https://nodejs.org/" -ForegroundColor White
        Write-Host "   2. Download and install the LTS version (18+)" -ForegroundColor White
        Write-Host "   3. Restart PowerShell and run this script again" -ForegroundColor White
        Write-Host ""
        exit 1
    }
    Write-Success "Node.js installed: $nodeVersion"
}

# Verify npm
$npmVersion = $null
try { $npmVersion = (npm --version 2>$null) } catch {}
if ($npmVersion) {
    Write-Success "npm $npmVersion is available"
} else {
    Write-Fail "npm not found. Please reinstall Node.js"
    exit 1
}

# =============================================================================
# Step 2: Check for Build Tools (for native modules like better-sqlite3)
# =============================================================================
Write-Step "Checking build tools..."

$hasBuildTools = $false

# Check for Visual Studio Build Tools or Visual Studio
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWhere) {
    $vsInstalls = & $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsInstalls) {
        $hasBuildTools = $true
        Write-Success "Visual Studio Build Tools found"
    }
}

# Check for standalone build tools
if (-not $hasBuildTools) {
    $msbuild = Get-Command msbuild -ErrorAction SilentlyContinue
    if ($msbuild) {
        $hasBuildTools = $true
        Write-Success "MSBuild found"
    }
}

if (-not $hasBuildTools) {
    Write-Warn "Visual Studio Build Tools not detected"
    Write-Info "Native modules may fail to compile"
    Write-Info "If npm install fails, install Build Tools from:"
    Write-Info "https://visualstudio.microsoft.com/visual-cpp-build-tools/"
    Write-Info "(Select 'Desktop development with C++' workload)"
    $warnings += "Build tools not found - native modules may fail"
}

# =============================================================================
# Step 3: Check current directory
# =============================================================================
Write-Step "Checking project directory..."

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Fail "package.json not found in current directory"
    Write-Info "Please run this script from the radio project root directory"
    Write-Info "Current directory: $(Get-Location)"
    exit 1
}

# Verify it's the radio project
$packageJson = Get-Content "package.json" | ConvertFrom-Json
if ($packageJson.name -ne "radio") {
    Write-Warn "This doesn't appear to be the radio project"
    Write-Info "package.json name: $($packageJson.name)"
}

Write-Success "Project directory: $(Get-Location)"

# =============================================================================
# Step 4: Install dependencies
# =============================================================================
Write-Step "Installing npm dependencies..."

try {
    # Clean install
    if (Test-Path "node_modules") {
        Write-Info "Removing existing node_modules..."
        Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
    }

    Write-Info "Running npm install (this may take a few minutes)..."
    $npmOutput = npm install 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed"
        Write-Host $npmOutput -ForegroundColor Red

        if ($npmOutput -match "better-sqlite3|node-gyp|MSBuild") {
            Write-Host ""
            Write-Host "   This appears to be a native module build error." -ForegroundColor Yellow
            Write-Host "   Install Visual Studio Build Tools and try again:" -ForegroundColor Yellow
            Write-Host "   https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor White
        }
        exit 1
    }

    Write-Success "Dependencies installed"
} catch {
    Write-Fail "npm install failed: $_"
    exit 1
}

# =============================================================================
# Step 5: Build the project
# =============================================================================
if (-not $SkipBuild) {
    Write-Step "Building project..."

    try {
        Write-Info "Compiling TypeScript and building client..."
        $buildOutput = npm run build 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Build failed"
            Write-Host $buildOutput -ForegroundColor Red
            exit 1
        }

        # Verify build outputs exist
        if (-not (Test-Path "server/dist/index.js")) {
            Write-Fail "Server build output not found"
            exit 1
        }
        if (-not (Test-Path "client/dist/index.html")) {
            Write-Fail "Client build output not found"
            exit 1
        }

        Write-Success "Build completed"
    } catch {
        Write-Fail "Build failed: $_"
        exit 1
    }
} else {
    Write-Info "Skipping build (--SkipBuild flag set)"
}

# =============================================================================
# Step 6: Create data directories
# =============================================================================
Write-Step "Creating data directories..."

$dirs = @("server/data", "trunk-recorder/audio")
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Success "Created $dir"
    } else {
        Write-Success "$dir exists"
    }
}

# =============================================================================
# Step 7: Verify installation
# =============================================================================
Write-Step "Verifying installation..."

$verifyPassed = $true

# Check server can start
Write-Info "Starting server for verification..."

# Kill any existing processes on port 3000
$existingProcess = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
                   Select-Object -ExpandProperty OwningProcess -First 1
if ($existingProcess) {
    Stop-Process -Id $existingProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Start server in background
$serverJob = Start-Job -ScriptBlock {
    param($path)
    Set-Location $path
    npm start 2>&1
} -ArgumentList (Get-Location)

# Wait for server to start
Write-Info "Waiting for server to start..."
Start-Sleep -Seconds 5

# Check if server is listening
$serverListening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($serverListening) {
    Write-Success "Server is listening on port 3000"
} else {
    Write-Warn "Server may not have started correctly"
    $verifyPassed = $false
}

# Test API health endpoint
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5
    if ($health.status -eq "ok") {
        Write-Success "API health check passed"
    } else {
        Write-Warn "API returned unexpected status: $($health.status)"
        $verifyPassed = $false
    }
} catch {
    Write-Warn "Could not reach API health endpoint"
    $verifyPassed = $false
}

# Test static file serving
try {
    $indexResponse = Invoke-WebRequest -Uri "http://localhost:3000/" -TimeoutSec 5 -UseBasicParsing
    if ($indexResponse.StatusCode -eq 200) {
        Write-Success "Web interface is accessible"
    }
} catch {
    Write-Warn "Could not load web interface"
    $verifyPassed = $false
}

# Stop the test server
Write-Info "Stopping verification server..."
Stop-Job $serverJob -ErrorAction SilentlyContinue
Remove-Job $serverJob -ErrorAction SilentlyContinue

# Kill the actual server process
$serverProcess = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
                 Select-Object -ExpandProperty OwningProcess -First 1
if ($serverProcess) {
    Stop-Process -Id $serverProcess -Force -ErrorAction SilentlyContinue
}

# =============================================================================
# Summary
# =============================================================================
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

if ($installed.Count -gt 0) {
    Write-Host "Installed:" -ForegroundColor Green
    foreach ($item in $installed) {
        Write-Host "  - $item" -ForegroundColor Green
    }
    Write-Host ""
}

if ($warnings.Count -gt 0) {
    Write-Host "Warnings:" -ForegroundColor Yellow
    foreach ($warn in $warnings) {
        Write-Host "  - $warn" -ForegroundColor Yellow
    }
    Write-Host ""
}

if ($verifyPassed) {
    Write-Host "Verification: " -NoNewline
    Write-Host "PASSED" -ForegroundColor Green
} else {
    Write-Host "Verification: " -NoNewline
    Write-Host "PARTIAL" -ForegroundColor Yellow
    Write-Host "(Some checks failed but installation may still work)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "To start the server:" -ForegroundColor White
Write-Host "  npm start" -ForegroundColor Cyan
Write-Host ""
Write-Host "Then open in browser:" -ForegroundColor White
Write-Host "  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "For development mode (hot reload):" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor Cyan
Write-Host ""

# Optionally start the server
if ($StartAfterInstall) {
    Write-Host "Starting server..." -ForegroundColor Cyan
    npm start
}
