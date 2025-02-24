const mongoose = require("mongoose");
const {Schema}= mongoose;


const categorySchema = new mongoose.Schema({
    name:{
        type: String,
        required: true,
        unique: true
    },
    description :{
        type: String,
        required : true,
    },
    isListed :{
        type: Boolean,
        default: true,
    },
    stock:{
        type : Number,
        required : true,
    },
    availability:{
        type: String,
        enum: ["Available", "Out of Stock"], 
        required: true,
        default: "Available"
    },
    createdAt:{
        type : Date,
        default : Date.now
    }
})

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;















