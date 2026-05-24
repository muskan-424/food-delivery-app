import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URL).then(async () => {
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    const db = mongoose.connection.db;
    await db.collection('users').updateOne(
        { email: 'admin@example.com' },
        { $set: { password: hashedPassword } }
    );
    console.log('Password reset successfully');
    process.exit(0);
});
