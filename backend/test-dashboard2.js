import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URL);
const db = mongoose.connection.db;
const admin = await db.collection('users').findOne({ email: 'admin@example.com' });

const { getDashboardStats } = await import('./controllers/userManagementController.js');

const reqMock = { 
    body: { userId: String(admin._id) }, 
    query: {}, ip: '::1', 
    headers: {}, method: 'GET', 
    path: '/', url: '/', requestId: 'test-123' 
};

const resMock = {
    _code: 200,
    status(code) { this._code = code; return this; },
    json(data) { 
        process.stdout.write('STATUS:' + this._code + '\n');
        process.stdout.write('BODY:' + JSON.stringify(data) + '\n');
    },
    setHeader() { return this; }
};

const origConsoleError = console.error;
console.error = function(...args) {
    for (const a of args) {
        if (a instanceof Error) {
            process.stdout.write('ERROR_MSG:' + a.message + '\n');
            process.stdout.write('ERROR_STACK:' + (a.stack || '') + '\n');
        } else {
            process.stdout.write('LOG:' + String(a) + '\n');
        }
    }
};

await getDashboardStats(reqMock, resMock);
console.error = origConsoleError;
process.exit(0);
