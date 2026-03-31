# 🚀 Deployment Guide

This guide covers deployment options for the Food Delivery application, from local development to production.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Development Setup](#development-setup)
3. [Docker Deployment](#docker-deployment)
4. [Production Deployment](#production-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB (local or Atlas)
- Docker & Docker Compose (for containerized deployment)
- Git

### One-Command Setup (Development)

**Linux/macOS:**
```bash
# Clone and setup
git clone <your-repo-url>
cd food-delivery
chmod +x scripts/setup-dev.sh
./scripts/setup-dev.sh
```

**Windows:**
```powershell
# Clone and setup
git clone <your-repo-url>
cd food-delivery
.\scripts\setup-dev.ps1
```

---

## 🛠️ Development Setup

### Manual Setup

1. **Install Dependencies**
   ```bash
   # Backend
   cd backend && npm install
   
   # Frontend
   cd ../frontend && npm install
   
   # Admin
   cd ../admin && npm install
   ```

2. **Environment Configuration**
   ```bash
   # Copy environment templates
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   cp admin/.env.example admin/.env.local
   ```

3. **Update Environment Variables**
   - Edit `backend/.env` with your MongoDB URL and secrets
   - Update API URLs in frontend and admin `.env.local` files

4. **Create First Admin**
   ```bash
   cd backend
   npm run create-admin
   ```

5. **Start Development Servers**
   ```bash
   # Terminal 1: Backend
   cd backend && npm run server
   
   # Terminal 2: Frontend
   cd frontend && npm run dev
   
   # Terminal 3: Admin
   cd admin && npm run dev
   ```

### Development URLs
- **Frontend**: http://localhost:5173
- **Admin Panel**: http://localhost:5174
- **Backend API**: http://localhost:4000

---

## 🐳 Docker Deployment

### Quick Docker Setup

1. **Prepare Environment**
   ```bash
   cp .env.docker .env
   # Edit .env with your actual values
   ```

2. **Deploy with Docker Compose**
   ```bash
   # Build and start all services
   docker-compose up -d --build
   
   # Create first admin
   docker-compose exec backend npm run create-admin
   ```

3. **Access Applications**
   - **Frontend**: http://localhost:3000
   - **Admin Panel**: http://localhost:3001
   - **Backend API**: http://localhost:4000

### Docker Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | 3000 | User interface |
| admin | 3001 | Admin panel |
| backend | 4000 | API server |
| mongodb | 27017 | Database |
| nginx | 80/443 | Reverse proxy |

### Docker Commands

```bash
# View logs
docker-compose logs -f [service_name]

# Restart service
docker-compose restart [service_name]

# Stop all services
docker-compose down

# Remove all data (⚠️ DESTRUCTIVE)
docker-compose down -v
```

---

## 🌐 Production Deployment

### Option 1: Cloud Platforms (Recommended)

#### **Render.com Deployment**

1. **Backend Deployment**
   ```yaml
   # render.yaml
   services:
     - type: web
       name: food-delivery-backend
       env: node
       buildCommand: cd backend && npm install
       startCommand: cd backend && npm start
       envVars:
         - key: NODE_ENV
           value: production
   ```

2. **Frontend Deployment**
   ```yaml
   services:
     - type: static
       name: food-delivery-frontend
       buildCommand: cd frontend && npm install && npm run build
       staticPublishPath: frontend/dist
   ```

#### **Vercel Deployment**

1. **Frontend**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy frontend
   cd frontend
   vercel --prod
   ```

2. **Backend** (Use Render/Railway for backend)

#### **Railway Deployment**

1. **One-Click Deploy**
   - Connect your Git repository in the Railway dashboard
   - Railway auto-detects services
   - Configure environment variables

### Option 2: VPS/Dedicated Server

#### **Using Docker (Recommended)**

1. **Server Setup**
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   
   # Install Docker Compose
   sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

2. **Deploy Application**
   ```bash
   # Clone repository
   git clone <your-repo>
   cd food-delivery
   
   # Configure environment
   cp .env.docker .env
   # Edit .env with production values
   
   # Deploy
   ./scripts/deploy.sh -e production
   ```

#### **Manual Deployment**

1. **Server Requirements**
   - Ubuntu 20.04+ / CentOS 8+
   - Node.js 18+
   - MongoDB 6.0+
   - Nginx
   - SSL Certificate (Let's Encrypt)

2. **Deployment Steps**
   ```bash
   # Install dependencies
   sudo apt update
   sudo apt install nodejs npm mongodb nginx certbot
   
   # Clone and build
   git clone <your-repo>
   cd food-delivery
   
   # Build applications
   cd frontend && npm install && npm run build
   cd ../admin && npm install && npm run build
   cd ../backend && npm install --production
   
   # Configure Nginx
   sudo cp nginx.conf /etc/nginx/sites-available/food-delivery
   sudo ln -s /etc/nginx/sites-available/food-delivery /etc/nginx/sites-enabled/
   
   # Start services
   pm2 start backend/server.js --name food-delivery-backend
   sudo systemctl restart nginx
   ```

---

## ⚙️ Environment Configuration

### Required Environment Variables

#### **Backend (.env)**
```env
# Security
JWT_SECRET=your_super_secure_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
ENCRYPTION_KEY=32_byte_hex_key_for_data_encryption

# Database
MONGO_URL=mongodb://localhost:27017/food-delivery

# Email
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Application
FRONTEND_URL=https://your-frontend-domain.com
PORT=4000
ENABLE_SCHEDULED_JOBS=true
```

#### **Frontend (.env.local)**
```env
VITE_API_URL=https://your-api-domain.com
VITE_APP_NAME=Food Delivery App
VITE_NODE_ENV=production
```

#### **Admin (.env.local)**
```env
VITE_API_URL=https://your-api-domain.com
VITE_APP_NAME=Food Delivery Admin
VITE_NODE_ENV=production
VITE_ADMIN_SESSION_TIMEOUT=3600000
VITE_ADMIN_TOKEN_REFRESH_INTERVAL=300000
```

### Environment-Specific Configurations

| Environment | Purpose | Configuration |
|-------------|---------|---------------|
| `development` | Local development | Local MongoDB, debug enabled |
| `staging` | Testing/QA | Staging database, logging enabled |
| `production` | Live application | Production database, optimized |

---

## 📊 Monitoring and Maintenance

### Health Checks

1. **Application Health**
   ```bash
   # Backend health
   curl http://localhost:4000/api/health
   
   # Frontend accessibility
   curl http://localhost:3000
   
   # Admin panel accessibility
   curl http://localhost:3001
   ```

2. **Database Health**
   ```bash
   # MongoDB status
   mongosh --eval "db.adminCommand('ping')"
   ```

### Logging

1. **Application Logs**
   ```bash
   # Docker logs
   docker-compose logs -f backend
   docker-compose logs -f frontend
   docker-compose logs -f admin
   
   # PM2 logs (manual deployment)
   pm2 logs food-delivery-backend
   ```

2. **System Logs**
   ```bash
   # Nginx logs
   sudo tail -f /var/log/nginx/access.log
   sudo tail -f /var/log/nginx/error.log
   
   # System logs
   journalctl -u mongodb
   ```

### Backup Strategy

1. **Database Backup**
   ```bash
   # MongoDB backup
   mongodump --db food-delivery --out /backup/$(date +%Y%m%d)
   
   # Automated backup script
   #!/bin/bash
   BACKUP_DIR="/backup/mongodb"
   DATE=$(date +%Y%m%d_%H%M%S)
   mongodump --db food-delivery --out $BACKUP_DIR/$DATE
   find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \;
   ```

2. **File Backup**
   ```bash
   # Backup uploads
   tar -czf uploads_backup_$(date +%Y%m%d).tar.gz backend/uploads/
   ```

### Performance Monitoring

1. **Application Metrics**
   - Response times
   - Error rates
   - Database query performance
   - Memory and CPU usage

2. **Recommended Tools**
   - **APM**: New Relic, DataDog
   - **Logging**: ELK Stack, Splunk
   - **Uptime**: Pingdom, UptimeRobot
   - **Error Tracking**: Sentry

### Security Maintenance

1. **Regular Updates**
   ```bash
   # Update dependencies
   npm audit fix
   
   # Update Docker images
   docker-compose pull
   docker-compose up -d
   ```

2. **Security Checks**
   - SSL certificate renewal
   - Dependency vulnerability scanning
   - Access log monitoring
   - Database security audit

---

## 🔧 Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check port usage
   netstat -tulpn | grep :4000
   
   # Kill process
   sudo kill -9 $(lsof -ti:4000)
   ```

2. **Database Connection**
   ```bash
   # Test MongoDB connection
   mongosh mongodb://localhost:27017/food-delivery
   
   # Check MongoDB status
   sudo systemctl status mongodb
   ```

3. **Environment Variables**
   ```bash
   # Verify environment loading
   node -e "console.log(process.env.JWT_SECRET)"
   ```

4. **Build Issues**
   ```bash
   # Clear npm cache
   npm cache clean --force
   
   # Remove node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

### Getting Help

- **Documentation**: Check README.md and setup guides
- **Logs**: Always check application and system logs first
- **Issue tracker**: Report bugs and feature requests in your repository or project tool
- **Community**: Join discussions and get help

---

## 📚 Additional Resources

- [Setup and Run Guide](SETUP_AND_RUN_GUIDE.md)
- [Project Features Documentation](PROJECT_FEATURES_DOCUMENTATION.md)
- [Implementation Roadmap](IMPLEMENTATION_ROADMAP.md)

---

**Last Updated**: January 26, 2025

For the most up-to-date deployment instructions and troubleshooting, always refer to the latest version of this guide.