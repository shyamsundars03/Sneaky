const express = require("express")
const app = express()
const env = require("dotenv") 
env.config();
const path = require("path")
const db = require("./config/db")
const session = require("express-session");
const userRouter = require("./routes/userRouter")
const adminRouter = require("./routes/adminRouter")
db()
const passport = require('passport'); 
require('./config/passport'); 


app.use(express.json());
app.use(express.urlencoded({extended: true})) 


app.set("view engine","ejs");
app.set("views",[path.join(__dirname,"views/user"),path.join(__dirname,"views/admin")]); 
app.use(express.static(path.join(__dirname, 'public')));


app.use(session({
    secret: process.env.SESSION_SECRET ,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());




app.use("/", userRouter);
app.use("/admin",adminRouter);








app.listen(process.env.PORT,()=>{
    console.log("server running")
})
module.exports = app;