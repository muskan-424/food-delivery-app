// MongoDB initialization script for Docker
db = db.getSiblingDB('food-delivery');

// Create collections with proper indexes
db.createCollection('users');
db.createCollection('foods');
db.createCollection('orders');
db.createCollection('reviews');
db.createCollection('restaurants');
db.createCollection('offers');
db.createCollection('payments');
db.createCollection('supporttickets');
db.createCollection('supportagents');
db.createCollection('coupons');
db.createCollection('deliveries');
db.createCollection('useractivity');
db.createCollection('refreshtokens');
db.createCollection('passwordresettokens');
db.createCollection('tokenblacklists');
db.createCollection('csrftokens');
db.createCollection('idempotencykeys');

// Create indexes for better performance
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "role": 1 });
db.users.createIndex({ "isBlocked": 1 });

db.foods.createIndex({ "name": 1 });
db.foods.createIndex({ "category": 1 });
db.foods.createIndex({ "restaurant": 1 });

db.orders.createIndex({ "userId": 1 });
db.orders.createIndex({ "status": 1 });
db.orders.createIndex({ "orderNumber": 1 }, { unique: true });
db.orders.createIndex({ "createdAt": -1 });

db.reviews.createIndex({ "foodId": 1 });
db.reviews.createIndex({ "userId": 1 });
db.reviews.createIndex({ "orderId": 1 });
db.reviews.createIndex({ "sentiment": 1 });

db.payments.createIndex({ "orderId": 1 });
db.payments.createIndex({ "transactionId": 1 }, { unique: true });
db.payments.createIndex({ "status": 1 });

db.offers.createIndex({ "code": 1 }, { unique: true });
db.offers.createIndex({ "isActive": 1 });
db.offers.createIndex({ "validFrom": 1, "validTo": 1 });

db.refreshtokens.createIndex({ "token": 1 }, { unique: true });
db.refreshtokens.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

db.passwordresettokens.createIndex({ "token": 1 }, { unique: true });
db.passwordresettokens.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

db.tokenblacklists.createIndex({ "token": 1 }, { unique: true });
db.tokenblacklists.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

db.csrftokens.createIndex({ "token": 1 }, { unique: true });
db.csrftokens.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

db.idempotencykeys.createIndex({ "key": 1 }, { unique: true });
db.idempotencykeys.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

print('Database initialized successfully with indexes');