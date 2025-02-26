const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const verifyGoogleToken = async (token) => {
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
        return ticket.getPayload();
    } catch (error) {
        console.error("Google token verification failed:", error);
        return null;
    }
};

module.exports = { verifyGoogleToken };
