const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendOtp = async (email, otpCode) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your OTP Code",
            text: `Your OTP code is ${otpCode}. It is valid for 5 minutes.`,
        });
        console.log(`OTP sent to ${email}`);
    } catch (error) {
        console.error("Error sending OTP email:", error);
    }
};

module.exports = { sendOtp };
