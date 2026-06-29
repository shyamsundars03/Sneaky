# 👟 Sneaky — E-Commerce Shoe Store

A full-featured e-commerce web application for buying and selling shoes, built with Node.js, Express, MongoDB, and EJS.

---

## 🚀 Live Demo

> Deployed on Render: [https://sneaky.onrender.com](https://sneaky.onrender.com)

---

## 📌 Features

### 👤 User Side
- **Authentication** — Signup/Login with OTP verification via email, Google OAuth login
- **Forgot Password** — OTP-based password reset flow
- **Product Browsing** — Shop page with search, filter by category/size/price range, and sort options
- **Product Details** — Single product view with related products
- **Cart** — Add, update quantity, remove items with real-time stock validation
- **Wishlist** — Save products for later
- **Checkout** — Multi-step checkout with address selection and shipping
- **Payment Methods**
  - Cash on Delivery (COD) — orders below ₹7,000
  - Razorpay (UPI, cards, net banking)
  - Wallet balance
- **Coupon System** — Apply discount coupons at checkout
- **Order Management** — View orders, cancel orders, request returns
- **Invoice Download** — PDF invoice for each order
- **Wallet** — Top up via Razorpay, use balance for payments, transaction history
- **Referral System** — Earn wallet credits by referring friends
- **Profile Management** — Update name, email (OTP verified), change password
- **Address Book** — Add, edit, delete multiple delivery addresses

### 🛠️ Admin Side
- **Dashboard** — Sales overview and key metrics
- **User Management** — View, block/unblock users
- **Product Management** — Add, edit, soft-delete products with multiple images (Cloudinary)
- **Category Management** — Add, edit, list/unlist categories
- **Order Management** — View all orders, update order status, handle return requests
- **Coupon Management** — Create and manage discount coupons
- **Offer Management** — Create category-level offers with percentage discounts
- **Sales Report** — Filter by date range, export to Excel/PDF

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js |
| Templating | EJS |
| Database | MongoDB, Mongoose |
| Authentication | Session-based auth, Passport.js (Google OAuth) |
| Payments | Razorpay |
| File Uploads | Multer + Cloudinary |
| Email / OTP | Nodemailer (Gmail) |
| PDF Generation | PDFKit |
| Excel Export | ExcelJS |
| Session Store | connect-mongo |

---

## 📁 Project Structure

```
sneaky/
├── app.js                  # App entry point
├── config/
│   ├── db.js               # MongoDB connection
│   ├── cloudinary.js       # Cloudinary config
│   └── passport.js         # Google OAuth strategy
├── controllers/
│   ├── admin/              # Admin controllers
│   └── user/               # User controllers
├── middlewares/            # Auth, multer, stock checks
├── models/                 # Mongoose schemas
├── routes/                 # Express routers
├── views/
│   ├── admin/              # Admin EJS templates
│   └── user/               # User EJS templates
├── public/                 # Static assets (CSS, images)
├── helper/                 # OTP sender utility
└── fonts/                  # Fonts for PDF generation
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory with the following keys:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string

SESSION_SECRET=your_session_secret

ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_admin_password

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback

EMAIL_SERVICE=gmail
EMAIL_USERNAME=your_gmail_address
EMAIL_PASSWORD=your_gmail_app_password
OTP_EXPIRY=2

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

> **Note:** Never commit your `.env` file to GitHub. It's already in `.gitignore`.

---

## 🏃 Running Locally

```bash
# Clone the repository
git clone https://github.com/shyamsundars03/Sneaky.git
cd Sneaky

# Install dependencies
npm install

# Set up your .env file (see above)

# Start the development server
npm run dev
```

The app will run at `http://localhost:5000`

---

## ☁️ Deploying to Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Set the following:
   - **Build Command:** `npm install`
   - **Start Command:** `node app.js`
5. Add all environment variables from your `.env` (except `PORT`)
6. Update `GOOGLE_CALLBACK_URL` to your Render URL:
   ```
   https://your-app-name.onrender.com/auth/google/callback
   ```
7. In [MongoDB Atlas](https://cloud.mongodb.com) → Network Access → allow `0.0.0.0/0`
8. In [Google Cloud Console](https://console.cloud.google.com) → OAuth app → add your Render URL to Authorized Redirect URIs

---

## 📦 Scripts

```bash
npm start       # Start with nodemon (development)
node app.js     # Start without nodemon (production)
```

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## 📄 License

[ISC](https://opensource.org/licenses/ISC)
