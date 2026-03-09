# 📊 Food Delivery Project - Complete Flow Diagrams

This document provides comprehensive flow diagrams to understand the entire Food Delivery project architecture, user flows, and system interactions.

**Last Updated**: January 2025  
**Version**: 3.0.0

---

## 📋 Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [User Registration & Authentication Flow](#2-user-registration--authentication-flow)
3. [Food Browsing & Search Flow](#3-food-browsing--search-flow)
4. [Shopping Cart Flow](#4-shopping-cart-flow)
5. [Order Placement Flow (with Offers & Payments)](#5-order-placement-flow-with-offers--payments)
6. [Order Management Flow](#6-order-management-flow)
7. [Admin Panel Flow](#7-admin-panel-flow)
8. [Payment Flow (Multiple Payment Methods)](#8-payment-flow-multiple-payment-methods)
9. [Offers & Discounts Flow](#9-offers--discounts-flow)
10. [Review System Flow](#10-review-system-flow)
11. [Database Schema Flow](#11-database-schema-flow)
12. [API Request Flow](#12-api-request-flow)
13. [Complete User Journey](#13-complete-user-journey)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    FOOD DELIVERY SYSTEM                         │
│                    Version 3.0.0                                │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   FRONTEND   │      │    BACKEND   │      │   DATABASE   │
│   (React)    │◄────►│  (Express)   │◄────►│  (MongoDB)   │
│              │      │              │      │              │
│ Port: 5173   │      │ Port: 4000   │      │ Port: 27017  │
└──────────────┘      └──────────────┘      └──────────────┘
        │                     │
        │                     │
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ ADMIN PANEL  │      │  MIDDLEWARE  │
│   (React)    │      │              │
│              │      │ - Auth        │
│ Port: 5174   │      │ - Validation │
└──────────────┘      │ - Rate Limit │
                     │ - Idempotency │
                     └──────────────┘
```

### Key Components:
- **Frontend**: React-based user interface (Vite)
- **Admin Panel**: React-based admin interface (Vite)
- **Backend**: Express.js REST API
- **Database**: MongoDB (Atlas or Local)
- **Authentication**: JWT tokens
- **Payment**: Multiple methods (UPI, Cards, Wallets, Net Banking, COD)
- **Offers**: Comprehensive discount system
- **Reviews**: Sentiment analysis integration

---

## 2. User Registration & Authentication Flow

```
┌─────────────┐
│   USER      │
└──────┬──────┘
       │
       │ 1. Sign Up / Login
       ▼
┌─────────────────────────────────┐
│      SIGN UP / LOGIN FORM        │
│  - Name, Email, Password         │
│  - Phone (optional)              │
└──────┬──────────────────────────┘
       │
       │ 2. Submit Form
       ▼
┌─────────────────────────────────┐
│      BACKEND API                │
│  POST /api/user/signup          │
│  POST /api/user/login           │
│  Headers: {}                    │
│  Body: { name, email, password }│
└──────┬──────────────────────────┘
       │
       │ 3. Validate Input
       │ 4. Hash Password (bcrypt)
       │ 5. Check Database
       ▼
┌─────────────────────────────────┐
│         MONGODB                 │
│  userModel.create({             │
│    name, email,                 │
│    password: hashed,            │
│    role: 'user',                │
│    cartData: {},                │
│    addresses: [],               │
│    wishlist: []                 │
│  })                             │
└──────┬──────────────────────────┘
       │
       │ 6. Generate JWT Token
       │ 7. Return Token + User Data
       ▼
┌─────────────────────────────────┐
│      RESPONSE                   │
│  {                              │
│    success: true,               │
│    token: "jwt_token_here",    │
│    data: {                      │
│      userId, name, email, role  │
│    }                            │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 8. Store Token in localStorage
       │ 9. Redirect to Home
       ▼
┌─────────────────────────────────┐
│      HOME PAGE                  │
│  - User logged in               │
│  - Cart persisted               │
│  - Profile accessible           │
└─────────────────────────────────┘
```

### Authentication Flow:
```
User → Login → JWT Token → Stored in localStorage → 
Sent with every request → Verified by middleware → 
Access granted/denied
```

---

## 3. Food Browsing & Search Flow

```
┌─────────────┐
│   USER      │
└──────┬──────┘
       │
       │ 1. Browse / Search Food
       ▼
┌─────────────────────────────────┐
│      FOOD LIST PAGE             │
│  - Search bar                   │
│  - Category filters             │
│  - Price range slider           │
│  - Sort options                 │
│  - Food items grid              │
└──────┬──────────────────────────┘
       │
       │ 2. Apply Filters / Search
       ▼
┌─────────────────────────────────┐
│      BACKEND API                │
│  GET /api/food/list             │
│  Query: ?search=pizza&          │
│         category=fastfood&     │
│         minPrice=100&           │
│         maxPrice=500&           │
│         sort=price_asc&        │
│         page=1&limit=20         │
└──────┬──────────────────────────┘
       │
       │ 3. Query Database
       ▼
┌─────────────────────────────────┐
│         MONGODB                 │
│  foodModel.find({               │
│    name: /pizza/i,              │
│    category: 'fastfood',        │
│    price: { $gte: 100, $lte: 500 }│
│  })                             │
│  .sort({ price: 1 })            │
│  .limit(20).skip(0)            │
└──────┬──────────────────────────┘
       │
       │ 4. Return Filtered Results
       ▼
┌─────────────────────────────────┐
│      RESPONSE                   │
│  {                              │
│    success: true,               │
│    data: [foods...],            │
│    pagination: {                 │
│      page, limit, total,        │
│      totalPages                  │
│    }                            │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 5. Display Results
       ▼
┌─────────────────────────────────┐
│      FOOD ITEMS DISPLAYED       │
│  - With ratings                 │
│  - With reviews count          │
│  - Add to cart button           │
│  - Wishlist button              │
└─────────────────────────────────┘
```

---

## 4. Shopping Cart Flow

```
┌─────────────┐
│   USER      │
└──────┬──────┘
       │
       │ 1. Add to Cart
       ▼
┌─────────────────────────────────┐
│      ADD ITEM TO CART           │
│  - Click "Add to Cart"          │
│  - Select quantity              │
└──────┬──────────────────────────┘
       │
       │ 2. API Call
       ▼
┌─────────────────────────────────┐
│      BACKEND API                │
│  POST /api/cart/add             │
│  Headers: { token }             │
│  Body: { foodId, quantity }     │
└──────┬──────────────────────────┘
       │
       │ 3. Update User Cart
       ▼
┌─────────────────────────────────┐
│         MONGODB                 │
│  userModel.findByIdAndUpdate(  │
│    userId,                      │
│    {                            │
│      $set: {                    │
│        'cartData.foodId': {     │
│          name, price, quantity,│
│          image                  │
│        }                        │
│      }                          │
│    }                            │
│  )                              │
└──────┬──────────────────────────┘
       │
       │ 4. Return Updated Cart
       ▼
┌─────────────────────────────────┐
│      RESPONSE                   │
│  {                              │
│    success: true,               │
│    data: { cartData }           │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 5. Update Cart UI
       │ 6. Show Cart Count
       ▼
┌─────────────────────────────────┐
│      CART PAGE                  │
│  - List of items                │
│  - Quantity controls            │
│  - Total amount                 │
│  - Proceed to checkout          │
└─────────────────────────────────┘
```

---

## 5. Order Placement Flow (with Offers & Payments)

```
┌─────────────┐
│   USER      │
└──────┬──────┘
       │
       │ 1. Proceed to Checkout
       ▼
┌─────────────────────────────────┐
│    PLACE ORDER PAGE             │
│  - Cart items review            │
│  - Address selection            │
│  - Payment method selection     │
│  - Available offers display     │
└──────┬──────────────────────────┘
       │
       │ 2. Select/Enter Address
       │    - Use saved address OR
       │    - Enter new address
       │    - Email & country included
       ▼
┌─────────────────────────────────┐
│    ADDRESS MANAGEMENT          │
│  - Saved addresses (radio)      │
│  - Address Manager UI            │
│  - Auto-fill from saved          │
│  - Auto-save new addresses      │
└──────┬──────────────────────────┘
       │
       │ 3. Select Payment Method
       │    - UPI / Cards / Wallets│
       │    - Net Banking / COD     │
       ▼
┌─────────────────────────────────┐
│    PAYMENT METHOD SELECTION     │
│  - UPI: PhonePe, GPay, Paytm    │
│  - Cards: Credit/Debit          │
│  - Wallets: Paytm, PhonePe, etc.│
│  - Net Banking                  │
│  - Cash on Delivery             │
└──────┬──────────────────────────┘
       │
       │ 4. Calculate Offers
       │    - Free delivery check (₹150+)
       │    - Payment method discount
       │    - First order discount
       │    - Coupon code (if any)
       ▼
┌─────────────────────────────────┐
│    APPLY OFFERS                 │
│  - Check order amount            │
│  - Check payment method          │
│  - Check user order history      │
│  - Apply eligible offers         │
│  - Calculate final amount        │
└──────┬──────────────────────────┘
       │
       │ 5. Display Final Amount
       │    - Subtotal: ₹300
       │    - Delivery: ₹0 (free)
       │    - Discount: ₹20
       │    - Total: ₹280
       ▼
┌─────────────────────────────────┐
│    PLACE ORDER                  │
│  POST /api/order/place          │
│  Body: {                        │
│    items, amount, address,       │
│    paymentMethod,               │
│    paymentDetails,              │
│    couponCode                   │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 6. Create Order
       │ 7. Create Payment Record
       │ 8. Apply Offers
       │ 9. Auto-save Address
       ▼
┌─────────────────────────────────┐
│         MONGODB                 │
│  orderModel.create({            │
│    orderNumber,                  │
│    userId, items,               │
│    amount, deliveryFee,         │
│    discount,                    │
│    offersApplied: [{            │
│      offerId, title, type,       │
│      discount                    │
│    }],                          │
│    finalAmount,                 │
│    address: {                   │
│      firstName, lastName,        │
│      email, country, ...         │
│    },                           │
│    payment: {                   │
│      method, provider,           │
│      status: 'pending'           │
│    },                           │
│    status: 'pending'            │
│  })                             │
│                                 │
│  paymentModel.create({           │
│    orderId, orderNumber,        │
│    amount, paymentMethod,       │
│    status: 'pending'            │
│  })                             │
│                                 │
│  userModel.update({             │
│    $push: { addresses: {...} }  │
│  })                             │
└──────┬──────────────────────────┘
       │
       │ 10. Process Payment
       │     (if online)
       │ 11. Clear Cart
       │ 12. Return Success
       ▼
┌─────────────────────────────────┐
│      RESPONSE                   │
│  {                              │
│    success: true,               │
│    data: {                      │
│      order, orderId,            │
│      orderNumber                │
│    }                            │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 13. Show Success Toast
       │ 14. Redirect to My Orders
       ▼
┌─────────────────────────────────┐
│      MY ORDERS PAGE             │
│  - Order confirmation           │
│  - Order tracking               │
│  - Payment status               │
└─────────────────────────────────┘
```

---

## 6. Order Management Flow

```
┌─────────────┐
│   USER      │
└──────┬──────┘
       │
       │ 1. View My Orders
       ▼
┌─────────────────────────────────┐
│      MY ORDERS PAGE             │
│  - List of user orders          │
│  - Order status                 │
│  - Order details                │
│  - Cancel order (if allowed)    │
│  - Review items (if delivered)  │
└──────┬──────────────────────────┘
       │
       │ 2. API Call
       ▼
┌─────────────────────────────────┐
│      BACKEND API                │
│  POST /api/order/userorders     │
│  Headers: { token }              │
│  Query: ?page=1&limit=20        │
└──────┬──────────────────────────┘
       │
       │ 3. Query Database
       ▼
┌─────────────────────────────────┐
│         MONGODB                 │
│  orderModel.find({              │
│    userId: req.body.userId      │
│  })                             │
│  .sort({date: -1})              │
│  .limit(20).skip(0)            │
│  .populate('items.foodId')      │
└──────┬──────────────────────────┘
       │
       │ 4. Return Orders
       ▼
┌─────────────────────────────────┐
│      RESPONSE                   │
│  {                              │
│    success: true,               │
│    data: [orders...],          │
│    pagination: {...}            │
│  }                              │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│         ADMIN                   │
└──────┬──────────────────────────┘
       │
       │ 1. View All Orders
       ▼
┌─────────────────────────────────┐
│      ADMIN ORDERS PAGE         │
│  - All orders list              │
│  - Filter by status             │
│  - Update order status          │
│  - View payment details          │
└──────┬──────────────────────────┘
       │
       │ 2. Update Order Status
       ▼
┌─────────────────────────────────┐
│      BACKEND API                │
│  POST /api/order/status         │
│  Headers: { token }              │
│  Body: {                        │
│    orderId,                     │
│    status: 'preparing'          │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 3. Verify Admin Role
       │ 4. Update Order
       ▼
┌─────────────────────────────────┐
│         MONGODB                 │
│  orderModel.findByIdAndUpdate( │
│    orderId,                     │
│    {                            │
│      status: 'preparing',       │
│      $push: {                   │
│        statusHistory: {         │
│          status, timestamp      │
│        }                        │
│      }                          │
│    }                            │
│  )                              │
└─────────────────────────────────┘
```

### Order Status Flow:
```
pending → confirmed → preparing → ready → 
out_for_delivery → delivered
         │
         ▼
      cancelled (if allowed)
```

---

## 7. Admin Panel Flow

```
┌─────────────┐
│   ADMIN     │
└──────┬──────┘
       │
       │ 1. Login
       ▼
┌─────────────────────────────────┐
│      ADMIN LOGIN               │
│  - Email & Password            │
│  - Role: admin                  │
└──────┬──────────────────────────┘
       │
       │ 2. Authenticate
       │ 3. Verify Admin Role
       ▼
┌─────────────────────────────────┐
│      ADMIN DASHBOARD           │
│  - Statistics (clickable)       │
│  - Recent orders                │
│  - Revenue (INR)                │
│  - Quick actions                │
└──────┬──────────────────────────┘
       │
       │ 4. Navigate to Sections
       ▼
┌─────────────────────────────────┐
│      ADMIN SECTIONS             │
│  - Food Management              │
│  - Order Management             │
│  - Review Management            │
│  - Payment Management           │
│  - Offer Management             │
│  - Restaurant Management        │
│  - Profile                      │
└─────────────────────────────────┘
```

---

## 8. Payment Flow (Multiple Payment Methods)

```
┌─────────────┐
│   USER      │
└──────┬──────┘
       │
       │ 1. Place Order
       ▼
┌─────────────────────────────────┐
│    ORDER CREATION               │
│  - Items: [...]                 │
│  - Amount: ₹300                 │
│  - Delivery Fee: ₹0 (free above ₹150)│
│  - Discounts: Applied offers    │
│  - Total: ₹280                  │
│  - Payment Method: Selected     │
└──────┬──────────────────────────┘
       │
       │ 2. Calculate Offers
       │    - Free delivery check
       │    - Payment method discount
       │    - First order discount
       ▼
┌─────────────────────────────────┐
│    APPLY OFFERS                 │
│  - Free delivery: ₹0             │
│  - Payment discount: ₹20        │
│  - Applied offers: [...]         │
└──────┬──────────────────────────┘
       │
       │ 3. Create Order & Payment
       ▼
┌─────────────────────────────────┐
│      ORDER MODEL                │
│  {                              │
│    status: 'pending'|'confirmed',│
│    payment: {                   │
│      status: 'pending'|'processing',│
│      method: 'upi'|'card'|'wallet'|'cod',│
│      provider: 'PhonePe'|'GPay'|...│
│      paidAt: Date (if paid)     │
│    },                           │
│    offersApplied: [{            │
│      offerId, title, type, discount│
│    }]                           │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 4. Create Payment Record
       ▼
┌─────────────────────────────────┐
│    PAYMENT MODEL                │
│  {                              │
│    orderId, orderNumber,        │
│    amount, paymentMethod,       │
│    status: 'pending'|'processing'|'success',│
│    transactionId,               │
│    paymentDetails: {            │
│      provider,                  │
│      last4Digits (for cards),   │
│      walletName,                │
│      bankName                    │
│    }                            │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 5. Process Payment (if online)
       │    or Wait for COD
       ▼
┌─────────────────────────────────┐
│    PAYMENT PROCESSING          │
│  - UPI: Transaction ID saved     │
│  - Cards: Last 4 digits saved   │
│  - Wallets: Wallet name saved    │
│  - Net Banking: Bank name saved  │
│  - COD: Payment on delivery      │
│  - Status: 'success'|'failed'    │
└──────┬──────────────────────────┘
       │
       │ 6. Order Confirmed
       ▼
┌─────────────────────────────────┐
│    ORDER STATUS                 │
│  confirmed → preparing →       │
│  ready → out_for_delivery →      │
│  delivered                       │
└─────────────────────────────────┘
```

### Key Points:
- **Multiple Payment Methods**: UPI, Cards, Wallets, Net Banking, COD
- **Payment Tracking**: All payments tracked in database with full history
- **Payment Processing**: Online payments processed with transaction IDs
- **COD Method**: Payment collected on delivery
- **Offers Applied**: Automatic discount calculation before payment
- **Free Delivery**: Automatic above ₹150 (configurable)
- **Payment History**: Users can view all past payments
- **Admin Management**: Admins can view, filter, and manage all payments

---

## 9. Offers & Discounts Flow

```
┌─────────────┐
│   USER      │
└──────┬──────┘
       │
       │ 1. Proceed to Checkout
       ▼
┌─────────────────────────────────┐
│    CHECKOUT PAGE                │
│  - Order amount: ₹300           │
│  - Payment method: UPI           │
└──────┬──────────────────────────┘
       │
       │ 2. Calculate Applicable Offers
       ▼
┌─────────────────────────────────┐
│    OFFER CALCULATION            │
│  POST /api/offer/calculate      │
│  Body: {                        │
│    orderAmount: 300,            │
│    paymentMethod: 'upi',        │
│    userId: '...'                │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 3. Check Offer Eligibility
       │    - Free delivery (₹150+)
       │    - Payment method discount
       │    - First order discount
       │    - Coupon code (if any)
       ▼
┌─────────────────────────────────┐
│    OFFER ELIGIBILITY CHECK      │
│  - Order amount >= ₹150?         │
│    → Free delivery: YES          │
│  - Payment method = UPI?        │
│    → UPI discount: 10%           │
│  - First order?                  │
│    → First order discount: ₹50   │
│  - Valid coupon?                 │
│    → Coupon discount: 5%        │
└──────┬──────────────────────────┘
       │
       │ 4. Apply Offers (Priority)
       │    - Higher priority first
       │    - Calculate discounts
       ▼
┌─────────────────────────────────┐
│    APPLY OFFERS                 │
│  - Free delivery: ₹0             │
│  - UPI discount: ₹30 (10%)       │
│  - First order: ₹50              │
│  - Total discount: ₹80           │
│  - Final amount: ₹220             │
└──────┬──────────────────────────┘
       │
       │ 5. Display Applied Offers
       │ 6. Show Final Amount
       ▼
┌─────────────────────────────────┐
│    OFFER DISPLAY                │
│  ✅ Free Delivery Applied         │
│  ✅ 10% off on UPI                │
│  ✅ First Order Discount          │
│  Subtotal: ₹300                   │
│  Delivery: ₹0                    │
│  Discount: -₹80                   │
│  Total: ₹220                      │
└──────┬──────────────────────────┘
       │
       │ 7. Place Order with Offers
       ▼
┌─────────────────────────────────┐
│    ORDER CREATED                 │
│  - offersApplied: [...]          │
│  - deliveryFee: 0                │
│  - discount: 80                  │
│  - finalAmount: 220              │
└─────────────────────────────────┘
```

### Offer Types:
- **Payment Method Discounts**: UPI, Cards, Wallets, Net Banking
- **Free Delivery**: Above ₹150 (configurable)
- **First Order Discount**: For new users
- **Referral Bonus**: For referred users
- **Bulk Order Discount**: For large orders
- **Festival/Special Occasion**: Time-based offers
- **Loyalty Program**: For frequent users

---

## 10. Review System Flow

```
┌─────────────┐
│   USER      │
└──────┬──────┘
       │
       │ 1. Order Delivered
       ▼
┌─────────────────────────────────┐
│    MY ORDERS PAGE                │
│  - Order status: Delivered       │
│  - "Review Items" button         │
└──────┬──────────────────────────┘
       │
       │ 2. Click "Review Items"
       ▼
┌─────────────────────────────────┐
│    ORDER REVIEW MODAL            │
│  - List of all order items       │
│  - Review each item individually │
│  - Update existing reviews       │
└──────┬──────────────────────────┘
       │
       │ 3. Write/Update Review
       ▼
┌─────────────────────────────────┐
│    REVIEW MODAL                  │
│  - Rating: 1-5 stars             │
│  - Comment: Text input           │
│  - User info: Name, Avatar        │
└──────┬──────────────────────────┘
       │
       │ 4. Submit Review
       ▼
┌─────────────────────────────────┐
│      BACKEND API                │
│  POST /api/review                │
│  Body: {                        │
│    foodId, orderId,             │
│    rating, comment              │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 5. Perform Sentiment Analysis
       │ 6. Auto-approve if highly positive
       │ 7. Save Review
       ▼
┌─────────────────────────────────┐
│         MONGODB                 │
│  reviewModel.create({            │
│    userId, userName,            │
│    userAvatar,                   │
│    foodId, orderId,             │
│    rating, comment,              │
│    sentiment: {                  │
│      label: 'positive',          │
│      score: 4.5,                 │
│      confidence: 85              │
│    },                            │
│    status: 'approved'|'pending' │
│  })                              │
│                                 │
│  foodModel.update({             │
│    $inc: {                       │
│      totalRatings: 1,            │
│      totalRatingSum: rating      │
│    }                             │
│  })                              │
└──────┬──────────────────────────┘
       │
       │ 8. Return Review
       ▼
┌─────────────────────────────────┐
│      RESPONSE                   │
│  {                              │
│    success: true,               │
│    data: { review }             │
│  }                              │
└─────────────────────────────────┘
```

### Sentiment Analysis:
- Uses `sentiment` npm package
- Combines rating (60%) + text sentiment (40%)
- Confidence scoring (0-100%)
- Auto-approves highly positive reviews (5★ + >80% confidence)

---

## 11. Database Schema Flow

```
┌─────────────────────────────────────────────────────────┐
│                    MONGODB DATABASE                     │
└─────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   USERS     │      │    FOODS     │      │   ORDERS     │
│  Collection │      │  Collection │      │  Collection  │
└──────┬──────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       │ Fields:             │ Fields:             │ Fields:
       │ - _id               │ - _id               │ - _id
       │ - name              │ - name              │ - orderNumber
       │ - email             │ - description       │ - userId
       │ - password (hashed) │ - price             │ - items[]
       │ - phone             │ - image             │ - amount
       │ - profilePicture    │ - category          │ - deliveryFee
       │ - role              │ - rating            │ - discount
       │ - addresses[]       │ - totalRatings      │ - couponCode
       │ - wishlist[]        │ - restaurantId      │ - offersApplied[]
       │ - cartData          │ - isAvailable       │ - finalAmount
       │                     │                     │ - address {}
       │                     │                     │ - payment {}
       │                     │                     │ - status
       │                     │                     │ - statusHistory[]
       │                     │                     │
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ RESTAURANTS  │      │   REVIEWS    │      │   COUPONS    │      │   PAYMENTS   │
│  Collection  │      │  Collection  │      │  Collection  │      │  Collection  │
└──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
        │                     │                     │                     │
        ▼                     ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐
│   OFFERS     │      │ DELIVERY     │
│  Collection  │      │  Collection  │
└──────────────┘      └──────────────┘
```

### Relationships:
- **User** → **Orders** (One-to-Many)
- **User** → **Reviews** (One-to-Many)
- **User** → **Payments** (One-to-Many)
- **User** → **Addresses** (One-to-Many, embedded)
- **Food** → **Restaurant** (Many-to-One)
- **Food** → **Reviews** (One-to-Many)
- **Order** → **Food Items** (Many-to-Many via items array)
- **Order** → **Payment** (One-to-One)
- **Order** → **Offers** (Many-to-Many via offersApplied)
- **Order** → **Delivery Person** (Many-to-One)

---

## 12. API Request Flow

```
┌─────────────┐
│   CLIENT    │
│  (Frontend) │
└──────┬──────┘
       │
       │ 1. HTTP Request
       │    GET /api/food/list
       │    Headers: { token: "..." }
       ▼
┌─────────────────────────────────┐
│      EXPRESS SERVER              │
│  server.js                       │
└──────┬──────────────────────────┘
       │
       │ 2. Route Matching
       ▼
┌─────────────────────────────────┐
│      ROUTE HANDLER              │
│  /api/food/list                 │
└──────┬──────────────────────────┘
       │
       │ 3. Middleware Chain
       ▼
┌─────────────────────────────────┐
│      MIDDLEWARE                  │
│  - CORS                          │
│  - Helmet (Security)            │
│  - Rate Limiter                 │
│  - Auth Middleware (if protected)│
│  - Validation (if needed)        │
│  - Idempotency (if needed)      │
└──────┬──────────────────────────┘
       │
       │ 4. Controller
       ▼
┌─────────────────────────────────┐
│      CONTROLLER                  │
│  foodController.listFoods()     │
│  - Business logic                │
│  - Database queries              │
│  - Data processing               │
└──────┬──────────────────────────┘
       │
       │ 5. Database Query
       ▼
┌─────────────────────────────────┐
│         MONGODB                 │
│  foodModel.find({...})          │
└──────┬──────────────────────────┘
       │
       │ 6. Return Data
       ▼
┌─────────────────────────────────┐
│      RESPONSE                   │
│  {                              │
│    success: true,               │
│    data: [...]                 │
│  }                              │
└──────┬──────────────────────────┘
       │
       │ 7. Send to Client
       ▼
┌─────────────────────────────────┐
│      FRONTEND                   │
│  - Update UI                     │
│  - Display data                  │
└─────────────────────────────────┘
```

---

## 13. Complete User Journey

```
1. REGISTRATION
   │
   ▼
   ┌─────────────────┐
   │  Sign Up / Login │
   └────────┬─────────┘
            │
            ▼
2. BROWSE FOOD
   │
   ▼
   ┌─────────────────┐
   │  Search & Filter│
   │  - Text search   │
   │  - Category      │
   │  - Price range   │
   │  - Sort          │
   └────────┬─────────┘
            │
            ▼
3. ADD TO CART
   │
   ▼
   ┌─────────────────┐
   │  Cart Management│
   │  - Add items     │
   │  - Update qty    │
   │  - Remove items  │
   └────────┬─────────┘
            │
            ▼
4. CHECKOUT
   │
   ▼
   ┌─────────────────┐
   │  Place Order      │
   │  - Select address │
   │  - Payment method │
   │  - View offers    │
   │  - Apply coupon   │
   └────────┬─────────┘
            │
            ▼
5. PAYMENT
   │
   ▼
   ┌─────────────────┐
   │  Payment Process │
   │  - UPI/Card/etc. │
   │  - Payment record│
   │  - Order created │
   └────────┬─────────┘
            │
            ▼
6. ORDER TRACKING
   │
   ▼
   ┌─────────────────┐
   │  Track Order     │
   │  - Status updates│
   │  - Timeline      │
   │  - Cancel (if allowed)│
   └────────┬─────────┘
            │
            ▼
7. DELIVERY
   │
   ▼
   ┌─────────────────┐
   │  Order Delivered │
   │  - Payment (COD) │
   │  - Review items  │
   │  - Rate & Review │
   └─────────────────┘
```

---

## 🔑 Key Concepts

### Authentication Flow:
```
User → Login → JWT Token → Stored in localStorage → 
Sent with every request → Verified by middleware → 
Access granted/denied
```

### Order Status Flow:
```
pending → confirmed → preparing → ready → 
out_for_delivery → delivered
         │
         ▼
      cancelled (if allowed)
```

### Payment Flow (Multiple Methods):
```
Order Placed → 
Select Payment Method (UPI/Card/Wallet/Net Banking/COD) →
Create Payment Record →
Process Payment (if online) →
Payment Status: success/failed →
Order Confirmed →
(If COD: Payment Collected on Delivery)
```

### Offers & Discounts Flow:
```
Order Amount Calculated →
Check Free Delivery Threshold (₹150) →
Apply Payment Method Discounts →
Apply First Order Discount →
Apply Coupon (if provided) →
Calculate Final Amount →
Display Applied Offers →
Place Order
```

### Data Flow:
```
Frontend → API Request → Middleware → 
Controller → Database → Response → Frontend
```

---

## 📝 Notes

1. **JWT Tokens**: Stored in localStorage, sent with every authenticated request
2. **Cart Persistence**: Saved in database for logged-in users
3. **Order Status**: Automatically tracked with status history
4. **Payment**: Multiple methods (UPI, Cards, Wallets, Net Banking, COD) - all tracked internally
5. **Offers**: Automatic discount calculation, free delivery, payment method discounts
6. **Security**: Rate limiting, validation, authentication on all endpoints
7. **Pagination**: Applied to food lists and orders
8. **Search**: Full-text search in food names and descriptions
9. **Filtering**: Category, price range, and sorting options
10. **Profile**: User and admin profile customization
11. **Currency**: All prices in Indian Rupees (INR)

---

**Last Updated**: January 2025  
**Version**: 3.0.0  
**Status**: Complete flow diagrams with latest features

