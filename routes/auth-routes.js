import express from 'express';
import pool from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import jwToken from '../utils/jwt-helpers.js';
import { send_and_generate_OTP, verifyOTP, storeSignupData, getSignupData } from '../utils/send_email.js';
import authenticateToken from '../middleware/authorization.js';
import redis from '../redis.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'lumen-avatars',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 300, height: 300, crop: 'fill' }],
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});







const router = express.Router();
const HTML_LOGIN = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign In — Lumen</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Newsreader:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0c0b;--surface:#1a1714;--surface-2:#221d19;
  --border:#2e2a27;--border-bright:#3d3630;
  --text:#d4cdc7;--text-strong:#ece5df;--muted:#7a736d;--subtle:#5a534d;
  --accent:#e8845c;--accent-press:#d97249;--accent-soft:rgba(232,132,92,.10);
  --danger:#e05c5c;--success:#7fb069;
  --r:8px;--r-md:12px;--r-pill:999px;
  --ease:cubic-bezier(.4,0,.2,1);--dur:200ms;
  --shadow-md:0 8px 24px rgba(0,0,0,.35);--shadow-glow:0 8px 32px rgba(232,132,92,.2);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100vh;background:var(--bg);color:var(--text-strong);font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;padding:1.5rem}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:2.5rem 2rem;width:100%;max-width:420px;box-shadow:var(--shadow-md)}
.brand{display:flex;align-items:center;gap:.6rem;font-weight:700;font-size:1.05rem;margin-bottom:2rem;justify-content:center}
.brand-mark{width:30px;height:30px;border-radius:var(--r);background:var(--accent);display:grid;place-items:center;font-weight:800;font-size:.95rem;color:#fff}
h2{font-size:1.5rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.35rem;text-align:center}
.sub{font-size:.875rem;color:var(--muted);text-align:center;margin-bottom:1.75rem}
.field{margin-bottom:1.1rem}
.field label{display:block;font-size:.82rem;font-weight:600;color:var(--muted);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.06em}
.field input{width:100%;padding:.7rem 1rem;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);color:var(--text-strong);font-family:inherit;font-size:.95rem;transition:border-color var(--dur) var(--ease)}
.field input:focus{outline:none;border-color:var(--accent);background:var(--bg)}
.field input::placeholder{color:var(--subtle)}
.btn{width:100%;padding:.8rem;background:var(--accent);color:#fff;border:none;border-radius:var(--r-pill);font-family:inherit;font-size:.95rem;font-weight:600;cursor:pointer;transition:all var(--dur) var(--ease);margin-top:.5rem}
.btn:hover{background:var(--accent-press);transform:translateY(-1px);box-shadow:var(--shadow-glow)}
.btn:active{transform:translateY(0)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.msg{margin-top:1rem;padding:.7rem 1rem;border-radius:var(--r);font-size:.875rem;text-align:center;display:none}
.msg.success{background:rgba(127,176,105,.12);border:1px solid rgba(127,176,105,.3);color:#7fb069}
.msg.error{background:rgba(224,92,92,.10);border:1px solid rgba(224,92,92,.25);color:#e05c5c}
.links{display:flex;flex-direction:column;gap:.5rem;text-align:center;margin-top:1.25rem;font-size:.875rem;color:var(--muted)}
</style>
</head>
<body>
<div class="card">
  <div class="brand"><div class="brand-mark">L</div><span>Lumen</span></div>
  <h2>Welcome back</h2>
  <p class="sub">Sign in to your account</p>
  <form id="loginForm" onsubmit="handleLogin(event)">
    <div class="field"><label>Username</label><input type="text" id="loginUsername" placeholder="your_username" required autocomplete="username" /></div>
    <div class="field"><label>Password</label><input type="password" id="loginPassword" placeholder="••••••••" required autocomplete="current-password" /></div>
    <button class="btn" type="submit" id="loginBtn">Sign In</button>
  </form>
  <div class="msg" id="message"></div>
  <div class="links">
    <span>Don't have an account? <a href="/api/auth/signup">Create one</a></span>
    <a href="/api/auth/forgot-password">Forgot your password?</a>
  </div>
</div>
<script>
    function showMessage(text, type) {
        const el = document.getElementById('message');
        el.textContent = text;
        el.className = 'msg ' + type;
        el.style.display = text ? 'block' : 'none';
    }
    async function handleLogin(e) {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        btn.disabled = true; btn.textContent = 'Signing in…';
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        try {
            const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
            const data = await res.json();
            if (res.ok) {
                showMessage('Login successful! Redirecting...', 'success');
                setTimeout(() => { window.location.href = '/api/dashboard'; }, 1000);
            } else {
                showMessage(data.message || 'Login failed', 'error');
                btn.disabled = false; btn.textContent = 'Sign In';
            }
        } catch (err) { showMessage('Network error: ' + err.message, 'error'); btn.disabled = false; btn.textContent = 'Sign In'; }
    }
</script>
</body>
</html>`;

const HTML_SIGNUP = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Create Account — Lumen</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Newsreader:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0c0b;--surface:#1a1714;--surface-2:#221d19;
  --border:#2e2a27;--border-bright:#3d3630;
  --text:#d4cdc7;--text-strong:#ece5df;--muted:#7a736d;--subtle:#5a534d;
  --accent:#e8845c;--accent-press:#d97249;--accent-soft:rgba(232,132,92,.10);
  --danger:#e05c5c;--success:#7fb069;
  --r:8px;--r-md:12px;--r-pill:999px;
  --ease:cubic-bezier(.4,0,.2,1);--dur:200ms;
  --shadow-md:0 8px 24px rgba(0,0,0,.35);--shadow-glow:0 8px 32px rgba(232,132,92,.2);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100vh;background:var(--bg);color:var(--text-strong);font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;padding:1.5rem}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:2.5rem 2rem;width:100%;max-width:420px;box-shadow:var(--shadow-md)}
.brand{display:flex;align-items:center;gap:.6rem;font-weight:700;font-size:1.05rem;margin-bottom:2rem;justify-content:center}
.brand-mark{width:30px;height:30px;border-radius:var(--r);background:var(--accent);display:grid;place-items:center;font-weight:800;font-size:.95rem;color:#fff}
h2{font-size:1.5rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.35rem;text-align:center}
.sub{font-size:.875rem;color:var(--muted);text-align:center;margin-bottom:1.75rem}
.field{margin-bottom:1.1rem}
.field label{display:block;font-size:.82rem;font-weight:600;color:var(--muted);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.06em}
.field input{width:100%;padding:.7rem 1rem;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);color:var(--text-strong);font-family:inherit;font-size:.95rem;transition:border-color var(--dur) var(--ease)}
.field input:focus{outline:none;border-color:var(--accent);background:var(--bg)}
.field input::placeholder{color:var(--subtle)}
.btn{width:100%;padding:.8rem;background:var(--accent);color:#fff;border:none;border-radius:var(--r-pill);font-family:inherit;font-size:.95rem;font-weight:600;cursor:pointer;transition:all var(--dur) var(--ease);margin-top:.5rem}
.btn:hover{background:var(--accent-press);transform:translateY(-1px);box-shadow:var(--shadow-glow)}
.btn:active{transform:translateY(0)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.btn-ghost{background:transparent;border:1px solid var(--border-bright);color:var(--muted);margin-top:.5rem}
.btn-ghost:hover{background:var(--surface-2);color:var(--text-strong);transform:none;box-shadow:none}
.msg{margin-top:1rem;padding:.7rem 1rem;border-radius:var(--r);font-size:.875rem;text-align:center;display:none}
.msg.success{background:rgba(127,176,105,.12);border:1px solid rgba(127,176,105,.3);color:#7fb069}
.msg.error{background:rgba(224,92,92,.10);border:1px solid rgba(224,92,92,.25);color:#e05c5c}
.links{text-align:center;margin-top:1.25rem;font-size:.875rem;color:var(--muted)}
.step-dots{display:flex;justify-content:center;gap:.4rem;margin-bottom:1.75rem}
.dot{width:8px;height:8px;border-radius:50%;background:var(--border-bright);transition:background var(--dur) var(--ease)}
.dot.active{background:var(--accent)}
.otp-hint{font-size:.8rem;color:var(--muted);text-align:center;margin-bottom:1rem}
.hidden{display:none}
</style>
</head>
<body>
<div class="card">
  <div class="brand"><div class="brand-mark">L</div><span>Lumen</span></div>
  <div class="step-dots"><div class="dot active" id="dot1"></div><div class="dot" id="dot2"></div></div>

  <div id="signupStep1">
    <h2>Create account</h2>
    <p class="sub">Join Lumen and start writing</p>
    <form id="signupStep1Form" onsubmit="handleSignupStep1(event)">
      <div class="field"><label>Username</label><input type="text" id="signupUsername" placeholder="your_username" required autocomplete="username" /></div>
      <div class="field"><label>Email</label><input type="email" id="signupEmail" placeholder="you@example.com" required autocomplete="email" /></div>
      <div class="field"><label>Password</label><input type="password" id="signupPassword" placeholder="••••••••" required autocomplete="new-password" /></div>
      <div class="field"><label>Confirm Password</label><input type="password" id="signupConfirm" placeholder="••••••••" required autocomplete="new-password" /></div>
      <button class="btn" type="submit" id="step1Btn">Send OTP</button>
    </form>
    <div class="msg" id="messageStep1"></div>
    <div class="links">Already have an account? <a href="/api/auth/login">Sign in</a></div>
  </div>

  <div id="signupStep2" class="hidden">
    <h2>Verify email</h2>
    <p class="otp-hint">Enter the 6-digit code sent to your email</p>
    <form id="signupStep2Form" onsubmit="handleSignupStep2(event)">
      <div class="field"><label>OTP Code</label><input type="text" id="signupOTP" placeholder="000000" maxlength="6" required inputmode="numeric" pattern="[0-9]{6}" /></div>
      <button class="btn" type="submit" id="step2Btn">Verify & Create Account</button>
      <button class="btn btn-ghost" type="button" onclick="backToStep1(event)">← Back</button>
    </form>
    <div class="msg" id="messageStep2"></div>
  </div>
</div>
<script>
    let currentEmail = '';

    function showMessage(elementId, text, type) {
        const el = document.getElementById(elementId);
        el.textContent = text;
        el.className = 'msg ' + type;
        el.style.display = text ? 'block' : 'none';
    }

    function showStep(stepNumber) {
        document.getElementById('signupStep1').classList.toggle('hidden', stepNumber !== 1);
        document.getElementById('signupStep2').classList.toggle('hidden', stepNumber !== 2);
        document.getElementById('dot1').classList.toggle('active', stepNumber === 1);
        document.getElementById('dot2').classList.toggle('active', stepNumber === 2);
        if (stepNumber === 2) { document.getElementById('signupOTP').focus(); }
    }

    function backToStep1(e) {
        e.preventDefault();
        showStep(1);
        document.getElementById('signupStep1Form').reset();
        showMessage('messageStep1', '', '');
    }

    async function handleSignupStep1(e) {
        e.preventDefault();
        const btn = document.getElementById('step1Btn');
        btn.disabled = true; btn.textContent = 'Sending…';
        const username = document.getElementById('signupUsername').value.trim().toLowerCase();
        const email = document.getElementById('signupEmail').value.trim().toLowerCase();
        const password = document.getElementById('signupPassword').value;
        const confirm_password = document.getElementById('signupConfirm').value;
        try {
            const res = await fetch('/api/auth/signup-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, confirm_password })
            });
            const data = await res.json();
            if (res.ok) {
                currentEmail = email;
                showMessage('messageStep1', 'OTP sent! Check your email.', 'success');
                setTimeout(() => showStep(2), 1500);
            } else {
                showMessage('messageStep1', data.message || 'Error sending OTP', 'error');
                btn.disabled = false; btn.textContent = 'Send OTP';
            }
        } catch (err) {
            showMessage('messageStep1', 'Network error: ' + err.message, 'error');
            btn.disabled = false; btn.textContent = 'Send OTP';
        }
    }

    async function handleSignupStep2(e) {
        e.preventDefault();
        const btn = document.getElementById('step2Btn');
        btn.disabled = true; btn.textContent = 'Verifying…';
        const otp = document.getElementById('signupOTP').value;
        try {
            const res = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail, otp })
            });
            const data = await res.json();
            if (res.ok) {
                showMessage('messageStep2', 'Account created successfully! Redirecting…', 'success');
                setTimeout(() => { window.location.href = '/api/auth/login'; }, 2000);
            } else {
                showMessage('messageStep2', data.message || 'OTP verification failed', 'error');
                btn.disabled = false; btn.textContent = 'Verify & Create Account';
            }
        } catch (err) {
            showMessage('messageStep2', 'Network error: ' + err.message, 'error');
            btn.disabled = false; btn.textContent = 'Verify & Create Account';
        }
    }

    showStep(1);
</script>
</body>
</html>`;

const HTML_FORGOT_PASSWORD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset Password — Lumen</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Newsreader:ital,wght@1,400;1,500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0c0b;--surface:#1a1714;--surface-2:#221d19;
  --border:#2e2a27;--border-bright:#3d3630;
  --text:#d4cdc7;--text-strong:#ece5df;--muted:#7a736d;--subtle:#5a534d;
  --accent:#e8845c;--accent-press:#d97249;--accent-soft:rgba(232,132,92,.10);
  --danger:#e05c5c;--success:#7fb069;
  --r:8px;--r-md:12px;--r-pill:999px;
  --ease:cubic-bezier(.4,0,.2,1);--dur:200ms;
  --shadow-md:0 8px 24px rgba(0,0,0,.35);--shadow-glow:0 8px 32px rgba(232,132,92,.2);
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100vh;background:var(--bg);color:var(--text-strong);font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;padding:1.5rem}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:2.5rem 2rem;width:100%;max-width:420px;box-shadow:var(--shadow-md)}
.brand{display:flex;align-items:center;gap:.6rem;font-weight:700;font-size:1.05rem;margin-bottom:2rem;justify-content:center}
.brand-mark{width:30px;height:30px;border-radius:var(--r);background:var(--accent);display:grid;place-items:center;font-weight:800;font-size:.95rem;color:#fff}
h2{font-size:1.5rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.35rem;text-align:center}
.sub{font-size:.875rem;color:var(--muted);text-align:center;margin-bottom:1.75rem}
.field{margin-bottom:1.1rem}
.field label{display:block;font-size:.82rem;font-weight:600;color:var(--muted);margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.06em}
.field input{width:100%;padding:.7rem 1rem;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);color:var(--text-strong);font-family:inherit;font-size:.95rem;transition:border-color var(--dur) var(--ease)}
.field input:focus{outline:none;border-color:var(--accent);background:var(--bg)}
.field input::placeholder{color:var(--subtle)}
.btn{width:100%;padding:.8rem;background:var(--accent);color:#fff;border:none;border-radius:var(--r-pill);font-family:inherit;font-size:.95rem;font-weight:600;cursor:pointer;transition:all var(--dur) var(--ease);margin-top:.5rem}
.btn:hover{background:var(--accent-press);transform:translateY(-1px);box-shadow:var(--shadow-glow)}
.btn:active{transform:translateY(0)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.btn-ghost{background:transparent;border:1px solid var(--border-bright);color:var(--muted);margin-top:.5rem}
.btn-ghost:hover{background:var(--surface-2);color:var(--text-strong);transform:none;box-shadow:none}
.msg{margin-top:1rem;padding:.7rem 1rem;border-radius:var(--r);font-size:.875rem;text-align:center;display:none}
.msg.success{background:rgba(127,176,105,.12);border:1px solid rgba(127,176,105,.3);color:#7fb069}
.msg.error{background:rgba(224,92,92,.10);border:1px solid rgba(224,92,92,.25);color:#e05c5c}
.links{text-align:center;margin-top:1.25rem;font-size:.875rem;color:var(--muted)}
.step-dots{display:flex;justify-content:center;gap:.4rem;margin-bottom:1.75rem}
.dot{width:8px;height:8px;border-radius:50%;background:var(--border-bright);transition:background var(--dur) var(--ease)}
.dot.active{background:var(--accent)}
.hidden{display:none}
</style>
</head>
<body>
<div class="card">
  <div class="brand"><div class="brand-mark">L</div><span>Lumen</span></div>
  <div class="step-dots">
    <div class="dot active" id="dot1"></div>
    <div class="dot" id="dot2"></div>
    <div class="dot" id="dot3"></div>
  </div>

  <div id="resetStep1">
    <h2>Forgot password</h2>
    <p class="sub">Enter your email and username to receive a reset code</p>
    <form id="resetStep1Form" onsubmit="handleResetStep1(event)">
      <div class="field"><label>Email</label><input type="email" id="resetEmail" placeholder="you@example.com" required autocomplete="email" /></div>
      <div class="field"><label>Username</label><input type="text" id="resetUsername" placeholder="your_username" required autocomplete="username" /></div>
      <button class="btn" type="submit" id="r1Btn">Send OTP</button>
    </form>
    <div class="msg" id="messageStep1"></div>
    <div class="links"><a href="/api/auth/login">← Back to sign in</a></div>
  </div>

  <div id="resetStep2" class="hidden">
    <h2>Enter code</h2>
    <p class="sub">Check your email for the 6-digit code</p>
    <form id="resetStep2Form" onsubmit="handleResetStep2(event)">
      <div class="field"><label>OTP Code</label><input type="text" id="resetOTP" placeholder="000000" maxlength="6" required inputmode="numeric" pattern="[0-9]{6}" /></div>
      <button class="btn" type="submit" id="r2Btn">Verify Code</button>
      <button class="btn btn-ghost" type="button" onclick="backToStep1(event)">← Back</button>
    </form>
    <div class="msg" id="messageStep2"></div>
  </div>

  <div id="resetStep3" class="hidden">
    <h2>New password</h2>
    <p class="sub">Choose a strong password for your account</p>
    <form id="resetStep3Form" onsubmit="handleResetStep3(event)">
      <div class="field"><label>New Password</label><input type="password" id="resetNewPassword" placeholder="••••••••" required autocomplete="new-password" /></div>
      <div class="field"><label>Confirm Password</label><input type="password" id="resetConfirmPassword" placeholder="••••••••" required autocomplete="new-password" /></div>
      <button class="btn" type="submit" id="r3Btn">Reset Password</button>
    </form>
    <div class="msg" id="messageStep3"></div>
  </div>
</div>

<script>
    let resetEmail = '';

    function showMessage(elementId, text, type) {
        const el = document.getElementById(elementId);
        el.textContent = text;
        el.className = 'msg ' + type;
        el.style.display = text ? 'block' : 'none';
    }

    function showStep(stepNumber) {
        document.getElementById('resetStep1').classList.toggle('hidden', stepNumber !== 1);
        document.getElementById('resetStep2').classList.toggle('hidden', stepNumber !== 2);
        document.getElementById('resetStep3').classList.toggle('hidden', stepNumber !== 3);
        document.getElementById('dot1').classList.toggle('active', stepNumber === 1);
        document.getElementById('dot2').classList.toggle('active', stepNumber === 2);
        document.getElementById('dot3').classList.toggle('active', stepNumber === 3);
        if (stepNumber === 2) { document.getElementById('resetOTP').focus(); }
        else if (stepNumber === 3) { document.getElementById('resetNewPassword').focus(); }
    }

    function backToStep1(e) {
        e.preventDefault();
        showStep(1);
        document.getElementById('resetStep1Form').reset();
        showMessage('messageStep1', '', '');
    }

    async function handleResetStep1(e) {
        e.preventDefault();
        const btn = document.getElementById('r1Btn');
        btn.disabled = true; btn.textContent = 'Sending…';
        const email = document.getElementById('resetEmail').value.trim().toLowerCase();
        const username = document.getElementById('resetUsername').value.trim().toLowerCase();
        try {
            const res = await fetch('/api/auth/login/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username })
            });
            const data = await res.json();
            if (res.ok) {
                resetEmail = email;
                showMessage('messageStep1', 'OTP sent! Check your email.', 'success');
                setTimeout(() => showStep(2), 1500);
            } else {
                showMessage('messageStep1', data.message || 'Error sending OTP', 'error');
                btn.disabled = false; btn.textContent = 'Send OTP';
            }
        } catch (err) {
            showMessage('messageStep1', 'Network error: ' + err.message, 'error');
            btn.disabled = false; btn.textContent = 'Send OTP';
        }
    }

    async function handleResetStep2(e) {
        e.preventDefault();
        const btn = document.getElementById('r2Btn');
        btn.disabled = true; btn.textContent = 'Verifying…';
        const otp = document.getElementById('resetOTP').value;
        try {
            const res = await fetch('/api/auth/verify-reset-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail, otp })
            });
            const data = await res.json();
            if (res.ok) {
                showMessage('messageStep2', 'Code verified! Set your new password.', 'success');
                setTimeout(() => showStep(3), 1500);
            } else {
                showMessage('messageStep2', data.message || 'OTP verification failed', 'error');
                btn.disabled = false; btn.textContent = 'Verify Code';
            }
        } catch (err) {
            showMessage('messageStep2', 'Network error: ' + err.message, 'error');
            btn.disabled = false; btn.textContent = 'Verify Code';
        }
    }

    async function handleResetStep3(e) {
        e.preventDefault();
        const btn = document.getElementById('r3Btn');
        btn.disabled = true; btn.textContent = 'Resetting…';
        const newPassword = document.getElementById('resetNewPassword').value;
        const confirmPassword = document.getElementById('resetConfirmPassword').value;
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail, newPassword, confirmPassword })
            });
            const data = await res.json();
            if (res.ok) {
                showMessage('messageStep3', 'Password reset successfully! Redirecting…', 'success');
                setTimeout(() => { window.location.href = '/api/auth/login'; }, 2000);
            } else {
                showMessage('messageStep3', data.message || 'Password reset failed', 'error');
                btn.disabled = false; btn.textContent = 'Reset Password';
            }
        } catch (err) {
            showMessage('messageStep3', 'Network error: ' + err.message, 'error');
            btn.disabled = false; btn.textContent = 'Reset Password';
        }
    }

    showStep(1);
</script>
</body>
</html>`;

router.get('/login', (req, res) => res.send(HTML_LOGIN));
router.get('/signup', (req, res) => res.send(HTML_SIGNUP));
router.get('/forgot-password', (req, res) => res.send(HTML_FORGOT_PASSWORD));

router.post('/login', async (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (await checkRateLimit(`login:${ip}`, 5, 60)) {
        return res.status(429).json({ message: 'Too many login attempts. Try again in 1 minute.' });
    }

    let { username , password} = req.body;
    username = username.trim();
    username = username.toLowerCase();
    let querytext = 'SELECT * FROM users WHERE username = $1';
    try {
        const user = await pool.query(querytext, [username]);
        if(user.rows.length === 0){
            return res.status(404).json({ message: 'User not found' });
        }           
        const validpassword = await bcrypt.compare(password, user.rows[0].password);
        if (!validpassword){
            return res.status(401).json({ message: 'Invalid password' });
        }
        const tokens = jwToken.jwtToken(user.rows[0].id, user.rows[0].username);
        // Register the refresh token's jti in Redis — this is what rotation checks against.
        // Key: rt:{jti}  Value: userId  TTL: 7 days (matches token expiry)
        await redis.set(`rt:${tokens.jti}`, user.rows[0].id, 'EX', 7 * 24 * 60 * 60);
        res.cookie('accessToken', tokens.Accesstoken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 15 * 60 * 1000 });
        res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.status(200).json({ message: 'Logged in successfully' });
    } catch (error) {
        next(error);
    }

})

router.post('/refresh', async (req, res, next) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ message: 'No refresh token. Please log in.' });
    }

    // Step 1: Verify the JWT signature and expiry
    let payload;
    try {
        payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refresh_secret');
    } catch (err) {
        return res.status(403).json({ message: 'Invalid or expired refresh token. Please log in again.' });
    }

    const { id, username, jti } = payload;

    // Step 2: Check if this jti is still registered in Redis
    // If it's gone, one of two things happened:
    //   a) The user already logged out (jti was deleted on logout)
    //   b) This token was already used once and rotated — meaning someone is reusing an old token
    // Either way, the correct response is to force re-login
    const stored = await redis.get(`rt:${jti}`);
    if (!stored) {
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(401).json({ message: 'Session expired or reuse detected. Please log in again.' });
    }

    // Step 3: Rotate — destroy the old jti immediately so it can never be used again
    await redis.del(`rt:${jti}`);

    // Step 4: Issue brand new access + refresh tokens and register the new jti
    const newTokens = jwToken.jwtToken(id, username);
    await redis.set(`rt:${newTokens.jti}`, id, 'EX', 7 * 24 * 60 * 60);

    res.cookie('accessToken', newTokens.Accesstoken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', newTokens.refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.status(200).json({ message: 'Tokens refreshed successfully' });
});

function verify_email(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Step 1: Send OTP and store signup data
router.post('/signup-request', async (req, res, next) => {
    console.log('[SIGNUP] Request received', req.body?.email);
    const ip = req.ip || req.connection.remoteAddress;
    console.log('[SIGNUP] Checking rate limit for', ip);
    if (await checkRateLimit(`signup:${ip}`, 3, 60)) {
        return res.status(429).json({ message: 'Too many signup attempts. Try again in 1 minute.' });
    }
    console.log('[SIGNUP] Rate limit passed');

    let { username, email, password, confirm_password } = req.body;
    
    // Validate and normalize inputs
    username = username.trim().toLowerCase();
    email = email.trim().toLowerCase();
    
    if (!verify_email(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }
    
    if (password !== confirm_password) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    try {
        console.log('[SIGNUP] Querying DB for existing user');
        const querytext = 'SELECT * FROM users WHERE username = $1 OR email = $2';
        const result = await pool.query(querytext, [username, email]);
        console.log('[SIGNUP] DB query done, rows:', result.rows.length);
        
        if (result.rows.length > 0) {
            return res.status(400).json({ message: 'Username or email already exists' });
        }
        
        // Hash password and store signup data temporarily
        const hashedPassword = await bcrypt.hash(password, 10);
        await storeSignupData(email, { username, email, hashedPassword });

        // Send OTP
        const otpResult = await send_and_generate_OTP(email);
        
        if (otpResult.success) {
            return res.status(200).json({ message: 'OTP sent successfully' });
        } else {
            return res.status(500).json({ message: 'Failed to send OTP' });
        }
    } catch (error) {
        next(error);
    }
});

// Step 2: Verify OTP and create account
router.post('/verify-otp', async (req, res, next) => {
    const { email, otp } = req.body;
    
    // Verify OTP
    const otpVerification = await verifyOTP(email, otp);

    if (!otpVerification.success) {
        return res.status(400).json({ message: otpVerification.message });
    }

    // Get stored signup data
    const signupData = await getSignupData(email);
    
    if (!signupData) {
        return res.status(400).json({ message: 'Signup session expired. Please sign up again.' });
    }
    
    try {
        // Create user in database
        const insertQuery = 'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email, created_at';
        const values = [signupData.username, signupData.email, signupData.hashedPassword];
        
        const newuser = await pool.query(insertQuery, values);
        
        return res.status(201).json({
            message: 'Account created successfully',
            user: newuser.rows[0]
        });
    } catch (error) {
        next(error);
    }
});

router.post('/login/forgot-password', async (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (await checkRateLimit(`forgot:${ip}`, 3, 60)) {
        return res.status(429).json({ message: 'Too many attempts. Try again in 1 minute.' });
    }

    const { email, username } = req.body;
    const query_to_check_user = 'SELECT * FROM users WHERE email = $1 AND username = $2';
    try {
        const user = await pool.query(query_to_check_user, [email, username]);
        if(user.rows.length === 0){
            return res.status(404).json({ message: 'User not found' });
        }
        const otpResult = await send_and_generate_OTP(email);
        if (otpResult.success) {
            await storeSignupData(email, { username, email, isPasswordReset: true });
            return res.status(200).json({ message: 'OTP sent successfully' });
        } else {
            return res.status(500).json({ message: 'Failed to send OTP' });
        }   
    } catch (error) {
        next(error);
    }
});

// Step 2: Verify OTP for password reset
router.post('/verify-reset-otp', async (req, res, next) => {
    const { email, otp } = req.body;

    const otpVerification = await verifyOTP(email, otp);

    if (!otpVerification.success) {
        return res.status(400).json({ message: otpVerification.message });
    }

    const resetData = await getSignupData(email);

    if (!resetData) {
        return res.status(400).json({ message: 'Password reset session expired. Please try again.' });
    }

    // Proof that OTP was completed — /reset-password checks this before allowing the update
    await redis.set(`reset-verified:${email}`, '1', 'EX', 300);

    return res.status(200).json({ message: 'OTP verified successfully. You can now reset your password.' });
});

// Step 3: Reset password after OTP verification
router.post('/reset-password', async (req, res, next) => {
    const { email, newPassword, confirmPassword } = req.body;
    
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    const verified = await redis.get(`reset-verified:${email}`);
    if (!verified) {
        return res.status(403).json({ message: 'OTP not verified. Please complete the reset flow first.' });
    }

    try {
        // Check if user exists
        const userQuery = 'SELECT * FROM users WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updateQuery = 'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, username, email';
        const updateResult = await pool.query(updateQuery, [hashedPassword, email]);
        await redis.del(`reset-verified:${email}`);
        
        return res.status(200).json({ 
            message: 'Password reset successfully',
            user: updateResult.rows[0]
        });
    } catch (error) {
        next(error);
    }
});





// Get profile
router.get('/profile', authenticateToken, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, created_at, profile_picture FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ user: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

router.post('/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const url = req.file.path;
        await pool.query('UPDATE users SET profile_picture = $1 WHERE id = $2', [url, req.user.id]);
        res.json({ profile_picture: url });
    } catch (error) {
        next(error);
    }
});

router.get('/me', authenticateToken, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username });
});

// Update profile (username and/or email)
router.put('/profile', authenticateToken, async (req, res, next) => {
    let { username, email } = req.body;
    const userId = req.user.id;

    if (!username && !email) {
        return res.status(400).json({ message: 'Provide username or email to update' });
    }

    username = username?.trim().toLowerCase();
    email = email?.trim().toLowerCase();

    if (email && !verify_email(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }

    try {
        // Check for conflicts with other users
        const conflict = await pool.query(
            'SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3',
            [username, email, userId]
        );
        if (conflict.rows.length > 0) {
            return res.status(400).json({ message: 'Username or email already taken by another user' });
        }

        const current = await pool.query('SELECT username, email FROM users WHERE id = $1', [userId]);
        const updatedUsername = username || current.rows[0].username;
        const updatedEmail = email || current.rows[0].email;

        await pool.query(
            'UPDATE users SET username = $1, email = $2 WHERE id = $3',
            [updatedUsername, updatedEmail, userId]
        );

        res.status(200).json({ message: 'Profile updated successfully', user: { username: updatedUsername, email: updatedEmail } });
    } catch (error) {
        next(error);
    }
});

// Change password (requires current password)
router.post('/change-password', authenticateToken, async (req, res, next) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'New passwords do not match' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    try {
        const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
        const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password);

        if (!validPassword) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
});

// Logout — blacklist the access token, cleanly delete the refresh token's jti
router.get('/logout', async (req, res, next) => {
    const accessToken = req.cookies.accessToken;
    const refreshToken = req.cookies.refreshToken;

    // Access token: blacklist it for the remaining 15 minutes of its life
    // (it has no jti — blacklisting the full string is correct here)
    if (accessToken) {
        await redis.set(`blacklist:${accessToken}`, '1', 'EX', 15 * 60);
    }

    // Refresh token: just delete its jti from Redis — clean, no TTL juggling needed
    if (refreshToken) {
        try {
            const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refresh_secret');
            if (payload.jti) {
                await redis.del(`rt:${payload.jti}`);
            }
        } catch (err) {
            // Token already expired — nothing to clean up in Redis
        }
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.redirect('/api/auth/login');
});

export default router ;