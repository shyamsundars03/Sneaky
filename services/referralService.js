// services/referralService.js
const User = require('../models/userSchema');

const generateReferralCode = async () => {
    let code;
    let isUnique = false;
    
    while (!isUnique) {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const existingUser = await User.findOne({ referralCode: code });
        if (!existingUser) isUnique = true;
    }
    return code;
};

const applyReferralBonus = async (referralCode, newUserEmail) => {
    const referrer = await User.findOne({ referralCode });
    if (!referrer) return false;

    // Initialize wallet if doesn't exist
    if (!referrer.wallet) {
        referrer.wallet = {
            balance: 0,
            transactions: []
        };
    }

    // Update referrer
    referrer.wallet.balance += 50;
    referrer.wallet.transactions.push({
        type: 'referral',
        amount: 50,
        description: `Referral bonus for ${newUserEmail}`,
        date: new Date()
    });
    referrer.referralCount += 1;
    await referrer.save();
    
    return true;
};

module.exports = { generateReferralCode, applyReferralBonus };