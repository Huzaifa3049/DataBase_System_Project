import express from 'express';
import pool from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import jwToken from '../utils/jwt-helpers.js';
import { send_and_generate_OTP, verifyOTP, storeSignupData, getSignupData } from '../utils/send_email.js'; 
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
            res.ok ? showMessage('Login successful! Token: ' + data.accessToken, 'success') : showMessage(data.message || 'Login failed', 'error');
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

router.post('/login' , async (req, res)=>{
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
        res.cookie('refreshToken', tokens.refreshToken, { httpOnly: true, secure: true, sameSite: 'Strict' });
        return res.status(200).json({ accessToken: tokens.Accesstoken });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Error during login' });
    }

})

function verify_email(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Step 1: Send OTP and store signup data
router.post('/signup-request', async (req, res) => {
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
        storeSignupData(email, { username, email, hashedPassword });
        
        // Send OTP
        const otpResult = await send_and_generate_OTP(email);
        
        if (otpResult.success) {
            return res.status(200).json({ message: 'OTP sent successfully' });
        } else {
            return res.status(500).json({ message: 'Failed to send OTP' });
        }
    } catch (error) {
        console.error('Error during signup request:', error);
        res.status(500).json({ message: 'Error during signup' });
    }
});

// Step 2: Verify OTP and create account
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    
    // Verify OTP
    const otpVerification = verifyOTP(email, otp);
    
    if (!otpVerification.success) {
        return res.status(400).json({ message: otpVerification.message });
    }
    
    // Get stored signup data
    const signupData = getSignupData(email);
    
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
        console.error('Error during OTP verification:', error);
        res.status(500).json({ message: 'Error creating account' });
    }
});

router.post('/login/forgot-password', async (req, res) => {
    const { email, username } = req.body; 
    const query_to_check_user = 'SELECT * FROM users WHERE email = $1 AND username = $2'; 
    try {
        const user = await pool.query(query_to_check_user, [email, username]);
        if(user.rows.length === 0){
            return res.status(404).json({ message: 'User not found' });
        }
        const otpResult = await send_and_generate_OTP(email); 
        if (otpResult.success) {
            storeSignupData(email, { username, email, isPasswordReset: true });
            return res.status(200).json({ message: 'OTP sent successfully' });
        } else {
            return res.status(500).json({ message: 'Failed to send OTP' });
        }   
    } catch (error) {
        console.error('Error during forgot password:', error);
        res.status(500).json({ message: 'Error during forgot password' });
    }
});

// Step 2: Verify OTP for password reset
router.post('/verify-reset-otp', async (req, res) => {
    const { email, otp } = req.body;
    
    // Verify OTP
    const otpVerification = verifyOTP(email, otp);
    
    if (!otpVerification.success) {
        return res.status(400).json({ message: otpVerification.message });
    }
    
    // Get stored password reset data
    const resetData = getSignupData(email);
    
    if (!resetData) {
        return res.status(400).json({ message: 'Password reset session expired. Please try again.' });
    }
    
    return res.status(200).json({ message: 'OTP verified successfully. You can now reset your password.' });
});

// Step 3: Reset password after OTP verification
router.post('/reset-password', async (req, res) => {
    const { email, newPassword, confirmPassword } = req.body;
    
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    try {
        // Check if user exists
        const userQuery = 'SELECT * FROM users WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Hash new password and update
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updateQuery = 'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, username, email';
        const updateResult = await pool.query(updateQuery, [hashedPassword, email]);
        
        return res.status(200).json({ 
            message: 'Password reset successfully',
            user: updateResult.rows[0]
        });
    } catch (error) {
        console.error('Error during password reset:', error);
        res.status(500).json({ message: 'Error during password reset' });
    }
});





export default router ;