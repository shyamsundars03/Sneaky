const mongoose = require("mongoose")


const {Schema}= mongoose;

const userSchema = new Schema({
    name: {
        type: String,
    },
    email: {
        type: String,
        required: true,
        unique: true, 
    },
    phone: {
        type: String,
        default: null,
    },
    password: {
        type: String,
        default: null, 
    },
    profileImage: {
        type: String,
        default: null,
    },
    googleId: {
        type: String,
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});
 
 
 
 
 const User = mongoose.model("User",userSchema);
 
 
 module.exports = User;