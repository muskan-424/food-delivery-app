#!/usr/bin/env node

/**
 * Reset a user's password by email (local dev / account recovery).
 *
 * Usage:
 *   node scripts/resetUserPassword.js --list
 *   node scripts/resetUserPassword.js --email user@example.com --password "NewPass1!"
 *   npm run reset-password -- --email user@example.com --password "NewPass1!"
 */

import dotenv from "dotenv";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import userModel from "../models/userModel.js";
import {
  validatePasswordStrength,
  revokeAllUserTokens,
} from "../utils/authUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function printHelp() {
  console.log(`
Reset user password (backend recovery tool)

Options:
  --list                 List registered users (email, name, role)
  --email <email>        User email to reset (required unless --list)
  --password <password>  New password (required unless --list)
  --help                 Show this help

Examples:
  npm run reset-password -- --list
  npm run reset-password -- --email admin@example.com --password "Admin123!"
  node scripts/resetUserPassword.js --email muskanmittal151@gmail.com --password "Muskan123!"
`);
}

function parseArgs(argv) {
  const args = { list: false, help: false, email: "", password: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") args.list = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--email") args.email = argv[++i] || "";
    else if (arg.startsWith("--email=")) args.email = arg.slice("--email=".length);
    else if (arg === "--password") args.password = argv[++i] || "";
    else if (arg.startsWith("--password=")) args.password = arg.slice("--password=".length);
  }
  return args;
}

async function listUsers() {
  const users = await userModel
    .find({})
    .select("name email role isBlocked createdAt")
    .sort({ createdAt: 1 })
    .lean();

  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  console.log(`\nRegistered users (${users.length}):\n`);
  console.log("Email".padEnd(36) + "Name".padEnd(18) + "Role".padEnd(8) + "Blocked");
  console.log("-".repeat(72));
  for (const u of users) {
    console.log(
      String(u.email || "").padEnd(36) +
        String(u.name || "").slice(0, 16).padEnd(18) +
        String(u.role || "user").padEnd(8) +
        (u.isBlocked ? "yes" : "no")
    );
  }
  console.log("\nPasswords are stored hashed and cannot be listed. Use --email + --password to set a new one.\n");
}

async function resetPassword(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    console.error("❌ Error: --email is required.");
    process.exit(1);
  }
  if (!password) {
    console.error("❌ Error: --password is required.");
    process.exit(1);
  }

  const validation = validatePasswordStrength(password);
  if (!validation.isValid) {
    console.error("❌ Password does not meet requirements:");
    validation.errors.forEach((e) => console.error("   • " + e));
    process.exit(1);
  }

  const user = await userModel.findOne({ email: normalizedEmail });
  if (!user) {
    console.error(`❌ No user found with email: ${normalizedEmail}`);
    console.error("   Run with --list to see registered emails.");
    process.exit(1);
  }

  const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
  user.password = await bcrypt.hash(password, salt);
  user.passwordChangedAt = new Date();
  user.loginAttempts = 0;
  user.lastLoginAttempt = null;
  user.accountLockedUntil = null;
  await user.save();

  await revokeAllUserTokens(user._id);

  console.log("\n✅ Password reset successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📧 Email:    " + user.email);
  console.log("👤 Name:     " + (user.name || "(none)"));
  console.log("🔑 Role:     " + (user.role || "user"));
  console.log("🔒 New pass: " + password);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("ℹ️  Active sessions were revoked; user must log in again.\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!process.env.MONGO_URL) {
    console.error("❌ MONGO_URL is not set in backend/.env");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URL);

    if (args.list) {
      await listUsers();
      process.exit(0);
    }

    if (!args.email || !args.password) {
      printHelp();
      console.error("❌ Provide --email and --password, or use --list.");
      process.exit(1);
    }

    await resetPassword(args.email, args.password);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main();
