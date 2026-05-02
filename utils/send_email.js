import { Resend } from 'resend';
import redis from '../redis.js';

const resend = new Resend(process.env.RESEND_API_KEY);

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000);
}

function redisSet(key, value, ttl) {
    return Promise.race([
        redis.set(key, value, 'EX', ttl),
        new Promise((_, r) => setTimeout(() => r(new Error('Redis timeout')), 3000))
    ]);
}

function redisGet(key) {
    return Promise.race([
        redis.get(key),
        new Promise((_, r) => setTimeout(() => r(new Error('Redis timeout')), 3000))
    ]);
}

function redisDel(key) {
    return Promise.race([
        redis.del(key),
        new Promise((_, r) => setTimeout(() => r(new Error('Redis timeout')), 3000))
    ]);
}

async function send_and_generate_OTP(email) {
    const otp = generateOTP();
    console.log(`[OTP] Generating OTP for ${email} — code: ${otp}`);

    try {
        await redisSet(`otp:${email}`, otp, 300);
        console.log(`[OTP] Stored in Redis`);
    } catch (err) {
        console.error(`[OTP] Redis store failed:`, err.message);
        return { success: false, message: 'Server error, try again' };
    }

    try {
        const sendPromise = resend.emails.send({
            from: 'Lumen <onboarding@resend.dev>',
            to: email,
            subject: 'Your Lumen verification code',
            text: `Your verification code is: ${otp}\n\nThis code expires in 5 minutes.`,
        });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Email timeout after 10s')), 10000));
        await Promise.race([sendPromise, timeout]);
        console.log(`[OTP] Email sent successfully to ${email}`);
        return { success: true, message: 'OTP sent to email' };
    } catch (error) {
        console.error(`[OTP] Email failed:`, error.message);
        return { success: false, message: error.message || 'Failed to send OTP' };
    }
}

async function verifyOTP(email, otp) {
    try {
        const storedOTP = await redisGet(`otp:${email}`);
        if (!storedOTP) return { success: false, message: 'OTP not found or expired' };
        if (parseInt(storedOTP) === parseInt(otp)) {
            await redisDel(`otp:${email}`).catch(() => {});
            return { success: true, message: 'OTP verified successfully' };
        }
        return { success: false, message: 'Invalid OTP' };
    } catch (err) {
        return { success: false, message: 'Server error verifying OTP' };
    }
}

async function storeSignupData(email, data) {
    try {
        await redisSet(`signup:${email}`, JSON.stringify({ ...data, storedAt: Date.now() }), 600);
    } catch (err) {
        console.error('[SIGNUP] Failed to store signup data:', err.message);
    }
    return { success: true };
}

async function getSignupData(email) {
    try {
        const raw = await redisGet(`signup:${email}`);
        if (raw) {
            await redisDel(`signup:${email}`).catch(() => {});
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error('[SIGNUP] Failed to get signup data:', err.message);
    }
    return null;
}

export { send_and_generate_OTP, verifyOTP, storeSignupData, getSignupData };
