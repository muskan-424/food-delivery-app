# 🐙 GitHub Repository Setup Guide

This guide walks you through setting up your Food Delivery project on GitHub with complete CI/CD pipeline integration.

## 📋 Table of Contents

1. [Repository Setup](#repository-setup)
2. [Branch Strategy](#branch-strategy)
3. [GitHub Actions Configuration](#github-actions-configuration)
4. [Environment Secrets](#environment-secrets)
5. [Branch Protection Rules](#branch-protection-rules)
6. [Deployment Environments](#deployment-environments)
7. [Release Management](#release-management)

---

## 🏗️ Repository Setup

### Step 1: Create GitHub Repository

1. **Create New Repository**
   - Go to GitHub and click "New repository"
   - Repository name: `food-delivery-app` (or your preferred name)
   - Description: "Full-stack food delivery application with React, Node.js, and MongoDB"
   - Set to Public or Private as needed
   - ✅ Initialize with README
   - ✅ Add .gitignore (Node.js template)
   - ✅ Choose a license (MIT recommended)

2. **Clone Repository**
   ```bash
   git clone https://github.com/yourusername/food-delivery-app.git
   cd food-delivery-app
   ```

### Step 2: Prepare Project Files

1. **Copy Project Files**
   ```bash
   # Copy all your project files to the cloned repository
   cp -r /path/to/your/food-delivery-project/* .
   ```

2. **Update .gitignore**
   ```gitignore
   # Dependencies
   node_modules/
   npm-debug.log*
   yarn-debug.log*
   yarn-error.log*

   # Environment files
   .env
   .env.local
   .env.development.local
   .env.test.local
   .env.production.local

   # Build outputs
   dist/
   build/

   # Logs
   logs
   *.log

   # Runtime data
   pids
   *.pid
   *.seed
   *.pid.lock

   # Coverage directory used by tools like istanbul
   coverage/

   # Dependency directories
   node_modules/
   jspm_packages/

   # Optional npm cache directory
   .npm

   # Optional REPL history
   .node_repl_history

   # Output of 'npm pack'
   *.tgz

   # Yarn Integrity file
   .yarn-integrity

   # dotenv environment variables file
   .env
   .env.test

   # parcel-bundler cache (https://parceljs.org/)
   .cache
   .parcel-cache

   # next.js build output
   .next

   # nuxt.js build output
   .nuxt

   # vuepress build output
   .vuepress/dist

   # Serverless directories
   .serverless

   # FuseBox cache
   .fusebox/

   # DynamoDB Local files
   .dynamodb/

   # TernJS port file
   .tern-port

   # Stores VSCode versions used for testing VSCode extensions
   .vscode-test

   # Uploads directory (keep structure but not files)
   backend/uploads/*
   !backend/uploads/.gitkeep

   # OS generated files
   .DS_Store
   .DS_Store?
   ._*
   .Spotlight-V100
   .Trashes
   ehthumbs.db
   Thumbs.db

   # IDE files
   .vscode/
   .idea/
   *.swp
   *.swo
   *~

   # Docker
   .dockerignore

   # Temporary files
   *.tmp
   *.temp
   ```

3. **Create .gitkeep for uploads**
   ```bash
   mkdir -p backend/uploads
   touch backend/uploads/.gitkeep
   ```

### Step 3: Initial Commit

```bash
git add .
git commit -m "Initial commit: Food delivery application with CI/CD pipeline

- Backend API with Node.js/Express
- Frontend with React/Vite
- Admin panel with React/Vite
- MongoDB database integration
- Complete CI/CD pipeline with GitHub Actions
- Docker containerization support
- Comprehensive documentation"

git push origin main
```

---

## 🌿 Branch Strategy

### Recommended Branch Structure

```
main (production)
├── develop (staging)
├── feature/user-authentication
├── feature/payment-integration
├── hotfix/security-patch
└── release/v1.2.0
```

### Branch Types

| Branch Type | Purpose | Naming Convention | Merges To |
|-------------|---------|-------------------|-----------|
| `main` | Production-ready code | `main` | - |
| `develop` | Integration branch | `develop` | `main` |
| `feature/*` | New features | `feature/feature-name` | `develop` |
| `hotfix/*` | Critical fixes | `hotfix/issue-description` | `main` & `develop` |
| `release/*` | Release preparation | `release/v1.2.0` | `main` & `develop` |

### Create Branch Structure

```bash
# Create and push develop branch
git checkout -b develop
git push -u origin develop

# Set develop as default branch for new features
git checkout develop
```

---

## ⚙️ GitHub Actions Configuration

### Workflow Files Overview

The project includes these workflow files:

1. **`.github/workflows/ci-cd.yml`** - Main CI/CD pipeline
2. **`.github/workflows/pr-check.yml`** - Pull request validation
3. **`.github/workflows/docker-build.yml`** - Docker image building
4. **`.github/workflows/deploy-staging.yml`** - Staging deployment

### Workflow Triggers

| Workflow | Triggers | Purpose |
|----------|----------|---------|
| CI/CD | Push to `main`/`develop`, PRs | Full testing and deployment |
| PR Check | Pull requests | Quick validation |
| Docker Build | Push to `main`/`develop`, tags | Container images |
| Deploy Staging | Push to `develop` | Staging environment |

---

## 🔐 Environment Secrets

### Step 1: Repository Secrets

Go to **Settings > Secrets and variables > Actions** and add:

#### **Required Secrets**

```bash
# Production Environment
PRODUCTION_API_URL=https://api.yourapp.com
PRODUCTION_FRONTEND_URL=https://yourapp.com
PRODUCTION_MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/food-delivery
PRODUCTION_JWT_SECRET=your_super_secure_production_jwt_secret
PRODUCTION_ENCRYPTION_KEY=your_32_byte_hex_encryption_key

# Staging Environment
STAGING_API_URL=https://staging-api.yourapp.com
STAGING_FRONTEND_URL=https://staging.yourapp.com
STAGING_MONGO_URL=mongodb+srv://user:pass@staging-cluster.mongodb.net/food-delivery-staging

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-app-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password

# Docker Registry (if using private registry)
DOCKER_REGISTRY_USERNAME=your_username
DOCKER_REGISTRY_PASSWORD=your_password

# Deployment Keys (if using VPS)
VPS_HOST=your-server-ip
VPS_USERNAME=deploy
VPS_SSH_KEY=your_private_ssh_key
```

#### **Optional Secrets**

```bash
# Monitoring and Analytics
SENTRY_DSN=your_sentry_dsn
GOOGLE_ANALYTICS_ID=your_ga_id

# Third-party Services
STRIPE_SECRET_KEY=your_stripe_secret
TWILIO_AUTH_TOKEN=your_twilio_token

# Notification Services
SLACK_WEBHOOK_URL=your_slack_webhook
DISCORD_WEBHOOK_URL=your_discord_webhook
```

### Step 2: Environment Variables

Go to **Settings > Secrets and variables > Actions > Variables** and add:

```bash
# Application Configuration
NODE_VERSION=18
MONGODB_VERSION=6.0
DOCKER_REGISTRY=ghcr.io

# Build Configuration
FRONTEND_BUILD_COMMAND=npm run build
ADMIN_BUILD_COMMAND=npm run build
BACKEND_START_COMMAND=npm run server

# Deployment Configuration
DEPLOYMENT_TIMEOUT=600
HEALTH_CHECK_TIMEOUT=30
```

---

## 🛡️ Branch Protection Rules

### Step 1: Protect Main Branch

Go to **Settings > Branches > Add rule**:

#### **Branch name pattern**: `main`

#### **Protection Settings**:
- ✅ Require a pull request before merging
  - ✅ Require approvals (1-2 reviewers)
  - ✅ Dismiss stale PR approvals when new commits are pushed
  - ✅ Require review from code owners
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - **Required status checks**:
    - `test-backend`
    - `test-frontend`
    - `test-admin`
    - `security-scan`
- ✅ Require conversation resolution before merging
- ✅ Require signed commits (optional but recommended)
- ✅ Include administrators
- ✅ Restrict pushes that create files larger than 100MB

### Step 2: Protect Develop Branch

#### **Branch name pattern**: `develop`

#### **Protection Settings**:
- ✅ Require a pull request before merging
  - ✅ Require approvals (1 reviewer)
- ✅ Require status checks to pass before merging
  - **Required status checks**:
    - `validate-pr`
    - `lint-and-format`
    - `bundle-size-check`

---

## 🌍 Deployment Environments

### Step 1: Create Environments

Go to **Settings > Environments** and create:

#### **Production Environment**
- **Environment name**: `production`
- **Protection rules**:
  - ✅ Required reviewers (select team leads)
  - ✅ Wait timer: 5 minutes
  - ✅ Deployment branches: `main` only
- **Environment secrets**: Add production-specific secrets

#### **Staging Environment**
- **Environment name**: `staging`
- **Protection rules**:
  - ✅ Deployment branches: `develop` only
- **Environment secrets**: Add staging-specific secrets

### Step 2: Environment-Specific Secrets

#### **Production Secrets**
```bash
API_URL=https://api.yourapp.com
FRONTEND_URL=https://yourapp.com
MONGO_URL=mongodb+srv://prod-user:pass@prod-cluster.mongodb.net/food-delivery
JWT_SECRET=production_jwt_secret
ENCRYPTION_KEY=production_encryption_key
```

#### **Staging Secrets**
```bash
API_URL=https://staging-api.yourapp.com
FRONTEND_URL=https://staging.yourapp.com
MONGO_URL=mongodb+srv://staging-user:pass@staging-cluster.mongodb.net/food-delivery-staging
JWT_SECRET=staging_jwt_secret
ENCRYPTION_KEY=staging_encryption_key
```

---

## 🚀 Release Management

### Step 1: Release Workflow

1. **Create Release Branch**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b release/v1.2.0
   ```

2. **Prepare Release**
   ```bash
   # Update version in package.json files
   npm version patch  # or minor/major
   
   # Update CHANGELOG.md
   # Update documentation
   
   git add .
   git commit -m "Prepare release v1.2.0"
   git push origin release/v1.2.0
   ```

3. **Create Pull Request**
   - Create PR from `release/v1.2.0` to `main`
   - Add release notes
   - Request reviews

4. **Merge and Tag**
   ```bash
   # After PR approval and merge
   git checkout main
   git pull origin main
   git tag -a v1.2.0 -m "Release version 1.2.0"
   git push origin v1.2.0
   ```

### Step 2: Automated Releases

The CI/CD pipeline automatically:
- Creates GitHub releases for tags
- Builds and pushes Docker images
- Deploys to production environment
- Sends notifications

### Step 3: Release Notes Template

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Release v1.2.0

### 🚀 New Features
- Feature 1 description
- Feature 2 description

### 🐛 Bug Fixes
- Bug fix 1 description
- Bug fix 2 description

### 🔧 Improvements
- Improvement 1 description
- Improvement 2 description

### 🔒 Security
- Security update 1
- Security update 2

### 📚 Documentation
- Documentation updates

### 🧪 Testing
- [ ] Backend tests pass
- [ ] Frontend tests pass
- [ ] Admin tests pass
- [ ] Integration tests pass
- [ ] Security scan passes

### 🚀 Deployment
- [ ] Staging deployment successful
- [ ] Production deployment ready
- [ ] Database migrations (if any)
- [ ] Environment variables updated

### 📋 Checklist
- [ ] Version numbers updated
- [ ] CHANGELOG.md updated
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Migration guide provided (if needed)
```

---

## 📊 Monitoring and Notifications

### Step 1: Workflow Notifications

Add to workflow files:

```yaml
# Slack notification on failure
- name: Notify Slack on Failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: failure
    webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Step 2: Status Badges

Add to README.md:

```markdown
[![CI/CD Pipeline](https://github.com/yourusername/food-delivery-app/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/yourusername/food-delivery-app/actions)
[![Docker Build](https://github.com/yourusername/food-delivery-app/workflows/Docker%20Build%20and%20Push/badge.svg)](https://github.com/yourusername/food-delivery-app/actions)
[![Security Scan](https://github.com/yourusername/food-delivery-app/workflows/Security%20Scan/badge.svg)](https://github.com/yourusername/food-delivery-app/actions)
```

---

## 🔧 Troubleshooting

### Common Issues

1. **Workflow Permissions**
   ```yaml
   permissions:
     contents: read
     packages: write
     security-events: write
   ```

2. **Secret Access**
   - Ensure secrets are added at repository level
   - Check environment-specific secrets
   - Verify secret names match workflow files

3. **Branch Protection**
   - Required status checks must match workflow job names
   - Ensure all required checks are configured

### Getting Help

- Check **Actions** tab for workflow logs
- Review **Security** tab for vulnerability alerts
- Use **Issues** for bug reports and feature requests

---

## 📚 Next Steps

After setting up GitHub:

1. **Configure Hosting**
   - Set up production hosting (Render, Vercel, etc.)
   - Configure domain and SSL certificates
   - Set up monitoring and logging

2. **Team Setup**
   - Add team members as collaborators
   - Set up code owners file
   - Configure notification preferences

3. **Documentation**
   - Update README with your repository URL
   - Add contribution guidelines
   - Create issue templates

---

**Last Updated**: January 26, 2025

Your Food Delivery application is now ready for professional development with a complete CI/CD pipeline! 🚀