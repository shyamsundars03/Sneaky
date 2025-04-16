const express = require("express")
const app = express()
const env = require("dotenv") 
env.config();
const path = require("path")
const morgan = require('morgan')
const db = require("./config/db")
const session = require("express-session");
const MongoStore = require("connect-mongo");
const userRouter = require("./routes/userRouter")
const adminRouter = require("./routes/adminRouter")
// const { checkPendingStockRestorations } = require('./middlewares/stockMiddleware');
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
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI + "SneakyDB",
        ttl: 2 * 24 * 60 * 60, 
    }),
    cookie: { secure: false }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
app.use(morgan('dev'))



app.use("/", userRouter);
app.use("/admin",adminRouter);

app.use((req, res, next) => {
    res.locals.user = req.session.user || null; 
    next();
});


app.use((req, res, next) => {
    res.status(404).render("page-404");
});

app.listen(process.env.PORT,()=>{
    console.log("server running")
})
module.exports = app;