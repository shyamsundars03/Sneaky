const mongoose = require("mongoose");
const {Schema}= mongoose;


const productSchema = new Schema({
    productName :{
        type : String,
        required : true
    }, 
    description :{
        type : String,
        required : true,
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required : true,
    },
    price:{
        type : Number,
        required : true,
    },
    offerPrice :{
        type : Number,
        default : 0,
    },
    quantity :{
        type: Number,
        default : 1
    },
    productImage:{
        type : [String],
        required : true
    },
    isblocked:{
        type: Boolean,
        default : false
    },
    status: {
        type: String,
        enum: ["Available", "Out of Stock", "Discontinued"], 
        required: true,
        default: "Available"
    }
    ,
},{timestamps:true})

const Product = mongoose.model("Product", productSchema);


module.exports = Product;








