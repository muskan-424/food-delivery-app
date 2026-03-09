# Development Environment Setup Script (PowerShell)
# This script sets up the development environment for the Food Delivery project

param(
    [switch]$Help
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"

function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

if ($Help) {
    Write-Host "Development Environment Setup Script"
    Write-Host "Usage: .\setup-dev.ps1"
    Write-Host ""
    Write-Host "This script will:"
    Write-Host "- Install all npm dependencies"
    Write-Host "- Create environment files"
    Write-Host "- Run configuration tests"
    Write-Host "- Check MongoDB connection"
    exit 0
}

Write-Status "Setting up Food Delivery App development environment..."

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    $versionNumber = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($versionNumber -lt 16) {
        Write-Error "Node.js version $nodeVersion is too old. Please install Node.js 16 or higher."
        exit 1
    }
    Write-Success "Node.js $nodeVersion is installed"
} catch {
    Write-Error "Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Success "npm $npmVersion is installed"
} catch {
    Write-Error "npm is not installed"
    exit 1
}

# Install backend dependencies
Write-Status "Installing backend dependencies..."
if (-not (Test-Path "backend/package.json")) {
    Write-Error "backend/package.json not found"
    exit 1
}

Push-Location backend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install backend dependencies"
    Pop-Location
    exit 1
}
Pop-Location
Write-Success "Backend dependencies installed"

# Install frontend dependencies
Write-Status "Installing frontend dependencies..."
if (-not (Test-Path "frontend/package.json")) {
    Write-Error "frontend/package.json not found"
    exit 1
}

Push-Location frontend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install frontend dependencies"
    Pop-Location
    exit 1
}
Pop-Location
Write-Success "Frontend dependencies installed"

# Install admin dependencies
Write-Status "Installing admin dependencies..."
if (-not (Test-Path "admin/package.json")) {
    Write-Error "admin/package.json not found"
    exit 1
}

Push-Location admin
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install admin dependencies"
    Pop-Location
    exit 1
}
Pop-Location
Write-Success "Admin dependencies installed"

# Create environment files if they don't exist
Write-Status "Setting up environment files..."

# Backend environment
if (-not (Test-Path "backend/.env")) {
    Write-Status "Creating backend/.env from template..."
    @'
# JWT Secret Key (use a strong random string)
JWT_SECRET=dev_jwt_secret_change_in_production
JWT_REFRESH_SECRET=dev_refresh_secret_change_in_production
SALT=10

# MongoDB Connection URL
MONGO_URL=mongodb://localhost:27017/food-delivery-dev

# Encryption Key for sensitive data (32 bytes hex)
ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456

# Email Configuration (for development)
EMAIL_SERVICE=gmail
EMAIL_USER=your-dev-email@gmail.com
EMAIL_PASSWORD=your-dev-app-password

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Enable scheduled jobs
ENABLE_SCHEDULED_JOBS=false

# Server Port
PORT=4000
'@ | Out-File -FilePath "backend/.env" -Encoding UTF8
    Write-Warning "Created backend/.env - Please update with your actual values"
} else {
    Write-Success "backend/.env already exists"
}

# Frontend environment
if (-not (Test-Path "frontend/.env.local")) {
    Write-Status "Creating frontend/.env.local..."
    @'
VITE_API_URL=http://localhost:4000
VITE_APP_NAME=Food Delivery App (Dev)
VITE_NODE_ENV=development
'@ | Out-File -FilePath "frontend/.env.local" -Encoding UTF8
    Write-Success "Created frontend/.env.local"
} else {
    Write-Success "frontend/.env.local already exists"
}

# Admin environment
if (-not (Test-Path "admin/.env.local")) {
    Write-Status "Creating admin/.env.local..."
    @'
VITE_API_URL=http://localhost:4000
VITE_APP_NAME=Food Delivery Admin (Dev)
VITE_NODE_ENV=development
VITE_ADMIN_SESSION_TIMEOUT=3600000
VITE_ADMIN_TOKEN_REFRESH_INTERVAL=300000
'@ | Out-File -FilePath "admin/.env.local" -Encoding UTF8
    Write-Success "Created admin/.env.local"
} else {
    Write-Success "admin/.env.local already exists"
}

# Create uploads directory
if (-not (Test-Path "backend/uploads")) {
    New-Item -ItemType Directory -Path "backend/uploads" | Out-Null
    Write-Success "Created backend/uploads directory"
}

# Run configuration tests
Write-Status "Running configuration tests..."

# Test backend configuration
if (Test-Path "backend/test-setup.js") {
    Write-Status "Testing backend configuration..."
    Push-Location backend
    node test-setup.js
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Backend configuration test passed"
    } else {
        Write-Warning "Backend configuration test had warnings"
    }
    Pop-Location
}

# Test frontend configuration
if (Test-Path "frontend/test-setup.js") {
    Write-Status "Testing frontend configuration..."
    Push-Location frontend
    node test-setup.js
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Frontend configuration test passed"
    } else {
        Write-Warning "Frontend configuration test had warnings"
    }
    Pop-Location
}

# Test admin configuration
if (Test-Path "admin/test-setup.js") {
    Write-Status "Testing admin configuration..."
    Push-Location admin
    node test-setup.js
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Admin configuration test passed"
    } else {
        Write-Warning "Admin configuration test had warnings"
    }
    Pop-Location
}

# Check if MongoDB is running (optional)
Write-Status "Checking MongoDB connection..."
try {
    # Try mongosh first (newer MongoDB client)
    $null = mongosh --eval "db.adminCommand('ping')" --quiet 2>$null
    Write-Success "MongoDB is running and accessible"
} catch {
    try {
        # Try mongo (older MongoDB client)
        $null = mongo --eval "db.adminCommand('ping')" --quiet 2>$null
        Write-Success "MongoDB is running and accessible"
    } catch {
        Write-Warning "MongoDB is not running or not accessible"
        Write-Warning "Please start MongoDB or update MONGO_URL in backend/.env"
    }
}

Write-Success "Development environment setup completed!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Update backend/.env with your actual MongoDB URL and email credentials"
Write-Host "2. Start MongoDB (if using local MongoDB)"
Write-Host "3. Create first admin user:"
Write-Host "   cd backend && npm run create-admin"
Write-Host ""
Write-Host "To start the development servers:"
Write-Host "1. Backend:  cd backend && npm run server"
Write-Host "2. Frontend: cd frontend && npm run dev"
Write-Host "3. Admin:    cd admin && npm run dev"
Write-Host ""
Write-Host "Development URLs:"
Write-Host "- Frontend: http://localhost:5173"
Write-Host "- Admin:    http://localhost:5174"
Write-Host "- Backend:  http://localhost:4000"