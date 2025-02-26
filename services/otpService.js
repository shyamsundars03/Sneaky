const OTP = require("../models/otpSchema");

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString(); // Generates 6-digit OTP

const storeOtp = async (email, otpCode) => {
    await OTP.deleteMany({ email }); // Remove previous OTPs
    await OTP.create({ email, code: otpCode, expiresAt: Date.now() + 5 * 60 * 1000 }); // OTP expires in 5 min
};

const verifyOtp = async (email, otpCode) => {
    const otpEntry = await OTP.findOne({ email, code: otpCode });

    if (!otpEntry || otpEntry.expiresAt < Date.now()) return false;

    await OTP.deleteOne({ email, code: otpCode }); // Remove OTP after verification
    return true;
};

module.exports = { generateOtp, storeOtp, verifyOtp };
