import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// In-memory OTP storage (for production, use database or Redis)
const otpStorage = new Map();

// In-memory temp signup storage
const tempSignupStorage = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000);
}

async function send_and_generate_OTP(email) {
    const otp = generateOTP();
    
    // Store OTP
    otpStorage.set(email, otp);
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'OTP FOR SIGNUP', 
        text: `Your OTP for signup is: ${otp}`
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log('OTP email sent successfully');
        return { success: true, message: 'OTP sent to email' };
    } catch (error) {
        console.error('Error sending OTP email:', error);
        return { success: false, message: 'Failed to send OTP' };
    }
}

function verifyOTP(email, otp) {
    const storedOTP = otpStorage.get(email);
    
    if (!storedOTP) {
        return { success: false, message: 'OTP not found' };
    }
    
    if (storedOTP === parseInt(otp)) {
        otpStorage.delete(email);
        return { success: true, message: 'OTP verified successfully' };
    }
    
    return { success: false, message: 'Invalid OTP' };
}

// Store temp signup data
function storeSignupData(email, data) {
    tempSignupStorage.set(email, { ...data, storedAt: Date.now() });
    return { success: true };
}

// Retrieve and delete temp signup data
function getSignupData(email) {
    const data = tempSignupStorage.get(email);
    if (data) {
        tempSignupStorage.delete(email);
    }
    return data;
}

export { send_and_generate_OTP, verifyOTP, storeSignupData, getSignupData };

