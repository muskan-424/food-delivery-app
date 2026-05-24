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

# Payment Methods: UPI, Net Banking, Cards, Wallets, Cash on Delivery, Razorpay Checkout

# Razorpay Checkout (create order + verify callback) — different from webhook secret below
# RAZORPAY_KEY_ID=rzp_test_...
# RAZORPAY_KEY_SECRET=...
# Optional anti-spam cooldown between create-order retries per payment (default 15000)
# RAZORPAY_CREATE_ORDER_COOLDOWN_MS=15000

# Payment webhooks (optional — Phase 3)
# Generic: POST /api/payment/webhook/generic — header X-Payment-Webhook-Signature: sha256=<hmac>
# PAYMENT_WEBHOOK_SECRET=your_shared_secret
# Razorpay: POST /api/payment/webhook/razorpay — header X-Razorpay-Signature
# RAZORPAY_WEBHOOK_SECRET=...
# Phase 3 strategy in this project: single online gateway (Razorpay) + COD fallback.

# Server Port (optional, defaults to 4000)
PORT=4000

# Redis (optional — omit for in-memory rate limits)
# Local Redis:
# REDIS_URL=redis://localhost:6379
# Docker Compose sets this in the project root .env (see Docker section)

# Phase 0 — optional (requires REDIS_URL for the job queue)
# ENABLE_JOB_QUEUE=true
# ENABLE_MARKETPLACE=false
# API_VERSION=v1

# Phase 9 — observability logging (optional)
# Enable/disable structured request logs (default: true)
# ENABLE_STRUCTURED_REQUEST_LOGS=true
# Sampling rate for normal requests (0.0 to 1.0, default: 0.15)
# REQUEST_LOG_SAMPLE_RATE=0.15
# Always log requests slower than this many ms (default: 1200)
# REQUEST_LOG_SLOW_MS=1200
```

**Recommended production starting values (adjust after traffic review):**

```env
ENABLE_STRUCTURED_REQUEST_LOGS=true
REQUEST_LOG_SAMPLE_RATE=0.10
REQUEST_LOG_SLOW_MS=1000
```

### Phase 1 — catalog & restaurant (optional fields)

- **Food list:** `GET /api/food/list?restaurantId=<id>&availableOnly=true`
- **Food (admin):** multipart `restaurantId`, `stockCount`, `modifierGroups` as JSON string, e.g. `[{"key":"size","name":"Size","required":true,"minSelect":1,"maxSelect":1,"options":[{"key":"reg","name":"Regular","priceDelta":0},{"key":"lg","name":"Large","priceDelta":40}]}]`
- **Restaurant (admin):** `weeklyHours` (array of `{ dayOfWeek: 0–6, open, close, closed }`, times `HH:mm`), `hourExceptions`, `deliveryRadiusKm` (requires customer `address.coordinates` on checkout to enforce)
- **Place order:** Server recalculates item prices from menu data. Optional per line: `modifiers: [{ "groupKey": "size", "optionKeys": ["lg"] }]`. With `restaurantId`, validates open hours, delivery radius, minimum order, and that all items belong to that restaurant.


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
   - Razorpay Checkout is used for online payment verification
   - COD remains available as fallback if online payment is incomplete

### Phase 4 — payouts API (admin)

- **Preview payout:** `POST /api/restaurant/payouts/preview` body: `periodStart`, `periodEnd`, optional `restaurantId`, optional `statuses` (array or comma-separated)
- **Create payout batch:** `POST /api/restaurant/payouts/batch`
- **List payout batches:** `GET /api/restaurant/payouts/batch?status=draft&page=1&limit=20`
- **Get payout batch:** `GET /api/restaurant/payouts/batch/:batchId`
- **Update lifecycle:** `PATCH /api/restaurant/payouts/batch/:batchId/status` body: `status` (`finalized|paid|reconciled`), optional `notes`, `paidReference`
- **CSV export:** `GET /api/restaurant/payouts/batch/:batchId/export.csv`

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

### Scheduling runtime config check (Phase 2):

Use this when validating scheduled-order advancement tuning values at runtime.

```bash
curl http://localhost:4000/api/health/scheduling-config
```

Expected response shape:

```json
{
  "success": true,
  "scheduling": {
    "enableScheduledJobs": true,
    "enableJobQueue": true,
    "queueActive": true,
    "orderAdvancement": {
      "everyMs": 60000,
      "limit": 100,
      "overdueGraceMinutes": 15,
      "dryRunIdListCap": 100
    }
  }
}
```

Manual advancement trigger (admin-only, for testing):

```bash
curl -X POST http://localhost:4000/api/order/scheduled/advance \
  -H "Content-Type: application/json" \
  -H "token: <ADMIN_JWT>" \
  -d '{"limit":50}'
```

Dry-run (no status changes):

```bash
curl -X POST http://localhost:4000/api/order/scheduled/advance \
  -H "Content-Type: application/json" \
  -H "token: <ADMIN_JWT>" \
  -d '{"limit":50,"dryRun":true}'
```

Response includes: `scanned`, `dueOrderCount`, `advanced`, `failed`, `dueOrderIds` (capped in dry-run; see `dueOrderIdsTruncated`), `usedLimit`, `dryRun`, `triggeredAt`. Configure cap with `SCHEDULED_ORDER_DRY_RUN_ID_CAP` (default 100, max 500).

### Observability and metrics checks (Phase 9):

Use these endpoints to verify runtime observability wiring in local/dev/prod.

```bash
# Deep operational snapshot (JSON)
curl http://localhost:4000/api/health/ops

# Lightweight in-memory route metrics (JSON)
curl http://localhost:4000/api/health/metrics-lite

# Prometheus scrape output (text format)
curl http://localhost:4000/api/health/metrics
```

What to look for:
- `/api/health/ops`: `runtime`, `queue`, `realtime`, `retention` blocks present
- `/api/health/metrics-lite`: `totals.requests` increasing after API calls
- `/api/health/metrics`: lines like `http_requests_total` and `http_route_requests_total{...}`

### Object storage direct-upload finalize flow (Phase 9):

Use this 3-step flow when `OBJECT_STORAGE_PROVIDER=s3` and frontend uploads directly to object storage.

```bash
# 1) Request profile picture upload URL
curl -X POST http://localhost:4000/api/profile/picture/upload-url \
  -H "Content-Type: application/json" \
  -H "token: <USER_JWT>" \
  -d '{"ext":"jpg","contentType":"image/jpeg"}'

# 2) Upload bytes directly to returned uploadUrl (PUT)
# (Use your HTTP client / frontend code; URL is pre-signed)

# 3) Finalize key attach in backend
curl -X POST http://localhost:4000/api/profile/picture/finalize \
  -H "Content-Type: application/json" \
  -H "token: <USER_JWT>" \
  -d '{"key":"profile_<userId>_<timestamp>.jpg"}'
```

Food image finalize flow:

```bash
# 1) Request food image upload URL (menu.manage permission required)
curl -X POST http://localhost:4000/api/food/image/upload-url \
  -H "Content-Type: application/json" \
  -H "token: <STAFF_OR_ADMIN_JWT>" \
  -d '{"ext":"png","contentType":"image/png"}'

# 2) Upload bytes directly to returned uploadUrl (PUT)

# 3) Attach uploaded key to a food item
curl -X POST http://localhost:4000/api/food/<foodId>/image/finalize \
  -H "Content-Type: application/json" \
  -H "token: <STAFF_OR_ADMIN_JWT>" \
  -d '{"key":"food_<timestamp>_<rand>.png"}'
```

KYC document finalize flow:

```bash
# 1) Request KYC document upload URL (restaurant.manage permission required)
curl -X POST http://localhost:4000/api/restaurant/<restaurantId>/kyc/upload-url \
  -H "Content-Type: application/json" \
  -H "token: <STAFF_OR_ADMIN_JWT>" \
  -d '{"ext":"pdf","contentType":"application/pdf"}'

# 2) Upload bytes directly to returned uploadUrl (PUT)

# 3) Finalize KYC key attach
curl -X POST http://localhost:4000/api/restaurant/<restaurantId>/kyc/finalize \
  -H "Content-Type: application/json" \
  -H "token: <STAFF_OR_ADMIN_JWT>" \
  -d '{"key":"kyc_<restaurantId>_<timestamp>.pdf"}'
```

POD evidence finalize flow:

```bash
# 1) Driver requests POD evidence upload URL for their assignment
curl -X POST http://localhost:4000/api/delivery/assignment/<assignmentId>/pod/upload-url \
  -H "Content-Type: application/json" \
  -H "token: <DRIVER_JWT>" \
  -d '{"ext":"jpg","contentType":"image/jpeg"}'

# 2) Upload bytes directly to returned uploadUrl (PUT)

# 3) Driver finalizes POD evidence key
curl -X POST http://localhost:4000/api/delivery/assignment/<assignmentId>/pod/finalize \
  -H "Content-Type: application/json" \
  -H "token: <DRIVER_JWT>" \
  -d '{"key":"pod_<assignmentId>_<timestamp>.jpg"}'
```

### Analytics export pipeline (Phase 9):

Admin can export filtered analytics events to local artifacts (`jsonl` or `csv`).

```bash
# 1) Create export (returns exportId)
curl -X POST http://localhost:4000/api/admin/users/analytics/events/export \
  -H "Content-Type: application/json" \
  -H "token: <ADMIN_JWT>" \
  -d '{"format":"jsonl","from":"2026-01-01T00:00:00Z","to":"2026-12-31T23:59:59Z","statusClass":"5xx"}'

# 2) List recent exports
curl -H "token: <ADMIN_JWT>" \
  http://localhost:4000/api/admin/users/analytics/events/exports

# 3) Download export artifact by id
curl -L -H "token: <ADMIN_JWT>" \
  http://localhost:4000/api/admin/users/analytics/events/exports/<exportId>/download \
  -o analytics-export.jsonl
```

Retention for export artifacts:

```env
# Optional: days to keep analytics export files/metadata (default: 30)
# ANALYTICS_EXPORT_RETENTION_DAYS=30
```

### Retention cleanup on-demand (admin):

Use this to preview or trigger retention cleanup immediately.

```bash
# Dry-run preview (no deletes)
curl -X POST http://localhost:4000/api/gdpr/admin/retention/run \
  -H "Content-Type: application/json" \
  -H "token: <ADMIN_JWT>" \
  -d '{"dryRun":true}'

# Execute cleanup now
curl -X POST http://localhost:4000/api/gdpr/admin/retention/run \
  -H "Content-Type: application/json" \
  -H "token: <ADMIN_JWT>" \
  -d '{"dryRun":false}'
```

### Partner API client credentials flow (Phase 10):

Use this to test external partner integrations with OAuth2-style client credentials.

```bash
# 1) Create a partner API client (admin)
curl -X POST http://localhost:4000/api/admin/users/partner-clients \
  -H "Content-Type: application/json" \
  -H "token: <ADMIN_JWT>" \
  -d '{"name":"POS Integration","scopes":["orders.read"]}'

# Response includes one-time clientSecret — copy and store securely.

# Optional: rotate secret for an existing clientId
curl -X POST http://localhost:4000/api/admin/users/partner-clients/<CLIENT_ID>/rotate-secret \
  -H "token: <ADMIN_JWT>"

# 2) Exchange client credentials for access token
curl -X POST http://localhost:4000/api/partner/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"<CLIENT_ID>","client_secret":"<CLIENT_SECRET>","scope":"orders.read"}'

# Note: requested `scope` values must exist in the catalog and be authorized
# for the client. Unknown or unauthorized values return `400 invalid_scope`.

# 3) Call a scope-protected partner endpoint
curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
  http://localhost:4000/api/partner/orders/ping

# 4) (Admin) inspect recent partner API audit logs
curl -H "token: <ADMIN_JWT>" \
  "http://localhost:4000/api/admin/users/partner-api/audit?limit=20"

# 5) (Admin) export partner API audit logs as CSV (supports clientId/from/to filters)
curl -H "token: <ADMIN_JWT>" \
  "http://localhost:4000/api/admin/users/partner-api/audit.csv?limit=1000&clientId=<CLIENT_ID>&from=<ISO>&to=<ISO>" \
  -o partner_api_audit.csv
```

PowerShell quick test:

```powershell
$token = Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/partner/oauth/token" -ContentType "application/json" -Body '{"grant_type":"client_credentials","client_id":"<CLIENT_ID>","client_secret":"<CLIENT_SECRET>","scope":"orders.read"}'
Invoke-RestMethod -Method GET -Uri "http://localhost:4000/api/partner/orders/ping" -Headers @{ Authorization = "Bearer $($token.access_token)" }
```

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

## 🧪 Testing & health checks

### Backend configuration check

```bash
cd backend
npm run test:setup
```

Verifies required env vars, MongoDB connectivity, encryption key, and JWT secrets.

### Smoke tests (API regression)

**Terminal 1** — start backend:

```bash
cd backend
npm run server
```

**Terminal 2** — run smoke suite:

```bash
cd backend
npm run test:smoke
```

Covers 21 checks: order status machine, health/ops endpoints, food list, search, user register/login, profile, growth API, notifications inbox, admin dashboard stats, and disputes summary. Exit code `0` = all passed.

Optional: `BASE_URL=http://localhost:4000 node smoke-test.js` if the API runs on a non-default host/port.

---

## 🔑 Password reset (local dev / recovery)

Passwords are stored as **bcrypt hashes** and cannot be read back from MongoDB. Use the reset CLI when you forget a login.

### List registered emails

```bash
cd backend
npm run reset-password -- --list
```

### Set a new password

```bash
cd backend
npm run reset-password -- --email "admin@example.com" --password "Admin123!"
npm run reset-password -- --email "muskanmittal151@gmail.com" --password "YourNewPass1!"
```

Password must meet app rules: 8+ chars, upper, lower, number, special character.

The script also clears account lockouts and revokes active refresh tokens (user must log in again).

**Legacy admin-only script:** `node reset-admin.js` resets `admin@example.com` to `Admin123!`.

### Remove test accounts from database

```bash
cd backend
npm run purge-test-users              # dry-run — lists targets
npm run purge-test-users -- --execute # delete test users + related tokens
```

Removes `@test.local`, `testuser@example.com`, and `john.doe.tester@example.com` accounts. Smoke tests also delete their temporary user automatically after each run.

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

**Issue: Forgot login password (local dev)**

- Passwords are hashed and cannot be retrieved from the database.
- List accounts: `npm run reset-password -- --list`
- Reset: `npm run reset-password -- --email user@example.com --password "NewPass1!"`
- Main admin shortcut: `node reset-admin.js` → sets `admin@example.com` to `Admin123!`

**Issue: Smoke tests fail with connection error**
- Hit a few API routes first (for example `/api/food/list`, `/api/health`), then re-check `/api/health/metrics-lite`.
- Confirm backend process was restarted after recent code changes.
- If you only call static/assets paths, request counters may not move meaningfully.

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
│   ├── scripts/     # createFirstAdmin, resetUserPassword, etc.
│   ├── smoke-test.js    # API smoke test suite (npm run test:smoke)
│   ├── test-setup.js    # Env/DB config check (npm run test:setup)
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

# 8. (Optional) Verify backend health
cd backend
npm run test:setup
npm run test:smoke   # backend must be running
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
- [ ] (Optional) Smoke tests pass: `npm run test:smoke` with backend running
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

