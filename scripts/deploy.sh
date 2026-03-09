#!/bin/bash

# Food Delivery App Deployment Script
# This script handles deployment to various environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="production"
SKIP_BUILD=false
SKIP_TESTS=false
DOCKER_COMPOSE_FILE="docker-compose.yml"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Set deployment environment (production|staging|development)"
    echo "  -f, --file FILE         Docker compose file to use"
    echo "  --skip-build            Skip building Docker images"
    echo "  --skip-tests            Skip running tests"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e production"
    echo "  $0 -e staging --skip-tests"
    echo "  $0 --environment development --skip-build"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -f|--file)
            DOCKER_COMPOSE_FILE="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(production|staging|development)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Valid environments: production, staging, development"
    exit 1
fi

print_status "Starting deployment for environment: $ENVIRONMENT"

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not installed"
    exit 1
fi

# Set Docker Compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# Check if environment file exists
ENV_FILE=".env"
if [[ "$ENVIRONMENT" != "production" ]]; then
    ENV_FILE=".env.$ENVIRONMENT"
fi

if [[ ! -f "$ENV_FILE" ]]; then
    print_warning "Environment file $ENV_FILE not found"
    if [[ -f ".env.docker" ]]; then
        print_status "Using .env.docker as template"
        cp .env.docker "$ENV_FILE"
        print_warning "Please update $ENV_FILE with your actual values before continuing"
        exit 1
    else
        print_error "No environment configuration found"
        exit 1
    fi
fi

# Load environment variables
set -a
source "$ENV_FILE"
set +a

print_success "Environment file loaded: $ENV_FILE"

# Run tests if not skipped
if [[ "$SKIP_TESTS" == false ]]; then
    print_status "Running tests..."
    
    # Backend tests
    if [[ -f "backend/test-setup.js" ]]; then
        print_status "Running backend configuration tests..."
        cd backend
        node test-setup.js
        cd ..
        print_success "Backend tests passed"
    fi
    
    # Frontend tests
    if [[ -f "frontend/test-setup.js" ]]; then
        print_status "Running frontend configuration tests..."
        cd frontend
        node test-setup.js
        cd ..
        print_success "Frontend tests passed"
    fi
    
    # Admin tests
    if [[ -f "admin/test-setup.js" ]]; then
        print_status "Running admin configuration tests..."
        cd admin
        node test-setup.js
        cd ..
        print_success "Admin tests passed"
    fi
else
    print_warning "Skipping tests as requested"
fi

# Build Docker images if not skipped
if [[ "$SKIP_BUILD" == false ]]; then
    print_status "Building Docker images..."
    $DOCKER_COMPOSE -f "$DOCKER_COMPOSE_FILE" build --no-cache
    print_success "Docker images built successfully"
else
    print_warning "Skipping build as requested"
fi

# Stop existing containers
print_status "Stopping existing containers..."
$DOCKER_COMPOSE -f "$DOCKER_COMPOSE_FILE" down

# Start services
print_status "Starting services..."
$DOCKER_COMPOSE -f "$DOCKER_COMPOSE_FILE" up -d

# Wait for services to be healthy
print_status "Waiting for services to be ready..."
sleep 10

# Check service health
print_status "Checking service health..."

# Check backend health
if curl -f http://localhost:4000/api/health &> /dev/null; then
    print_success "Backend is healthy"
else
    print_error "Backend health check failed"
    print_status "Backend logs:"
    $DOCKER_COMPOSE -f "$DOCKER_COMPOSE_FILE" logs backend
    exit 1
fi

# Check frontend
if curl -f http://localhost:3000 &> /dev/null; then
    print_success "Frontend is accessible"
else
    print_warning "Frontend may not be ready yet"
fi

# Check admin panel
if curl -f http://localhost:3001 &> /dev/null; then
    print_success "Admin panel is accessible"
else
    print_warning "Admin panel may not be ready yet"
fi

# Show running containers
print_status "Running containers:"
$DOCKER_COMPOSE -f "$DOCKER_COMPOSE_FILE" ps

# Show service URLs
print_success "Deployment completed successfully!"
echo ""
echo "Service URLs:"
echo "  Frontend (User Panel): http://localhost:3000"
echo "  Admin Panel:          http://localhost:3001"
echo "  Backend API:          http://localhost:4000"
echo "  MongoDB:              mongodb://localhost:27017"
echo ""
echo "To create the first admin user:"
echo "  $DOCKER_COMPOSE -f $DOCKER_COMPOSE_FILE exec backend npm run create-admin"
echo ""
echo "To view logs:"
echo "  $DOCKER_COMPOSE -f $DOCKER_COMPOSE_FILE logs -f [service_name]"
echo ""
echo "To stop all services:"
echo "  $DOCKER_COMPOSE -f $DOCKER_COMPOSE_FILE down"