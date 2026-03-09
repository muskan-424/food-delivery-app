#!/usr/bin/env node

/**
 * Frontend Setup Test Script
 * 
 * This script tests the frontend configuration and identifies any issues
 * before starting the development server.
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 Testing Frontend Configuration...\n');

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
  'src/utils/tokenUtils.js',
  'src/utils/currency.js',
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

// Test 4: Vite Configuration
console.log('\n4. Checking Vite Configuration:');
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
    console.log('   ⚠️  No API proxy configuration (may need manual API URL setup)');
  }
} catch (error) {
  console.log('   ❌ Error reading vite.config.js:', error.message);
}

// Test 5: Node Modules
console.log('\n5. Checking Node Modules:');
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

// Test 6: Build Configuration
console.log('\n6. Checking Build Configuration:');
try {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  if (indexHtml.includes('root')) {
    console.log('   ✅ index.html has root element');
  } else {
    console.log('   ⚠️  index.html may be missing root element');
  }
} catch (error) {
  console.log('   ❌ Error reading index.html:', error.message);
}

// Summary
console.log('\n📋 Summary:');
if (missingFiles === 0 && fs.existsSync('node_modules')) {
  console.log('   ✅ Frontend configuration looks good!');
  console.log('   🚀 You can start the development server with: npm run dev');
} else {
  console.log('   ⚠️  Please fix the issues above before starting the development server');
  if (!fs.existsSync('node_modules')) {
    console.log('   📦 Run: npm install');
  }
  if (missingFiles > 0) {
    console.log('   📝 Ensure all required files are present');
  }
}

console.log('\n🔧 Available commands:');
console.log('   npm run dev     - Start development server');
console.log('   npm run build   - Build for production');
console.log('   npm run preview - Preview production build');
console.log('   npm run lint    - Run ESLint\n');

process.exit(0);