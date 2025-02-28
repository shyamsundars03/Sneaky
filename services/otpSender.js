const nodemailer=require('nodemailer')
console.log(process.env.EMAIL_USERNAME,process.env.EMAIL_PASSWORD)
const transpoter=  nodemailer.createTransport({
    service:'gmail',
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth:{
        user:process.env.EMAIL_USERNAME,
        pass:process.env.EMAIL_PASSWORD
    },
})

module.exports=transpoter