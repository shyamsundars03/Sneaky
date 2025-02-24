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
        required : false,
        default : 0,
    },
    stock :{
        type: Number,
        default : 1
    },
    productImage:{
        type : [String],
        required : true
    },
    isDeleted:{
        type: Boolean,
        default : false
    },
    isListed:{
        type: Boolean,
        default : true
    },

},{timestamps:true})

const Product = mongoose.model("Product", productSchema);


module.exports = Product;








