import { Resend } from 'resend';
import redis from '../redis.js';

const resend = new Resend(process.env.RESEND_API_KEY);

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000);
}

async function send_and_generate_OTP(email) {
    const otp = generateOTP();

    await redis.set(`otp:${email}`, otp, 'EX', 300);

    try {
        await resend.emails.send({
            from: 'Lumen <onboarding@resend.dev>',
            to: email,
            subject: 'Your Lumen verification code',
            text: `Your verification code is: ${otp}\n\nThis code expires in 5 minutes.`,
        });
        console.log('OTP email sent successfully to', email);
        return { success: true, message: 'OTP sent to email' };
    } catch (error) {
        console.error('Error sending OTP email:', error);
        return { success: false, message: 'Failed to send OTP' };
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
