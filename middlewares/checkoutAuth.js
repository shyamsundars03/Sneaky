const checkoutAuth = (req, res, next) => {
    // If no checkout data in session, redirect to cart
    if (!req.session.checkoutData) {
        return res.redirect('/cart');
    }
    
    // Check if the user is trying to access a checkout step they haven't reached yet
    const currentStep = req.session.checkoutData.step || 0;
    
    // Extract the step number from the URL
    const urlPath = req.path;
    let requestedStep = 1;
    
    if (urlPath.includes('checkout2')) {
        requestedStep = 2;
    } else if (urlPath.includes('checkout3')) {
        requestedStep = 3;
    }
    
    // If trying to access a step ahead of current progress, redirect
    if (requestedStep > currentStep) {
        if (currentStep === 0) {
            return res.redirect('/cart');
        } else {
            return res.redirect(`/checkout${currentStep}`);
        }
    }
    
    next();
};

module.exports = checkoutAuth;