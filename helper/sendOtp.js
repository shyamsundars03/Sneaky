
const transporter = require('..//services/otpSender');

let sendOtp = async (otp, email) => {

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USERNAME, 
            to: email,
            subject: 'Your OTP Code',
            text: `here is your OTP :${otp}`
        });
        console.log('OTP sent successfully!');
    } catch (err) {
        console.error('Failed to send OTP:', err.message);
        console.error('Error details:', err);
    } 
};

module.exports = sendOtp; 