#!/bin/bash

# Development Environment Setup Script
# This script sets up the development environment for the Food Delivery project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

print_status "Setting up Food Delivery App development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version $NODE_VERSION is too old. Please install Node.js 16 or higher."
    exit 1
fi

print_success "Node.js $(node --version) is installed"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    exit 1
fi

print_success "npm $(npm --version) is installed"

# Install backend dependencies
print_status "Installing backend dependencies..."
cd backend
if [ ! -f package.json ]; then
    print_error "backend/package.json not found"
    exit 1
fi

npm install
print_success "Backend dependencies installed"

# Install frontend dependencies
print_status "Installing frontend dependencies..."
cd ../frontend
if [ ! -f package.json ]; then
    print_error "frontend/package.json not found"
    exit 1
fi

npm install
print_success "Frontend dependencies installed"

# Install admin dependencies
print_status "Installing admin dependencies..."
cd ../admin
if [ ! -f package.json ]; then
    print_error "admin/package.json not found"
    exit 1
fi

npm install
print_success "Admin dependencies installed"

cd ..

# Create environment files if they don't exist
print_status "Setting up environment files..."

# Backend environment
if [ ! -f backend/.env ]; then
    print_status "Creating backend/.env from template..."
    cat > backend/.env << 'EOF'
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
EOF
    print_warning "Created backend/.env - Please update with your actual values"
else
    print_success "backend/.env already exists"
fi

# Frontend environment
if [ ! -f frontend/.env.local ]; then
    print_status "Creating frontend/.env.local..."
    cat > frontend/.env.local << 'EOF'
VITE_API_URL=http://localhost:4000
VITE_APP_NAME=Food Delivery App (Dev)
VITE_NODE_ENV=development
EOF
    print_success "Created frontend/.env.local"
else
    print_success "frontend/.env.local already exists"
fi

# Admin environment
if [ ! -f admin/.env.local ]; then
    print_status "Creating admin/.env.local..."
    cat > admin/.env.local << 'EOF'
VITE_API_URL=http://localhost:4000
VITE_APP_NAME=Food Delivery Admin (Dev)
VITE_NODE_ENV=development
VITE_ADMIN_SESSION_TIMEOUT=3600000
VITE_ADMIN_TOKEN_REFRESH_INTERVAL=300000
EOF
    print_success "Created admin/.env.local"
else
    print_success "admin/.env.local already exists"
fi

# Create uploads directory
if [ ! -d backend/uploads ]; then
    mkdir -p backend/uploads
    print_success "Created backend/uploads directory"
fi

# Run configuration tests
print_status "Running configuration tests..."

# Test backend configuration
cd backend
if [ -f test-setup.js ]; then
    print_status "Testing backend configuration..."
    node test-setup.js
    print_success "Backend configuration test passed"
fi

# Test frontend configuration
cd ../frontend
if [ -f test-setup.js ]; then
    print_status "Testing frontend configuration..."
    node test-setup.js
    print_success "Frontend configuration test passed"
fi

# Test admin configuration
cd ../admin
if [ -f test-setup.js ]; then
    print_status "Testing admin configuration..."
    node test-setup.js
    print_success "Admin configuration test passed"
fi

cd ..

# Check if MongoDB is running (optional)
print_status "Checking MongoDB connection..."
if command -v mongosh &> /dev/null; then
    if mongosh --eval "db.adminCommand('ping')" --quiet &> /dev/null; then
        print_success "MongoDB is running and accessible"
    else
        print_warning "MongoDB is not running or not accessible"
        print_warning "Please start MongoDB or update MONGO_URL in backend/.env"
    fi
elif command -v mongo &> /dev/null; then
    if mongo --eval "db.adminCommand('ping')" --quiet &> /dev/null; then
        print_success "MongoDB is running and accessible"
    else
        print_warning "MongoDB is not running or not accessible"
        print_warning "Please start MongoDB or update MONGO_URL in backend/.env"
    fi
else
    print_warning "MongoDB client not found. Please install MongoDB or use MongoDB Atlas"
fi

print_success "Development environment setup completed!"
echo ""
echo "Next steps:"
echo "1. Update backend/.env with your actual MongoDB URL and email credentials"
echo "2. Start MongoDB (if using local MongoDB)"
echo "3. Create first admin user:"
echo "   cd backend && npm run create-admin"
echo ""
echo "To start the development servers:"
echo "1. Backend:  cd backend && npm run server"
echo "2. Frontend: cd frontend && npm run dev"
echo "3. Admin:    cd admin && npm run dev"
echo ""
echo "Development URLs:"
echo "- Frontend: http://localhost:5173"
echo "- Admin:    http://localhost:5174"
echo "- Backend:  http://localhost:4000"