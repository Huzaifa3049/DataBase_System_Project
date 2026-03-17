import express from 'express';
import pool from './db.js';
import router from './routes/auth-routes.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware - must come BEFORE routes
app.use(express.json());

app.use('/api/auth', router);

app.get('/', (req, res) => {
    res.send('Welcome to the database course project. Visit <a href="/api/auth/login">Login</a> or for signup <a href="/api/auth/signup">Signup</a>');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});