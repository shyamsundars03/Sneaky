


const loadSignup = async (req, res) => {
    try {
        return res.render("signup")
    } catch (error) {
        console.log("homepage not found");
        res.status(500).send("server error")
    }
}


const loadSignin = async (req, res) => {
    try {
        return res.render("signin")
    } catch (error) {
        console.log("homepage not found");
        res.status(500).send("server error")
    }
}

const loadAbout = async (req, res) => {
    try {
        return res.render("about")
    } catch (error) {
        console.log("about page not found");
        res.status(500).send("server error")
    }
}


const loadShop = async (req, res) => {
    try {
        return res.render("shop")
    } catch (error) {
        console.log("about page not found");
        res.status(500).send("server error")
    }
}


const loadContact = async (req, res) => {
    try {
        return res.render("contact")
    } catch (error) {
        console.log("about page not found");
        res.status(500).send("server error")
    }
}





const pageNotFound =async (req,res) => {
    try {
        res.render("page-404")
    } catch (error) {
        res.redirect("/pageNotFound")
    }
}




const loadHomepage = async (req, res) => {
    try {
        return res.render("home")
    } catch (error) {
        console.log("homepage not found");
        res.status(500).send("server error")
    }
}
module.exports= {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadSignin,
    loadContact,
    loadShop,
    loadAbout
}