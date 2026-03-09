import bcrypt from "bcrypt";
import userModel from "../models/userModel.js";
import { connectDB } from "../config/db.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the backend directory (parent of scripts directory)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const createAdmin = async () => {
  try {
    // Check if MONGO_URL is set
    if (!process.env.MONGO_URL) {
      console.error("❌ Error: MONGO_URL is not set in .env file");
      console.error("   Please make sure you have a .env file in the backend directory");
      console.error("   with MONGO_URL=your_mongodb_connection_string");
      process.exit(1);
    }
    
    await connectDB();
    
    // Change these values as needed
    const email = "admin@example.com";
    const password = "admin123"; // ⚠️ CHANGE THIS PASSWORD!
    const name = "Admin User";
    
    // Check if admin already exists
    const existingAdmin = await userModel.findOne({ email });
    if (existingAdmin) {
      console.log("❌ Admin user already exists with email:", email);
      console.log("   If you want to reset the password, delete the user first or use a different email.");
      process.exit(1);
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(Number(process.env.SALT) || 10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create admin user
    const admin = new userModel({
      name,
      email,
      password: hashedPassword,
      role: "admin"
    });
    
    await admin.save();
    
    console.log("✅ Admin user created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📧 Email:    " + email);
    console.log("🔑 Password: " + password);
    console.log("👤 Role:     admin");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚠️  IMPORTANT: Change the password after first login!");
    console.log("⚠️  Update the email/password in this script if needed.");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
    process.exit(1);
  }
};

createAdmin();

