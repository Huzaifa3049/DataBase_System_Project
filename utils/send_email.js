import { Resend } from 'resend';
import redis from '../redis.js';

const resend = new Resend(process.env.RESEND_API_KEY);

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000);
}

async function send_and_generate_OTP(email) {
    const otp = generateOTP();
    console.log(`[OTP] Generating OTP for ${email}`);

    await redis.set(`otp:${email}`, otp, 'EX', 300);
    console.log(`[OTP] Stored in Redis, calling Resend API...`);

    try {
        const sendPromise = resend.emails.send({
            from: 'Lumen <onboarding@resend.dev>',
            to: email,
            subject: 'Your Lumen verification code',
            text: `Your verification code is: ${otp}\n\nThis code expires in 5 minutes.`,
        });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Email timeout after 8s')), 8000));
        const result = await Promise.race([sendPromise, timeout]);
        console.log(`[OTP] Resend response:`, JSON.stringify(result));
        return { success: true, message: 'OTP sent to email' };
    } catch (error) {
        console.error(`[OTP] Failed:`, error.message);
        return { success: false, message: error.message || 'Failed to send OTP' };
    }
}

async function verifyOTP(email, otp) {
    const storedOTP = await redis.get(`otp:${email}`);

    if (!storedOTP) {
        return { success: false, message: 'OTP not found or expired' };
    }

    if (parseInt(storedOTP) === parseInt(otp)) {
        await redis.del(`otp:${email}`);
        return { success: true, message: 'OTP verified successfully' };
    }

    return { success: false, message: 'Invalid OTP' };
}

async function storeSignupData(email, data) {
    await redis.set(`signup:${email}`, JSON.stringify({ ...data, storedAt: Date.now() }), 'EX', 600);
    return { success: true };
}

async function getSignupData(email) {
    const raw = await redis.get(`signup:${email}`);
    if (raw) {
        await redis.del(`signup:${email}`);
        return JSON.parse(raw);
    }
    return null;
}

export { send_and_generate_OTP, verifyOTP, storeSignupData, getSignupData };
