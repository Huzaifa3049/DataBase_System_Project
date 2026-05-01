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
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
    destination: path.join(__dirname, '../uploads'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
    <title>Login</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h1 { margin-bottom: 1.5rem; color: #333; text-align: center; }
        .form-group { margin-bottom: 1rem; }
        label { display: block; margin-bottom: 0.4rem; font-size: 0.9rem; color: #555; }
        input { width: 100%; padding: 0.65rem 0.9rem; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; }
        input:focus { outline: none; border-color: #4a90e2; }
        button[type="submit"] { width: 100%; padding: 0.75rem; background: #4a90e2; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; margin-top: 0.5rem; }
        button[type="submit"]:hover { background: #357abd; }
        .message { margin-top: 1rem; padding: 0.75rem; border-radius: 6px; text-align: center; font-size: 0.9rem; display: none; }
        .message.success { background: #d4edda; color: #155724; }
        .message.error { background: #f8d7da; color: #721c24; }
        .link { text-align: center; margin-top: 1rem; }
        .link a { color: #4a90e2; text-decoration: none; }
        .link a:hover { text-decoration: underline; }
    </style>
</head>
<body>
<div class="container">
    <h1>Login</h1>
    <form id="loginForm" onsubmit="handleLogin(event)">
        <div class="form-group"><label>Username</label><input type="text" id="loginUsername" placeholder="Enter username" required /></div>
        <div class="form-group"><label>Password</label><input type="password" id="loginPassword" placeholder="Enter password" required /></div>
        <button type="submit">Login</button>
    </form>
    <div class="message" id="message"></div>
    <div class="link">Don't have an account? <a href="/api/auth/signup">Sign up here</a></div>
    <div class="link"><a href="/api/auth/forgot-password">Forgot password?</a></div>
</div>
<script>
    function showMessage(text, type) {
        const el = document.getElementById('message');
        el.textContent = text;
        el.className = 'message ' + type;
        el.style.display = text ? 'block' : 'none';
    }
    async function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        try {
            const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
            const data = await res.json();
            if (res.ok) {
                showMessage('Login successful! Redirecting...', 'success');
                // Wait 1 second before redirecting
                setTimeout(() => {
                    window.location.href = '/api/dashboard';
                }, 1000);
            } else {
                showMessage(data.message || 'Login failed', 'error');
            }
        } catch (err) { showMessage('Network error: ' + err.message, 'error'); }
    }
</script>
</body>
</html>`;

const HTML_SIGNUP = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign Up</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h1 { margin-bottom: 1.5rem; color: #333; text-align: center; }
        .form-group { margin-bottom: 1rem; }
        label { display: block; margin-bottom: 0.4rem; font-size: 0.9rem; color: #555; }
        input { width: 100%; padding: 0.65rem 0.9rem; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; }
        input:focus { outline: none; border-color: #4a90e2; }
        button[type="submit"] { width: 100%; padding: 0.75rem; background: #4a90e2; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; margin-top: 0.5rem; }
        button[type="submit"]:hover { background: #357abd; }
        .message { margin-top: 1rem; padding: 0.75rem; border-radius: 6px; text-align: center; font-size: 0.9rem; display: none; }
        .message.success { background: #d4edda; color: #155724; }
        .message.error { background: #f8d7da; color: #721c24; }
        .link { text-align: center; margin-top: 1rem; }
        .link a { color: #4a90e2; text-decoration: none; }
        .link a:hover { text-decoration: underline; }
        .hidden { display: none; }
        .step-info { font-size: 0.85rem; color: #888; margin-bottom: 1rem; text-align: center; }
    </style>
</head>
<body>
<div class="container">
    <div id="signupStep1" class="hidden">
        <h1>Sign Up - Step 1</h1>
        <div class="step-info">Enter your details to receive OTP</div>
        <form id="signupStep1Form" onsubmit="handleSignupStep1(event)">
            <div class="form-group"><label>Username</label><input type="text" id="signupUsername" placeholder="Enter username" required /></div>
            <div class="form-group"><label>Email</label><input type="email" id="signupEmail" placeholder="Enter email" required /></div>
            <div class="form-group"><label>Password</label><input type="password" id="signupPassword" placeholder="Enter password" required /></div>
            <div class="form-group"><label>Confirm Password</label><input type="password" id="signupConfirm" placeholder="Confirm password" required /></div>
            <button type="submit">Send OTP</button>
        </form>
        <div class="message" id="messageStep1"></div>
        <div class="link">Already have an account? <a href="/api/auth/login">Login here</a></div>
    </div>

    <div id="signupStep2">
        <h1>Sign Up - Step 2</h1>
        <div class="step-info">Enter the OTP sent to your email</div>
        <form id="signupStep2Form" onsubmit="handleSignupStep2(event)">
            <div class="form-group"><label>OTP (6 digits)</label><input type="text" id="signupOTP" placeholder="Enter OTP" maxlength="6" required /></div>
            <button type="submit">Verify & Create Account</button>
        </form>
        <div class="message" id="messageStep2"></div>
        <div class="link"><a href="#" onclick="backToStep1(event)">Back to Step 1</a></div>
    </div>
</div>
<script>
    let currentEmail = '';
    
    function showMessage(elementId, text, type) {
        const el = document.getElementById(elementId);
        el.textContent = text;
        el.className = 'message ' + type;
        el.style.display = text ? 'block' : 'none';
    }

    function showStep(stepNumber) {
        document.getElementById('signupStep1').classList.toggle('hidden', stepNumber !== 1);
        document.getElementById('signupStep2').classList.toggle('hidden', stepNumber !== 2);
        if (stepNumber === 2) {
            document.getElementById('signupOTP').focus();
        }
    }

    function backToStep1(e) {
        e.preventDefault();
        showStep(1);
        document.getElementById('signupStep1Form').reset();
        showMessage('messageStep1', '', '');
    }

    async function handleSignupStep1(e) {
        e.preventDefault();
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
            }
        } catch (err) {
            showMessage('messageStep1', 'Network error: ' + err.message, 'error');
        }
    }

    async function handleSignupStep2(e) {
        e.preventDefault();
        const otp = document.getElementById('signupOTP').value;

        try {
            const res = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: currentEmail, otp })
            });
            const data = await res.json();
            if (res.ok) {
                showMessage('messageStep2', 'Account created successfully!', 'success');
                setTimeout(() => { window.location.href = '/api/auth/login'; }, 2000);
            } else {
                showMessage('messageStep2', data.message || 'OTP verification failed', 'error');
            }
        } catch (err) {
            showMessage('messageStep2', 'Network error: ' + err.message, 'error');
        }
    }

    // Initial setup
    showStep(1);
</script>
</body>
</html>`;

const HTML_FORGOT_PASSWORD = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forgot Password</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h1 { margin-bottom: 1.5rem; color: #333; text-align: center; }
        .form-group { margin-bottom: 1rem; }
        label { display: block; margin-bottom: 0.4rem; font-size: 0.9rem; color: #555; }
        input { width: 100%; padding: 0.65rem 0.9rem; border: 1px solid #ccc; border-radius: 6px; font-size: 1rem; }
        input:focus { outline: none; border-color: #4a90e2; }
        button[type="submit"] { width: 100%; padding: 0.75rem; background: #4a90e2; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; margin-top: 0.5rem; }
        button[type="submit"]:hover { background: #357abd; }
        .message { margin-top: 1rem; padding: 0.75rem; border-radius: 6px; text-align: center; font-size: 0.9rem; display: none; }
        .message.success { background: #d4edda; color: #155724; }
        .message.error { background: #f8d7da; color: #721c24; }
        .link { text-align: center; margin-top: 1rem; }
        .link a { color: #4a90e2; text-decoration: none; }
        .link a:hover { text-decoration: underline; }
        .hidden { display: none; }
        .step-info { font-size: 0.85rem; color: #888; margin-bottom: 1rem; text-align: center; }
    </style>
</head>
<body>
<div class="container">
    <div id="resetStep1">
        <h1>Forgot Password</h1>
        <div class="step-info">Enter your email and username to receive OTP</div>
        <form id="resetStep1Form" onsubmit="handleResetStep1(event)">
            <div class="form-group"><label>Email</label><input type="email" id="resetEmail" placeholder="Enter your email" required /></div>
            <div class="form-group"><label>Username</label><input type="text" id="resetUsername" placeholder="Enter your username" required /></div>
            <button type="submit">Send OTP</button>
        </form>
        <div class="message" id="messageStep1"></div>
        <div class="link"><a href="/api/auth/login">Back to Login</a></div>
    </div>

    <div id="resetStep2" class="hidden">
        <h1>Verify OTP</h1>
        <div class="step-info">Enter the OTP sent to your email</div>
        <form id="resetStep2Form" onsubmit="handleResetStep2(event)">
            <div class="form-group"><label>OTP (6 digits)</label><input type="text" id="resetOTP" placeholder="Enter OTP" maxlength="6" required /></div>
            <button type="submit">Verify OTP</button>
        </form>
        <div class="message" id="messageStep2"></div>
        <div class="link"><a href="#" onclick="backToStep1(event)">Back to Step 1</a></div>
    </div>

    <div id="resetStep3" class="hidden">
        <h1>Reset Password</h1>
        <div class="step-info">Enter your new password</div>
        <form id="resetStep3Form" onsubmit="handleResetStep3(event)">
            <div class="form-group"><label>New Password</label><input type="password" id="resetNewPassword" placeholder="Enter new password" required /></div>
            <div class="form-group"><label>Confirm Password</label><input type="password" id="resetConfirmPassword" placeholder="Confirm password" required /></div>
            <button type="submit">Reset Password</button>
        </form>
        <div class="message" id="messageStep3"></div>
    </div>
</div>

<script>
    let resetEmail = '';
    
    function showMessage(elementId, text, type) {
        const el = document.getElementById(elementId);
        el.textContent = text;
        el.className = 'message ' + type;
        el.style.display = text ? 'block' : 'none';
    }

    function showStep(stepNumber) {
        document.getElementById('resetStep1').classList.toggle('hidden', stepNumber !== 1);
        document.getElementById('resetStep2').classList.toggle('hidden', stepNumber !== 2);
        document.getElementById('resetStep3').classList.toggle('hidden', stepNumber !== 3);
        if (stepNumber === 2) {
            document.getElementById('resetOTP').focus();
        } else if (stepNumber === 3) {
            document.getElementById('resetNewPassword').focus();
        }
    }

    function backToStep1(e) {
        e.preventDefault();
        showStep(1);
        document.getElementById('resetStep1Form').reset();
        showMessage('messageStep1', '', '');
    }

    async function handleResetStep1(e) {
        e.preventDefault();
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
            }
        } catch (err) {
            showMessage('messageStep1', 'Network error: ' + err.message, 'error');
        }
    }

    async function handleResetStep2(e) {
        e.preventDefault();
        const otp = document.getElementById('resetOTP').value;

        try {
            const res = await fetch('/api/auth/verify-reset-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail, otp })
            });
            const data = await res.json();
            if (res.ok) {
                showMessage('messageStep2', 'OTP verified! Now set your new password.', 'success');
                setTimeout(() => showStep(3), 1500);
            } else {
                showMessage('messageStep2', data.message || 'OTP verification failed', 'error');
            }
        } catch (err) {
            showMessage('messageStep2', 'Network error: ' + err.message, 'error');
        }
    }

    async function handleResetStep3(e) {
        e.preventDefault();
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
                showMessage('messageStep3', 'Password reset successfully! Redirecting to login...', 'success');
                setTimeout(() => { window.location.href = '/api/auth/login'; }, 2000);
            } else {
                showMessage('messageStep3', data.message || 'Password reset failed', 'error');
            }
        } catch (err) {
            showMessage('messageStep3', 'Network error: ' + err.message, 'error');
        }
    }

    // Initial setup
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
        res.cookie('accessToken', tokens.Accesstoken, { httpOnly: true, secure: false, sameSite: 'Strict', maxAge: 15 * 60 * 1000 });
        res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: false, sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
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

    res.cookie('accessToken', newTokens.Accesstoken, { httpOnly: true, secure: false, sameSite: 'Strict', maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', newTokens.refreshToken, { httpOnly: true, secure: false, sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.status(200).json({ message: 'Tokens refreshed successfully' });
});

function verify_email(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Step 1: Send OTP and store signup data
router.post('/signup-request', async (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (await checkRateLimit(`signup:${ip}`, 3, 60)) {
        return res.status(429).json({ message: 'Too many signup attempts. Try again in 1 minute.' });
    }

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
        // Check if user already exists
        const querytext = 'SELECT * FROM users WHERE username = $1 OR email = $2';
        const result = await pool.query(querytext, [username, email]);
        
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
        const url = `/uploads/${req.file.filename}`;
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