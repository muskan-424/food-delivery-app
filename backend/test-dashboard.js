import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import http from 'http';
dotenv.config();

mongoose.connect(process.env.MONGO_URL).then(async () => {
    const db = mongoose.connection.db;
    const admin = await db.collection('users').findOne({ email: 'admin@example.com' });
    if (!admin) { console.log('Admin not found'); process.exit(1); }
    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET);

    const options = {
        hostname: 'localhost',
        port: 4000,
        path: '/api/admin/users/dashboard/stats',
        method: 'GET',
        headers: { token }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('Status Code:', res.statusCode);
            try {
                const parsed = JSON.parse(data);
                if (parsed.success) {
                    console.log('SUCCESS - Data keys:', Object.keys(parsed.data || {}));
                } else {
                    console.log('FAILED:', JSON.stringify(parsed, null, 2));
                }
            } catch {
                console.log('Raw response:', data.substring(0, 500));
            }
            process.exit(0);
        });
    });

    req.on('error', e => { console.log('Error:', e.message); process.exit(1); });
    req.end();
});
