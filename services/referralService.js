// services/referralService.js
const usercollection = require('../models/userSchema'); 


const generateReferralCode = async () => {
    let code;
    let isUnique = false;
    
    while (!isUnique) {
        code = Math.random().toString(36).substring(2, 10).toUpperCase();
        const existingUser = await usercollection.findOne({ referralCode: code });
        if (!existingUser) isUnique = true;
    }
    
    return code;
};

const applyReferralBonus = async (referralCode, newUserEmail) => {
    try {
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
        
        if (referrer) {
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
        }
        return false;
    } catch (error) {
        console.error('Error applying referral bonus:', error);
        throw error;
    }
};

module.exports = {
    generateReferralCode,
    applyReferralBonus
};