# TOMATO - Food Ordering Website

This repository hosts the source code for TOMATO, a dynamic food ordering website built with the MERN Stack. It offers a user-friendly platform for seamless online food ordering.

## Demo

- User Panel: [https://food-delivery-frontend-s2l9.onrender.com/](https://food-delivery-frontend-s2l9.onrender.com/)
- Admin Panel: [https://food-delivery-admin-wrme.onrender.com/](https://food-delivery-admin-wrme.onrender.com/)

## Documentation

| Document | Purpose |
|----------|---------|
| [SETUP_AND_RUN_GUIDE.md](SETUP_AND_RUN_GUIDE.md) | Local setup, env vars, Docker |
| [PROJECT_FEATURES_DOCUMENTATION.md](PROJECT_FEATURES_DOCUMENTATION.md) | Feature reference |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Deploy to cloud/VPS/Docker |

## Features

### Core Features
- User Panel
- Admin Panel
- JWT Authentication
- Password Hashing with Bcrypt
- Cash on Delivery (COD) Payment
- Login/Signup
- Logout
- Add to Cart
- Place Order
- Order Management
- Products Management
- Filter Food Products
- Authenticated APIs
- REST APIs
- Role-Based Identification

### Advanced Features (New!)
- ✅ **User Profile Management** - Profile customization, picture upload, phone number, password change
- ✅ **Address Management** - Multiple addresses, address book, auto-save, email & country support, address manager UI
- ✅ **Order Tracking** - Real-time order status, timeline
- ✅ **Reviews & Ratings** - Food ratings, review comments, sentiment analysis, per-order-item reviews, reviewer info display
- ✅ **Multi-Restaurant Support** - Restaurant management
- ✅ **Delivery Tracking** - Live delivery tracking
- ✅ **Payment System** - Multiple payment methods (UPI, Net Banking, Cards, Wallets, COD), payment history, admin payment management
- ✅ **Offers & Discounts** - Comprehensive offers system with payment method discounts, free delivery, first order discounts, admin offer management
- ✅ **Free Delivery** - Automatic free delivery above ₹150 (configurable)
- ✅ **Payment Method Discounts** - Special discounts for UPI, cards, wallets, etc.
- ✅ **Wishlist/Favorites** - Save favorite items
- ✅ **Customer Support** - Ticket system, FAQ
- ✅ **Location Services** - Distance calculation, nearby restaurants
- ✅ **Search & Filtering** - Text search, price range, sorting
- ✅ **Notifications** - Order updates, status notifications
- ✅ **Order Cancellation** - Users can cancel orders
- ✅ **Review Management** - Admin can manage and filter reviews (positive/negative)
- ✅ **Sentiment Analysis** - AI-powered automatic review classification
- ✅ **Review Updates** - Users can update their previous reviews
- ✅ **Admin Management** - Create up to 2 admin accounts with secure validation
- ✅ **Currency** - All prices displayed in Indian Rupees (INR)

### DevOps & Deployment Features (New!)
- ✅ **Docker Containerization** - Multi-service Docker setup with Docker Compose
- ✅ **Environment Management** - Environment configuration for dev/staging/production
- ✅ **Deployment Scripts** - Cross-platform deployment automation (Linux/Windows)
- ✅ **Health Monitoring** - Application health checks and monitoring setup

## Screenshots

![Hero](https://i.ibb.co/59cwY75/food-hero.png)
- Hero Section

![Products](https://i.ibb.co/JnNQPyQ/food-products.png)
- Products Section

![Cart](https://i.ibb.co/t2LrQ8p/food-cart.png)
- Cart Page

![Login](https://i.ibb.co/s6PgwkZ/food-login.png)
- Login Popup

## Quick Start

### Option 1: Development Setup (Recommended for development)

```bash
# Clone the repository
git clone https://github.com/yourusername/food-delivery-app.git
cd food-delivery-app

# Quick setup (Linux/macOS)
chmod +x scripts/setup-dev.sh
./scripts/setup-dev.sh

# Quick setup (Windows)
.\scripts\setup-dev.ps1

# Create first admin
cd backend && npm run create-admin

# Start development servers (3 terminals)
cd backend && npm run server    # Terminal 1: Backend (port 4000)
cd frontend && npm run dev      # Terminal 2: Frontend (port 5173)
cd admin && npm run dev         # Terminal 3: Admin (port 5174)
```

### Option 2: Docker Deployment (Recommended for production)

```bash
# Clone and configure
git clone https://github.com/yourusername/food-delivery-app.git
cd food-delivery-app
cp .env.docker .env
# Edit .env with your actual values

# Deploy with Docker
docker-compose up -d --build

# Create first admin
docker-compose exec backend npm run create-admin

# Access applications
# Frontend: http://localhost:3000
# Admin: http://localhost:3001
# Backend API: http://localhost:4000
```

### Option 3: Automated Deployment

```bash
# Linux/macOS
./scripts/deploy.sh -e production

# Windows
.\scripts\deploy.ps1 -Environment production
```

## Run Locally

Clone the project

```bash
    git clone https://github.com/Mshandev/Food-Delivery
```
Go to the project directory

```bash
    cd Food-Delivery
```
Install dependencies (frontend)

```bash
    cd frontend
    npm install
```
Install dependencies (admin)

```bash
    cd admin
    npm install
```
Install dependencies (backend)

```bash
    cd backend
    npm install
```
Setup Environment Variables

Create a `.env` file in the `backend` folder and add the following:

```env
# JWT Secret Key (use a strong random string)
JWT_SECRET=YOUR_SECRET_TEXT
JWT_REFRESH_SECRET=YOUR_REFRESH_SECRET_TEXT
SALT=YOUR_SALT_VALUE
MONGO_URL=YOUR_DATABASE_URL
PORT=4000

# Encryption Key for sensitive data (32 bytes hex)
ENCRYPTION_KEY=YOUR_32_BYTE_HEX_KEY

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Frontend URL for password reset links
FRONTEND_URL=http://localhost:5173

# Enable scheduled jobs for data retention
ENABLE_SCHEDULED_JOBS=true
```

Create First Admin Account

Before starting the application, create the first admin account:

```bash
cd backend
npm run create-admin
```

Follow the interactive prompts to create your first administrator account. The system enforces a maximum of 2 administrators and includes comprehensive password validation.

Setup the Frontend and Backend URL

Create environment files for proper configuration:

**Frontend** - Create `frontend/.env.local`:
```env
VITE_API_URL=http://localhost:4000
VITE_APP_NAME=Food Delivery App
```

**Admin Panel** - Create `admin/.env.local`:
```env
VITE_API_URL=http://localhost:4000
VITE_APP_NAME=Food Delivery Admin
```

The applications will automatically use these environment variables. 

Start the Backend server

```bash
    cd backend
    npm run server
```

Or if you don't have nodemon:

```bash
    cd backend
    node server.js
```

Start the Frontend server

```bash
    cd frontend
    npm run dev
```

Start the Admin Panel

```bash
    cd admin
    npm run dev
```
## Tech Stack
* [React](https://reactjs.org/)
* [Node.js](https://nodejs.org/en)
* [Express.js](https://expressjs.com/)
* [Mongodb](https://www.mongodb.com/)
* [JWT-Authentication](https://jwt.io/introduction)
* [Multer](https://www.npmjs.com/package/multer)

## DevOps & Deployment
* [Docker](https://www.docker.com/) - Containerization
* [Nginx](https://nginx.org/) - Reverse Proxy & Load Balancing
* [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) - Cloud Database

Deploy using Docker, cloud platforms (e.g. Render), or the scripts in `DEPLOYMENT_GUIDE.md`.

For detailed setup instructions, see:
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Deployment options
- [Setup and Run Guide](SETUP_AND_RUN_GUIDE.md) - Local development
- [Project Features](PROJECT_FEATURES_DOCUMENTATION.md) - Feature reference

## Deployment

The application is deployed on Render.

## Contributing

Contributions are always welcome!
Just raise an issue, and we will discuss it.

## Feedback

If you have any feedback, please reach out to me [here](https://www.linkedin.com/in/muhammad-shan-full-stack-developer/)
