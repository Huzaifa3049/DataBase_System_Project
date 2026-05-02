import express from 'express';
import cookieParser from 'cookie-parser';
import pool from './db.js';
import router from './routes/auth-routes.js';
import dotenv from 'dotenv';
import blog_router from './routes/Blog-Writing.js';
import follow_router from './routes/follow-routes.js';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware - must come BEFORE routes
app.use((req, res, next) => { console.log(`[REQ] ${req.method} ${req.path}`); next(); });
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGIN || true
        : 'http://localhost:3000',
    credentials: true
}));
app.use(helmet({
    contentSecurityPolicy: false  // inline scripts in server-rendered HTML — CSP needs nonces to work here
}));

// Local uploads served only in development (production uses Cloudinary)
if (process.env.NODE_ENV !== 'production') {
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}
app.use('/api/auth', router);
app.use('/api/blogs', blog_router);
app.use('/api/follow', follow_router);

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
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lumen — Where Ideas Find Light</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Newsreader:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0c0b;--surface:#1a1714;--surface-2:#221d19;
  --border:#2e2a27;--border-bright:#3d3630;
  --text:#d4cdc7;--text-strong:#ece5df;--muted:#7a736d;--subtle:#5a534d;
  --accent:#e8845c;--accent-press:#d97249;--accent-soft:rgba(232,132,92,.10);
  --r:8px;--r-md:12px;--r-pill:999px;
  --ease:cubic-bezier(.4,0,.2,1);--dur:200ms;
  --shadow-glow:0 8px 32px rgba(232,132,92,.2);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100vh;background:var(--bg);color:var(--text-strong);font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.nav{display:flex;align-items:center;justify-content:space-between;padding:1.25rem 2.5rem;border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:.6rem;font-weight:700;font-size:1.05rem}
.brand-mark{width:30px;height:30px;border-radius:var(--r);background:var(--accent);display:grid;place-items:center;font-weight:800;font-size:.95rem;color:#fff}
.nav-actions{display:flex;gap:.75rem;align-items:center}
.btn-ghost{padding:.55rem 1.2rem;border-radius:var(--r-pill);border:1px solid var(--border-bright);color:var(--muted);font-family:inherit;font-size:.875rem;font-weight:500;cursor:pointer;background:none;transition:all var(--dur) var(--ease)}
.btn-ghost:hover{color:var(--text-strong);background:var(--surface-2)}
.btn-accent{padding:.55rem 1.2rem;border-radius:var(--r-pill);background:var(--accent);color:#fff;font-family:inherit;font-size:.875rem;font-weight:600;cursor:pointer;border:none;transition:all var(--dur) var(--ease)}
.btn-accent:hover{background:var(--accent-press);transform:translateY(-1px);box-shadow:var(--shadow-glow)}
.hero{max-width:760px;margin:0 auto;padding:7rem 2rem 5rem;text-align:center}
.eyebrow{display:inline-block;font-size:.78rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:1.5rem;padding:.35rem .9rem;background:var(--accent-soft);border-radius:var(--r-pill);border:1px solid rgba(232,132,92,.2)}
.hero h1{font-size:clamp(2.4rem,6vw,4rem);font-weight:700;letter-spacing:-.03em;line-height:1.1;margin-bottom:1.5rem}
.hero h1 em{font-family:'Newsreader',serif;font-style:italic;color:var(--accent)}
.hero p{font-size:1.15rem;color:var(--muted);line-height:1.7;max-width:520px;margin:0 auto 2.5rem}
.cta-row{display:flex;justify-content:center;gap:.75rem;flex-wrap:wrap}
.cta-primary{padding:.85rem 2rem;border-radius:var(--r-pill);background:var(--accent);color:#fff;font-family:inherit;font-size:1rem;font-weight:600;cursor:pointer;border:none;transition:all var(--dur) var(--ease)}
.cta-primary:hover{background:var(--accent-press);transform:translateY(-2px);box-shadow:var(--shadow-glow)}
.cta-secondary{padding:.85rem 2rem;border-radius:var(--r-pill);border:1px solid var(--border-bright);color:var(--text);font-family:inherit;font-size:1rem;font-weight:500;cursor:pointer;background:none;transition:all var(--dur) var(--ease)}
.cta-secondary:hover{background:var(--surface-2);color:var(--text-strong)}
.features{max-width:900px;margin:0 auto;padding:3rem 2rem 6rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.25rem}
.feat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:1.75rem 1.5rem}
.feat-icon{font-size:1.5rem;margin-bottom:.85rem}
.feat h3{font-size:1rem;font-weight:600;margin-bottom:.4rem}
.feat p{font-size:.875rem;color:var(--muted);line-height:1.6}
.footer{border-top:1px solid var(--border);padding:1.5rem 2.5rem;text-align:center;font-size:.8rem;color:var(--subtle)}
</style>
</head>
<body>
<nav class="nav">
  <div class="brand"><div class="brand-mark">L</div><span>Lumen</span></div>
  <div class="nav-actions">
    <a href="/api/auth/login"><button class="btn-ghost">Sign In</button></a>
    <a href="/api/auth/signup"><button class="btn-accent">Get Started</button></a>
  </div>
</nav>
<section class="hero">
  <div class="eyebrow">A space for thoughtful writing</div>
  <h1>Where ideas <em>find light</em></h1>
  <p>Lumen is a platform for writers who care about craft. Publish stories, follow voices you love, and build a reading life that matters.</p>
  <div class="cta-row">
    <a href="/api/auth/signup"><button class="cta-primary">Start writing — it's free</button></a>
    <a href="/api/auth/login"><button class="cta-secondary">Sign in</button></a>
  </div>
</section>
<section class="features">
  <div class="feat"><div class="feat-icon">✍️</div><h3>Distraction-free editor</h3><p>Write in a clean, focused environment with auto-save drafts and version history.</p></div>
  <div class="feat"><div class="feat-icon">🔖</div><h3>Save &amp; organize</h3><p>Bookmark stories to read later. Your saved list, always in sync.</p></div>
  <div class="feat"><div class="feat-icon">👥</div><h3>Follow writers</h3><p>Subscribe to authors you love and never miss a new story in your feed.</p></div>
</section>
<footer class="footer">© ${new Date().getFullYear()} Lumen. Built for writers.</footer>
</body>
</html>`);
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