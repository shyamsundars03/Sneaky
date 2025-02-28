const mongoose = require("mongoose")


const {Schema}= mongoose;

const userSchema = new Schema({
    name:{
        type: String,
        // required: true
    },
    email:{
        type: String,
        required: true,
        // unique: true
    },
    phone:{
        type: String,
        // required: false,
        // unique: false,
        // sparse: true,
        default : null
    },
    password:{
        type: String,
        // required: false
    },    
    isActive:{
        type: Boolean,
        default: true,
    },

 },
 {
    timestamps:true
})
 
 
 
 
 const User = mongoose.model("User",userSchema);
 
 
 module.exports = User;