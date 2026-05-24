import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
dotenv.config();

mongoose.connect(process.env.MONGO_URL).then(async () => {
    const db = mongoose.connection.db;
    const admin = await db.collection('users').findOne({ email: 'admin@example.com' });
    if (!admin) { console.log('Admin not found'); process.exit(1); }
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET);
    console.log('ADMIN_TOKEN=' + token);
    process.exit(0);
});
