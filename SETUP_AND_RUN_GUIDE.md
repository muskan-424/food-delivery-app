# 🚀 How to Run the Food Delivery Project

Complete step-by-step guide to set up and run the Food Delivery application locally.

> **📚 For complete feature documentation, see `PROJECT_FEATURES_DOCUMENTATION.md`**
> **📊 For feature comparison, see `PROJECT_COMPARISON_ANALYSIS.md`**

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **MongoDB** - Either:
  - MongoDB Atlas (Cloud - Recommended) - [Sign up](https://www.mongodb.com/cloud/atlas)
  - MongoDB Community Edition (Local) - [Download](https://www.mongodb.com/try/download/community)
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

## ✅ Step 6: Verify Everything Works

### Test Backend API:

1. Open browser and go to: `http://localhost:4000`
2. You should see: `{"success":true,"message":"API Working"}`

### Test Frontend:

1. Open: `http://localhost:5173` (or the port shown in terminal)
2. You should see the food delivery homepage

### Test Admin Panel:

1. Open: `http://localhost:5174` (or the port shown in terminal)
2. You should see the admin login page

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
  - Auth endpoints: 5 requests per 15 minutes
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

### 📦 Project Structure

```
Food-Delivery-main/
├── backend/          # Node.js/Express API
│   ├── .env         # Environment variables (create this)
│   ├── server.js    # Main server file
│   ├── controllers/ # Business logic
│   ├── models/      # Database models (including idempotency)
│   ├── routes/      # API routes
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

---

## 🔗 Default URLs

- **Backend API**: http://localhost:4000
- **Frontend**: http://localhost:5173
- **Admin Panel**: http://localhost:5174

---

## 📚 Additional Resources

- **MongoDB Atlas Setup**: https://www.mongodb.com/docs/atlas/getting-started/
- **Payment**: Cash on Delivery (COD) - no payment gateway required
- **Express.js Docs**: https://expressjs.com/
- **React Docs**: https://react.dev/

---

## ✅ Checklist

Before running, ensure:
- [ ] Node.js installed
- [ ] MongoDB set up (Atlas or local)
- [ ] `.env` file created in `backend` folder
- [ ] All environment variables filled in (especially `ENCRYPTION_KEY`)
- [ ] Environment files created for frontend and admin
- [ ] All dependencies installed (`npm install` in each folder)
- [ ] MongoDB running/accessible
- [ ] First admin account created using `npm run create-admin`
- [ ] `uploads` folder exists in `backend` directory (for file uploads)
- [ ] ENCRYPTION_KEY is a valid 32-byte hex string (64 characters)

---

**Happy Coding! 🎉**

If you encounter any issues, check the troubleshooting section or review the error messages in the terminal.

