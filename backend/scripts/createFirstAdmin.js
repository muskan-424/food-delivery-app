#!/usr/bin/env node

/**
 * Create First Admin Script
 * 
 * This script creates the first admin account for the system.
 * Use this only for initial setup when no admin exists.
 */

// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { validatePasswordStrength } from '../utils/authUtils.js';
import readline from 'readline';

// Simple user schema for admin creation (without encryption hooks)
const createAdminUser = async (userData) => {
  const db = mongoose.connection.db;
  const collection = db.collection('users');
  
  return await collection.insertOne({
    ...userData,
    createdAt: new Date(),
    updatedAt: new Date()
  });
};

const checkExistingAdmins = async () => {
  const db = mongoose.connection.db;
  const collection = db.collection('users');
  
  return await collection.countDocuments({ role: 'admin' });
};

const checkEmailExists = async (email) => {
  const db = mongoose.connection.db;
  const collection = db.collection('users');
  
  return await collection.findOne({ email: email.toLowerCase().trim() });
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const createFirstAdmin = async () => {
  try {
    console.log('🔧 First Admin Setup\n');

    // Connect to database
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');

    // Check if any admin already exists
    const existingAdminCount = await checkExistingAdmins();
    
    if (existingAdminCount > 0) {
      console.log(`❌ Admin accounts already exist (${existingAdminCount}/2)`);
      console.log('Use the admin panel to create additional admin accounts.\n');
      process.exit(1);
    }

    console.log('No admin accounts found. Let\'s create the first admin.\n');

    // Get admin details
    const name = await question('Enter admin name: ');
    if (!name.trim()) {
      console.log('❌ Name is required');
      process.exit(1);
    }

    const email = await question('Enter admin email: ');
    if (!email.trim()) {
      console.log('❌ Email is required');
      process.exit(1);
    }

    // Check if email already exists
    const existingUser = await checkEmailExists(email);
    if (existingUser) {
      console.log('❌ User with this email already exists');
      process.exit(1);
    }

    const password = await question('Enter admin password: ');
    if (!password) {
      console.log('❌ Password is required');
      process.exit(1);
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      console.log('❌ Password does not meet requirements:');
      passwordValidation.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
      process.exit(1);
    }

    // Confirm creation
    const confirm = await question(`\nCreate admin account for "${email}"? (y/N): `);
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Admin creation cancelled');
      process.exit(0);
    }

    // Hash password
    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create admin directly in database
    const adminData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone: '',
      profilePicture: '',
      role: 'admin',
      cartData: {},
      addresses: [],
      wishlist: [],
      isBlocked: false,
      warnings: 0,
      warningHistory: [],
      loginAttempts: 0,
      twoFactorEnabled: false,
      twoFactorBackupCodes: [],
      passwordResetRequired: false,
      passwordChangedAt: new Date(),
      activeSessions: [],
      anonymized: false,
      dataExportRequested: false,
      dataDeletionRequested: false,
      ipAddress: '127.0.0.1',
      userAgent: 'Admin Setup Script'
    };

    await createAdminUser(adminData);

    console.log('\n✅ First admin account created successfully!');
    console.log(`📧 Email: ${email}`);
    console.log(`👤 Name: ${name}`);
    console.log(`🔑 Role: admin`);
    console.log('\n🚀 You can now login to the admin panel and create up to 1 more admin account.');
    console.log('🌐 Admin Panel: http://localhost:5174\n');

  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
};

// Handle script termination
process.on('SIGINT', async () => {
  console.log('\n❌ Script interrupted');
  rl.close();
  await mongoose.disconnect();
  process.exit(0);
});

// Run the script
createFirstAdmin();