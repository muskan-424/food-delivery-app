#!/usr/bin/env node

/**
 * Backend Setup Test Script
 * 
 * This script tests the backend configuration and identifies any issues
 * before starting the server.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

console.log('🔍 Testing Backend Configuration...\n');

// Test 1: Environment Variables
console.log('1. Checking Environment Variables:');
const requiredEnvVars = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET', 
  'MONGO_URL',
  'ENCRYPTION_KEY',
  'EMAIL_SERVICE',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  'FRONTEND_URL'
];

let envIssues = 0;
requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    console.log(`   ✅ ${varName}: Set`);
  } else {
    console.log(`   ❌ ${varName}: Missing`);
    envIssues++;
  }
});

if (envIssues > 0) {
  console.log(`\n   ⚠️  ${envIssues} environment variables are missing!`);
} else {
  console.log('\n   ✅ All environment variables are set');
}

// Test 2: Database Connection
console.log('\n2. Testing Database Connection:');
try {
  await mongoose.connect(process.env.MONGO_URL);
  console.log('   ✅ Database connection successful');
  await mongoose.disconnect();
} catch (error) {
  console.log('   ❌ Database connection failed:', error.message);
}

// Test 3: Encryption Key Validation
console.log('\n3. Validating Encryption Key:');
if (process.env.ENCRYPTION_KEY) {
  const key = process.env.ENCRYPTION_KEY;
  if (key.length === 64) {
    console.log('   ✅ Encryption key is valid (32 bytes hex)');
  } else if (key.length === 32) {
    console.log('   ✅ Encryption key is valid (32 bytes)');
  } else {
    console.log('   ⚠️  Encryption key length is not optimal (should be 32 bytes)');
  }
} else {
  console.log('   ❌ Encryption key is missing');
}

// Test 4: JWT Secrets Validation
console.log('\n4. Validating JWT Secrets:');
if (process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET) {
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    console.log('   ⚠️  JWT_SECRET and JWT_REFRESH_SECRET should be different');
  } else {
    console.log('   ✅ JWT secrets are properly configured');
  }
} else {
  console.log('   ❌ JWT secrets are missing');
}

// Test 5: Port Configuration
console.log('\n5. Checking Port Configuration:');
const port = process.env.PORT || 4000;
console.log(`   ✅ Server will run on port: ${port}`);

// Summary
console.log('\n📋 Summary:');
if (envIssues === 0) {
  console.log('   ✅ Backend configuration looks good!');
  console.log('   🚀 You can start the server with: npm run server');
} else {
  console.log('   ⚠️  Please fix the environment variable issues before starting the server');
  console.log('   📝 Update your .env file with the missing variables');
}

console.log('\n🔧 To start the server: npm run server');
console.log('📚 Check the documentation for more details\n');

process.exit(0);