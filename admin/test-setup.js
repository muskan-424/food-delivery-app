#!/usr/bin/env node

/**
 * Admin Setup Test Script
 * 
 * This script tests the admin configuration and identifies any issues
 * before starting the development server.
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 Testing Admin Configuration...\n');

// Test 1: Environment Variables
console.log('1. Checking Environment Variables:');
const envFiles = ['.env.local', '.env', '.env.example'];
let envFileFound = false;

envFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}: Found`);
    envFileFound = true;
  }
});

if (!envFileFound) {
  console.log('   ⚠️  No environment files found. Using defaults.');
} else {
  console.log('   ✅ Environment configuration available');
}

// Test 2: Package.json Dependencies
console.log('\n2. Checking Dependencies:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['react', 'react-dom', 'react-router-dom', 'axios', 'react-toastify'];
  
  let missingDeps = 0;
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
      console.log(`   ✅ ${dep}: ${packageJson.dependencies[dep]}`);
    } else {
      console.log(`   ❌ ${dep}: Missing`);
      missingDeps++;
    }
  });
  
  if (missingDeps === 0) {
    console.log('   ✅ All required dependencies are installed');
  } else {
    console.log(`   ⚠️  ${missingDeps} dependencies are missing`);
  }
} catch (error) {
  console.log('   ❌ Error reading package.json:', error.message);
}

// Test 3: Key Files Structure
console.log('\n3. Checking File Structure:');
const requiredFiles = [
  'src/App.jsx',
  'src/main.jsx',
  'src/context/StoreContext.jsx',
  'src/components/ErrorBoundary/ErrorBoundary.jsx',
  'src/components/SessionTimeout/SessionTimeout.jsx',
  'src/components/LoadingSpinner/LoadingSpinner.jsx',
  'src/utils/tokenUtils.js',
  'src/utils/currency.js',
  'src/utils/axiosConfig.js',
  'vite.config.js',
  'index.html'
];

let missingFiles = 0;
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}: Found`);
  } else {
    console.log(`   ❌ ${file}: Missing`);
    missingFiles++;
  }
});

if (missingFiles === 0) {
  console.log('   ✅ All required files are present');
} else {
  console.log(`   ⚠️  ${missingFiles} files are missing`);
}

// Test 4: Admin Pages Structure
console.log('\n4. Checking Admin Pages:');
const adminPages = [
  'src/pages/Dashboard/Dashboard.jsx',
  'src/pages/Add/Add.jsx',
  'src/pages/List/List.jsx',
  'src/pages/Orders/Orders.jsx',
  'src/pages/Reviews/Reviews.jsx',
  'src/pages/Payments/Payments.jsx',
  'src/pages/Offers/Offers.jsx',
  'src/pages/CustomerService/CustomerService.jsx',
  'src/pages/SupportAgents/SupportAgents.jsx',
  'src/pages/UserManagement/UserManagement.jsx',
  'src/pages/Profile/Profile.jsx',
  'src/pages/CreateAdmin/CreateAdmin.jsx'
];

let missingPages = 0;
adminPages.forEach(page => {
  if (fs.existsSync(page)) {
    console.log(`   ✅ ${page.split('/').pop()}: Found`);
  } else {
    console.log(`   ❌ ${page.split('/').pop()}: Missing`);
    missingPages++;
  }
});

if (missingPages === 0) {
  console.log('   ✅ All admin pages are present');
} else {
  console.log(`   ⚠️  ${missingPages} admin pages are missing`);
}

// Test 5: Vite Configuration
console.log('\n5. Checking Vite Configuration:');
try {
  const viteConfig = fs.readFileSync('vite.config.js', 'utf8');
  if (viteConfig.includes('defineConfig')) {
    console.log('   ✅ Vite config is properly structured');
  } else {
    console.log('   ⚠️  Vite config may have issues');
  }
  
  if (viteConfig.includes('proxy')) {
    console.log('   ✅ API proxy configuration found');
  } else {
    console.log('   ⚠️  No API proxy configuration');
  }
  
  if (viteConfig.includes('5174')) {
    console.log('   ✅ Admin port (5174) configured');
  } else {
    console.log('   ⚠️  Admin port not configured');
  }
} catch (error) {
  console.log('   ❌ Error reading vite.config.js:', error.message);
}

// Test 6: Node Modules
console.log('\n6. Checking Node Modules:');
if (fs.existsSync('node_modules')) {
  console.log('   ✅ node_modules directory exists');
  
  // Check if key packages are installed
  const keyPackages = ['react', 'vite', 'axios'];
  let installedPackages = 0;
  
  keyPackages.forEach(pkg => {
    if (fs.existsSync(`node_modules/${pkg}`)) {
      installedPackages++;
    }
  });
  
  if (installedPackages === keyPackages.length) {
    console.log('   ✅ Key packages are installed');
  } else {
    console.log('   ⚠️  Some packages may not be installed properly');
  }
} else {
  console.log('   ❌ node_modules not found. Run: npm install');
}

// Test 7: Assets
console.log('\n7. Checking Assets:');
if (fs.existsSync('src/assets')) {
  console.log('   ✅ Assets directory exists');
  
  const assetFiles = ['assets.js'];
  assetFiles.forEach(asset => {
    if (fs.existsSync(`src/assets/${asset}`)) {
      console.log(`   ✅ ${asset}: Found`);
    } else {
      console.log(`   ❌ ${asset}: Missing`);
    }
  });
} else {
  console.log('   ❌ Assets directory not found');
}

// Summary
console.log('\n📋 Summary:');
if (missingFiles === 0 && missingPages === 0 && fs.existsSync('node_modules')) {
  console.log('   ✅ Admin configuration looks good!');
  console.log('   🚀 You can start the admin panel with: npm run dev');
  console.log('   🌐 Admin panel will be available at: http://localhost:5174');
} else {
  console.log('   ⚠️  Please fix the issues above before starting the admin panel');
  if (!fs.existsSync('node_modules')) {
    console.log('   📦 Run: npm install');
  }
  if (missingFiles > 0) {
    console.log('   📝 Ensure all required files are present');
  }
  if (missingPages > 0) {
    console.log('   📄 Ensure all admin pages are present');
  }
}

console.log('\n🔧 Available commands:');
console.log('   npm run dev     - Start admin development server (port 5174)');
console.log('   npm run build   - Build admin for production');
console.log('   npm run preview - Preview admin production build');
console.log('   npm run lint    - Run ESLint\n');

console.log('🔗 Related services:');
console.log('   Backend API: http://localhost:4000');
console.log('   Frontend: http://localhost:5173');
console.log('   Admin Panel: http://localhost:5174\n');

process.exit(0);