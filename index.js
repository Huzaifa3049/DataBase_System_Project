import express from 'express';
import cookieParser from 'cookie-parser';
import pool from './db.js';
import router from './routes/auth-routes.js';
import dotenv from 'dotenv';
import blog_router from './routes/Blog-Writing.js';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware - must come BEFORE routes
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(helmet({
    contentSecurityPolicy: false  // inline scripts in server-rendered HTML — CSP needs nonces to work here
}));

app.use('/api/auth', router);
app.use('/api/blogs', blog_router);

// Serve the dashboard UI
app.get('/api/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Serve the blog writing UI
app.get('/api/blogs/create-ui', (req, res) => {
    res.sendFile(path.join(__dirname, 'create-blog.html'));
});

// Serve the feed UI
app.get('/api/blogs/feed-ui', (req, res) => {
    res.sendFile(path.join(__dirname, 'feed.html'));
});

// Serve the blog reader UI
app.get('/api/blogs/read-ui', (req, res) => {
    res.sendFile(path.join(__dirname, 'read-blog.html'));
});

// Serve the profile UI
app.get('/api/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});

// Serve the author page UI
app.get('/api/blogs/author-ui', (req, res) => {
    res.sendFile(path.join(__dirname, 'author.html'));
});

app.get('/', (req, res) => {
    res.send('Welcome to the database course project. Visit <a href="/api/auth/login">Login</a> or for signup <a href="/api/auth/signup">Signup</a>');
});

// Centralized error handler — any route that calls next(err) lands here.
// 4-parameter signature is how Express identifies error-handling middleware.
app.use((err, req, res, next) => {
    console.error(err.stack || err.message || err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});