# Food Delivery App Deployment Script (PowerShell)
# This script handles deployment to various environments on Windows

param(
    [string]$Environment = "production",
    [string]$DockerComposeFile = "docker-compose.yml",
    [switch]$SkipBuild,
    [switch]$SkipTests,
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

function Show-Usage {
    Write-Host "Usage: .\deploy.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Environment ENV        Set deployment environment (production|staging|development)"
    Write-Host "  -DockerComposeFile FILE Docker compose file to use"
    Write-Host "  -SkipBuild             Skip building Docker images"
    Write-Host "  -SkipTests             Skip running tests"
    Write-Host "  -Help                  Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\deploy.ps1 -Environment production"
    Write-Host "  .\deploy.ps1 -Environment staging -SkipTests"
    Write-Host "  .\deploy.ps1 -Environment development -SkipBuild"
}

if ($Help) {
    Show-Usage
    exit 0
}

# Validate environment
if ($Environment -notin @("production", "staging", "development")) {
    Write-Error "Invalid environment: $Environment"
    Write-Error "Valid environments: production, staging, development"
    exit 1
}

Write-Status "Starting deployment for environment: $Environment"

# Check if Docker is installed and running
try {
    docker info | Out-Null
    Write-Success "Docker is running"
} catch {
    Write-Error "Docker is not installed or not running"
    exit 1
}

# Check if Docker Compose is available
$DockerCompose = "docker-compose"
try {
    & $DockerCompose version | Out-Null
} catch {
    try {
        docker compose version | Out-Null
        $DockerCompose = "docker compose"
    } catch {
        Write-Error "Docker Compose is not installed"
        exit 1
    }
}

Write-Success "Docker Compose is available"

# Check if environment file exists
$EnvFile = ".env"
if ($Environment -ne "production") {
    $EnvFile = ".env.$Environment"
}

if (-not (Test-Path $EnvFile)) {
    Write-Warning "Environment file $EnvFile not found"
    if (Test-Path ".env.docker") {
        Write-Status "Using .env.docker as template"
        Copy-Item ".env.docker" $EnvFile
        Write-Warning "Please update $EnvFile with your actual values before continuing"
        exit 1
    } else {
        Write-Error "No environment configuration found"
        exit 1
    }
}

Write-Success "Environment file found: $EnvFile"

# Run tests if not skipped
if (-not $SkipTests) {
    Write-Status "Running tests..."
    
    # Backend tests
    if (Test-Path "backend/test-setup.js") {
        Write-Status "Running backend configuration tests..."
        Push-Location backend
        node test-setup.js
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Backend tests failed"
            Pop-Location
            exit 1
        }
        Pop-Location
        Write-Success "Backend tests passed"
    }
    
    # Frontend tests
    if (Test-Path "frontend/test-setup.js") {
        Write-Status "Running frontend configuration tests..."
        Push-Location frontend
        node test-setup.js
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Frontend tests failed"
            Pop-Location
            exit 1
        }
        Pop-Location
        Write-Success "Frontend tests passed"
    }
    
    # Admin tests
    if (Test-Path "admin/test-setup.js") {
        Write-Status "Running admin configuration tests..."
        Push-Location admin
        node test-setup.js
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Admin tests failed"
            Pop-Location
            exit 1
        }
        Pop-Location
        Write-Success "Admin tests passed"
    }
} else {
    Write-Warning "Skipping tests as requested"
}

# Build Docker images if not skipped
if (-not $SkipBuild) {
    Write-Status "Building Docker images..."
    & $DockerCompose -f $DockerComposeFile build --no-cache
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker build failed"
        exit 1
    }
    Write-Success "Docker images built successfully"
} else {
    Write-Warning "Skipping build as requested"
}

# Stop existing containers
Write-Status "Stopping existing containers..."
& $DockerCompose -f $DockerComposeFile down

# Start services
Write-Status "Starting services..."
& $DockerCompose -f $DockerComposeFile up -d

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to start services"
    exit 1
}

# Wait for services to be ready
Write-Status "Waiting for services to be ready..."
Start-Sleep -Seconds 10

# Check service health
Write-Status "Checking service health..."

# Check backend health
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/api/health" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Success "Backend is healthy"
    } else {
        throw "Backend returned status code: $($response.StatusCode)"
    }
} catch {
    Write-Error "Backend health check failed: $($_.Exception.Message)"
    Write-Status "Backend logs:"
    & $DockerCompose -f $DockerComposeFile logs backend
    exit 1
}

# Check frontend
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 10
    Write-Success "Frontend is accessible"
} catch {
    Write-Warning "Frontend may not be ready yet: $($_.Exception.Message)"
}

# Check admin panel
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001" -UseBasicParsing -TimeoutSec 10
    Write-Success "Admin panel is accessible"
} catch {
    Write-Warning "Admin panel may not be ready yet: $($_.Exception.Message)"
}

# Show running containers
Write-Status "Running containers:"
& $DockerCompose -f $DockerComposeFile ps

# Show service URLs
Write-Success "Deployment completed successfully!"
Write-Host ""
Write-Host "Service URLs:"
Write-Host "  Frontend (User Panel): http://localhost:3000"
Write-Host "  Admin Panel:          http://localhost:3001"
Write-Host "  Backend API:          http://localhost:4000"
Write-Host "  MongoDB:              mongodb://localhost:27017"
Write-Host ""
Write-Host "To create the first admin user:"
Write-Host "  $DockerCompose -f $DockerComposeFile exec backend npm run create-admin"
Write-Host ""
Write-Host "To view logs:"
Write-Host "  $DockerCompose -f $DockerComposeFile logs -f [service_name]"
Write-Host ""
Write-Host "To stop all services:"
Write-Host "  $DockerCompose -f $DockerComposeFile down"