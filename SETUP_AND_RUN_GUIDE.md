# 🚀 How to Run the Food Delivery Project

Complete step-by-step guide to set up and run the Food Delivery application locally.

> **📚 For feature documentation, see `PROJECT_FEATURES_DOCUMENTATION.md`**

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **MongoDB** - Either:
  - MongoDB Atlas (Cloud - Recommended) - [Sign up](https://www.mongodb.com/cloud/atlas)
  - MongoDB Community Edition (Local) - [Download](https://www.mongodb.com/try/download/community)
- **Redis** (optional for local Node.js runs) - Only if you want shared/distributed rate limits locally. Docker Compose includes Redis automatically.
- **Docker Desktop** (optional) - Only if you use the containerized setup below
- **Git** (if cloning from repository)

---

## 🔧 Step 1: Install Dependencies

### Backend Dependencies

```bash
cd backend
npm install
```

This will install all required packages including:
- express-validator
- express-rate-limit
- rate-limit-redis and ioredis (optional Redis-backed rate limiting when `REDIS_URL` is set)
- helmet
- sentiment (for AI-powered review analysis)
- And all other dependencies

### Frontend Dependencies

```bash
cd frontend
npm install
```

### Admin Panel Dependencies

```bash
cd admin
npm install
```

---

## 🔐 Step 2: Environment Variables Setup

### Create `.env` file in the `backend` folder

1. Navigate to the `backend` folder
2. Create a new file named `.env` (no extension)
3. Add the following environment variables:

```env
# JWT Secret Key (use a strong random string)
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random

# JWT Refresh Secret (should be different from JWT_SECRET)
JWT_REFRESH_SECRET=your_refresh_secret_key_here_make_it_different

# Bcrypt Salt Rounds (default: 10)
SALT=10

# MongoDB Connection URL
# For MongoDB Atlas (Cloud):
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/food-delivery?retryWrites=true&w=majority

# For Local MongoDB:
# MONGO_URL=mongodb://localhost:27017/food-delivery

# Encryption Key for sensitive data (32 bytes hex)
ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Frontend URL for password reset links
FRONTEND_URL=http://localhost:5173

# Enable scheduled jobs for data retention
ENABLE_SCHEDULED_JOBS=true

# Payment Methods: UPI, Net Banking, Cards, Wallets, Cash on Delivery
# No external payment gateway required - all handled internally

# Server Port (optional, defaults to 4000)
PORT=4000

# Redis (optional — omit for in-memory rate limits)
# Local Redis:
# REDIS_URL=redis://localhost:6379
# Docker Compose sets this in the project root .env (see Docker section)
```

### 🔑 Getting Your Keys:

1. **JWT_SECRET**: Generate a random string (at least 32 characters)
   ```bash
   # You can use Node.js to generate one:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **ENCRYPTION_KEY**: Generate a 32-byte hex string for data encryption
   ```bash
   # Generate encryption key:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   **Important**: This key encrypts sensitive user data (phone numbers, addresses). Never change it after deployment as it will make existing encrypted data unreadable.

3. **MONGO_URL**: 
   - **MongoDB Atlas (Recommended)**: 
     - Sign up at https://www.mongodb.com/cloud/atlas
     - Create a free cluster
     - Get connection string from "Connect" → "Connect your application"
   - **Local MongoDB**: 
     - Install MongoDB locally
     - Use: `mongodb://localhost:27017/food-delivery`

4. **Payment System**:
   - Multiple payment methods supported (UPI, Cards, Wallets, Net Banking, COD)
   - No external payment gateway required
   - All payments tracked internally

5. **Redis (`REDIS_URL`)**:
   - **Not required** for local development: if you leave `REDIS_URL` unset, API rate limits use in-memory storage (fine for a single server process).
   - **Set `REDIS_URL`** when you run Redis locally or use Docker Compose (Compose provides Redis and sets this for the backend container).

---

## 🌐 Step 3: Configure Frontend URLs

### Create Environment Files

**Frontend** - Create `frontend/.env.local`:
```env
VITE_API_URL=http://localhost:4000
VITE_APP_NAME=Food Delivery App
VITE_NODE_ENV=development
```

**Admin Panel** - Create `admin/.env.local`:
```env
VITE_API_URL=http://localhost:4000
VITE_APP_NAME=Food Delivery Admin
VITE_NODE_ENV=development
VITE_ADMIN_SESSION_TIMEOUT=3600000
VITE_ADMIN_TOKEN_REFRESH_INTERVAL=300000
```

The applications will automatically use these environment variables for proper configuration.

---

## 🗄️ Step 4: Start MongoDB

### If using MongoDB Atlas:
- No local setup needed, just ensure your connection string is correct

### If using Local MongoDB:
```bash
# Windows
# MongoDB should start automatically as a service
# Or start manually:
mongod

# Mac/Linux
sudo systemctl start mongod
# Or:
mongod
```

---

## 🚀 Step 5: Run the Application

You need to run **3 separate terminals** (one for each part):

### Terminal 1: Backend Server

```bash
cd backend
npm run server
```

Or if you don't have nodemon:
```bash
cd backend
node server.js
```

**Expected Output:**
```
DB Connected
Server Started on port: 4000
```

**Backend will run on:** `http://localhost:4000`

### Terminal 2: Frontend (User Panel)

```bash
cd frontend
npm run dev
```

**Expected Output:**
```
VITE v4.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

**Frontend will run on:** `http://localhost:5173` (or similar port)

### Terminal 3: Admin Panel

```bash
cd admin
npm run dev
```

**Expected Output:**
```
VITE v4.x.x  ready in xxx ms

➜  Local:   http://localhost:5174/
➜  Network: use --host to expose
```

**Admin Panel will run on:** `http://localhost:5174` (or similar port)

---

## 🐳 Docker Compose (full stack alternative)

Use this when you want MongoDB, Redis, backend, frontend, admin, and nginx all running in containers. **Compose reads environment from a `.env` file in the project root** (not `backend/.env`).

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine + Compose on Linux
- Enough disk/RAM for MongoDB + Redis + Node images

### 1. Root environment file

From the **repository root** (folder that contains `docker-compose.yml`):

1. Copy the template:  
   `cp .env.docker .env`  
   On Windows PowerShell: `Copy-Item .env.docker .env`
2. Edit **`.env`** and replace every placeholder (MongoDB root user/password, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, email credentials, etc.).  
3. **`REDIS_URL`** is already set for Compose (`redis://redis:6379`). Change it only if you use an external Redis.

### 2. Build and start

```bash
# From project root
docker compose up -d --build
```

Services (default ports):

| Service   | Port (host) | Notes                          |
|----------|-------------|--------------------------------|
| Backend  | 4000        | API                            |
| Frontend | 3000        | User app (nginx inside image)  |
| Admin    | 3001        | Admin panel                    |
| MongoDB  | 27017       | Optional external access       |
| Redis    | 6379        | Optional external access       |
| Nginx    | 80, 443     | Reverse proxy (if used)        |

### 3. API URL for browsers

If the user’s browser loads the frontend from `http://localhost:3000`, the frontend must call an API URL it can reach. For local Docker, **`VITE_API_URL` in root `.env`** is often `http://localhost:4000` (already typical in `.env.docker`). Adjust if you use another host or HTTPS.

### 4. First admin (inside backend container)

```bash
docker compose exec backend npm run create-admin
```

### 5. Useful commands

```bash
docker compose ps
docker compose logs -f backend
docker compose down          # stop containers
docker compose down -v       # stop and remove volumes (wipes DB/Redis data)
```

After pulling changes that add npm packages, rebuild the backend image:  
`docker compose build --no-cache backend` or `docker compose up -d --build`.

---

## ✅ Step 6: Verify Everything Works

### Test Backend API:

1. Open browser and go to: `http://localhost:4000`
2. You should see: `{"success":true,"message":"API Working"}`

### Health check (MongoDB + Redis when configured):

1. Open: `http://localhost:4000/api/health`
2. You should see JSON with `"mongo": "connected"` and `"redis": "ok"` (Docker) or `"redis": "disabled"` (local Node without `REDIS_URL`).  
3. HTTP **503** means MongoDB or required Redis is not ready; wait a few seconds after `docker compose up` and retry.

### Test Frontend:

1. **Local dev:** Open `http://localhost:5173` (or the port shown in terminal).  
2. **Docker:** Open `http://localhost:3000` (user app is published on port 3000).

You should see the food delivery homepage.

### Test Admin Panel:

1. **Local dev:** Open `http://localhost:5174` (or the port shown in terminal).  
2. **Docker:** Open `http://localhost:3001`.

You should see the admin login page.

---

## 🧪 Step 7: Create Your First Admin User

The project now includes a secure admin creation system with a maximum limit of 2 administrators.

### Create First Admin Using Setup Script

```bash
cd backend
npm run create-admin
```

**The interactive script will:**
- Check if any admins already exist
- Prompt for admin details (name, email, password)
- Validate password strength requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character
- Create the first admin account
- Show success message with login details

**Example interaction:**
```
🔧 First Admin Setup

✅ Connected to database

No admin accounts found. Let's create the first admin.

Enter admin name: John Doe
Enter admin email: admin@example.com
Enter admin password: SecurePass123!

Create admin account for "admin@example.com"? (y/N): y

✅ First admin account created successfully!
📧 Email: admin@example.com
👤 Name: John Doe
🔑 Role: admin

🚀 You can now login to the admin panel and create up to 1 more admin account.
🌐 Admin Panel: http://localhost:5174
```

### Create Additional Admin (After First Login)

1. Login to admin panel at `http://localhost:5174`
2. Navigate to "Create Admin" in the sidebar
3. Fill out the admin creation form
4. System enforces maximum 2 administrators limit

### Admin Management Features

- **Maximum Limit**: Only 2 administrators allowed
- **Secure Creation**: Admin-only access to create new admins
- **Password Validation**: Strong password requirements enforced
- **Audit Trail**: Tracks who created admin accounts
- **Statistics Dashboard**: Shows current admin count and available slots

---

## 📝 Important Notes

### 🔒 Security Features (New)

The project now includes enhanced security:
- **Rate Limiting**: Prevents brute force attacks  
  - **With `REDIS_URL` set** (Docker Compose or local Redis): limits are stored in Redis so multiple backend instances share the same counters.  
  - **Without `REDIS_URL`**: limits are in-memory (per Node process).  
  - Auth endpoints: 20 attempts per 15 minutes (failed attempts counted; successful logins are not counted)  
  - Order placement: 10 requests per minute  
  - General API: 100 requests per 15 minutes

- **Request Validation**: All inputs are validated
  - Email format validation
  - Password strength (min 8 characters)
  - Required field validation
  - Data type validation

- **File Upload Security**:
  - Only images allowed (jpeg, jpg, png, gif, webp)
  - Maximum file size: 5MB
  - Path traversal protection

- **JWT Token Expiration**: Tokens expire after 7 days

- **Idempotency**: Prevents duplicate operations
  - Send `Idempotency-Key` header with unique value (UUID recommended)
  - Same request with same key returns cached response
  - Keys expire after 24 hours
  - Applied to: order placement, food creation, cart operations
  - **Usage Example:**
    ```javascript
    const idempotencyKey = crypto.randomUUID();
    fetch('/api/order/place', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(orderData)
    });
    ```

### 🐛 Troubleshooting

**Issue: "DB Connected" not showing**
- Check your MongoDB connection string in `.env`
- Ensure MongoDB is running (if local)
- Check network connectivity (if using Atlas)

**Issue: Port already in use**
- Change `PORT` in `.env` file
- Or kill the process using the port:
  ```bash
  # Windows
  netstat -ano | findstr :4000
  taskkill /PID <PID> /F
  
  # Mac/Linux
  lsof -ti:4000 | xargs kill
  ```

**Issue: "Module not found"**
- Run `npm install` in the respective folder
- Delete `node_modules` and `package-lock.json`, then reinstall

**Issue: CORS errors**
- Ensure backend is running on the correct port
- Check that frontend/admin URLs match backend URL in their config files

**Issue: ENCRYPTION_KEY environment variable error**
- Ensure `ENCRYPTION_KEY` is set in your `.env` file
- Generate a 32-byte hex key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Never change this key after deployment as it encrypts user data
- The key must be exactly 64 characters (32 bytes in hex format)

**Issue: createFirstAdmin script fails**
- Ensure all environment variables are set in `.env` file
- Check that MongoDB is running and accessible
- Verify the database connection string is correct
- The script bypasses encryption hooks for initial setup

**Issue: File upload fails**
- Ensure `uploads` folder exists in `backend` directory
- Check file size (must be < 5MB)
- Check file type (must be image)

**Issue: Idempotency not working**
- Ensure MongoDB is connected (idempotency keys are stored in database)
- Check that `Idempotency-Key` header is being sent (optional feature)
- Keys are automatically cleaned up after 24 hours

**Issue: `/api/health` returns 503**
- **MongoDB**: Wait for the database to finish starting, or fix `MONGO_URL` / Compose Mongo credentials.
- **Redis**: If `REDIS_URL` is set, Redis must be reachable. In Docker, ensure the `redis` service is up: `docker compose ps`.

**Issue: Docker backend fails or old dependencies**
- Rebuild: `docker compose build --no-cache backend` then `docker compose up -d`.
- Ensure **root** `.env` exists (copied from `.env.docker`) with real secrets.

### 📦 Project Structure

```
Food-Delivery-main/
├── .env.docker      # Template for Docker Compose (copy to .env at root)
├── .env             # Root env for Compose (create from .env.docker)
├── docker-compose.yml
├── Dockerfile.backend / Dockerfile.frontend / Dockerfile.admin
├── backend/         # Node.js/Express API
│   ├── .env         # Environment variables for local Node (create this)
│   ├── server.js    # Main server file
│   ├── config/      # DB, Redis client
│   ├── controllers/ # Business logic
│   ├── models/      # Database models (including idempotency)
│   ├── routes/      # API routes (includes /api/health)
│   ├── middleware/  # Auth, validation, rate limiting, idempotency
│   └── uploads/     # Uploaded images
├── frontend/        # React user interface
└── admin/           # React admin panel
```

---

## 🎯 Quick Start Commands Summary

```bash
# 1. Install all dependencies
cd backend && npm install
cd ../frontend && npm install
cd ../admin && npm install

# 2. Create .env file in backend folder (see Step 2)

# 3. Create environment files for frontend and admin (see Step 3)

# 4. Create first admin account
cd backend
npm run create-admin

# 5. Run backend (Terminal 1)
cd backend
npm run server

# 6. Run frontend (Terminal 2)
cd frontend
npm run dev

# 7. Run admin (Terminal 3)
cd admin
npm run dev
```

### Docker (from project root)

```bash
cp .env.docker .env   # then edit .env with real secrets
docker compose up -d --build
docker compose exec backend npm run create-admin
```

---

## 🔗 Default URLs

**Local Node + Vite dev servers**

- **Backend API**: http://localhost:4000
- **Frontend**: http://localhost:5173
- **Admin Panel**: http://localhost:5174

**Docker Compose**

- **Backend API**: http://localhost:4000
- **Frontend**: http://localhost:3000
- **Admin Panel**: http://localhost:3001

---

## 📚 Additional Resources

- **MongoDB Atlas Setup**: https://www.mongodb.com/docs/atlas/getting-started/
- **Docker Docs**: https://docs.docker.com/compose/
- **Redis**: https://redis.io/docs/
- **Payment**: Cash on Delivery (COD) - no payment gateway required
- **Express.js Docs**: https://expressjs.com/
- **React Docs**: https://react.dev/

---

## ✅ Checklist

Before running, ensure:

**Local (Node) setup**

- [ ] Node.js installed
- [ ] MongoDB set up (Atlas or local)
- [ ] `.env` file created in `backend` folder
- [ ] All environment variables filled in (especially `ENCRYPTION_KEY`)
- [ ] (Optional) `REDIS_URL` in `backend/.env` if using local Redis for rate limits
- [ ] Environment files created for frontend and admin
- [ ] All dependencies installed (`npm install` in each folder)
- [ ] MongoDB running/accessible
- [ ] First admin account created using `npm run create-admin`
- [ ] `uploads` folder exists in `backend` directory (for file uploads)
- [ ] ENCRYPTION_KEY is a valid 32-byte hex string (64 characters)

**Docker Compose setup (if used)**

- [ ] Docker installed and running
- [ ] Root `.env` created from `.env.docker` and secrets updated
- [ ] `docker compose up -d --build` completed successfully
- [ ] First admin created with `docker compose exec backend npm run create-admin`
- [ ] Health check OK at http://localhost:4000/api/health

---

**Happy Coding! 🎉**

If you encounter any issues, check the troubleshooting section or review the error messages in the terminal.

