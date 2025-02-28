const mongoose=require('mongoose')

const otpSchema=new mongoose.Schema({
    email:{
        required:true,
        type:String,
    },
    otp:{
        required:true,
        type:String
    },
    createdAt:{
        required:true,
        type:Date,
        default:Date.now()
    }

},
{
    timestamps:true
}
)

otpSchema.index({createdAt:1},{expireAfterSeconds:3600})

module.exports=mongoose.model('otp',otpSchema)