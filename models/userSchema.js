const mongoose = require("mongoose")


const {Schema}= mongoose;

const userSchema = new Schema({
    firstName:{
        type: String,
        required: true
    },
    lastName:{
        type: String,
        required: true
    },
    email:{
        type: String,
        required: true,
        unique: true
    },
    phone:{
        type: String,
        required: false,
        unique: false,
        sparse: true,
        default : null
    },
    password:{
        type: String,
        required: false
    },    
    googleId:{
        type: String,
        unique: true
    },
    isBlocked:{
        type: Boolean,
        default: false,
    },
    createdOn : {
        type:Date,
        default:Date.now,
    },


  
 })
 
 
 
 
 const User = mongoose.model("User",userSchema);
 
 
 module.exports = User;