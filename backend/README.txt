═══════════════════════════════════════════════════════════════
  Digital Sanskrit Guru — Backend Hostinger Deployment Package
═══════════════════════════════════════════════════════════════

WHAT'S INCLUDED
───────────────
  server.js              Main entry point
  package.json           All dependencies
  .env.example           Template — copy to .env and fill in values
  middleware/            Auth + admin middleware
  models/                MongoDB schemas (Product, Order, User, etc.)
  routes/                All API routes (auth, products, orders, etc.)
  utils/                 Helpers (cache, email, push, pricing, etc.)

HOSTINGER SETUP STEPS
─────────────────────
1. Upload all these files into your Hostinger Node.js app folder
   (the folder that contains your server entry file)

2. Create a .env file in the same folder as server.js:
   Copy .env.example → .env and fill in every value:

   PORT=5001
   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/digital_sanskrit_guru_v2
   JWT_SECRET=<64-char random string>
   RAZORPAY_KEY_ID=<your key>
   RAZORPAY_SECRET=<your secret>
   CORS_ORIGIN=https://your-site.hostingersite.com
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=<16-char Google App Password>
   VAPID_PUBLIC_KEY=<from web-push generate-vapid-keys>
   VAPID_PRIVATE_KEY=<from web-push generate-vapid-keys>

3. In Hostinger Node.js panel:
   - Startup file: server.js
   - Node version: 18 or higher recommended
   - Run: npm install  (in the SSH terminal)

4. Start the app via Hostinger panel or SSH:
   npm start

IMPORTANT NOTES
───────────────
• Do NOT upload node_modules — Hostinger installs them via npm install
• Do NOT upload the .env file — create it directly on the server
• MONGO_URI must be MongoDB Atlas (not localhost) — Hostinger cannot
  reach your local MongoDB
• Cluster mode activates automatically in production (NODE_ENV=production)
  using all available CPU cores

MONGODB ATLAS SETUP (if not done)
──────────────────────────────────
1. Go to https://cloud.mongodb.com → Create free M0 cluster
2. Create DB user with password
3. Whitelist IP: 0.0.0.0/0 (allow all — for Hostinger dynamic IPs)
4. Get connection string → replace in MONGO_URI

NEW FEATURES IN THIS VERSION
──────────────────────────────
• Cluster mode (uses all CPU cores in production)
• Gzip compression on all responses
• In-memory caching (products, settings — reduces DB load 10-100x)
• MongoDB indexes (fast queries on category, stock, rating, user orders)
• Email notifications (order, shipping, delivery, low stock)
• Web Push notifications (order updates, wishlist stock alerts)
• Wishlist with push notification on restock
• Marketing tools (email campaigns, push broadcasts)
• Rate limiting on auth endpoints (brute force protection)
• Input validation on register/login
• Razorpay payment integration with stock reservation

CORS_ORIGIN
───────────
Set CORS_ORIGIN to your exact Hostinger frontend URL, e.g.:
  CORS_ORIGIN=https://mediumpurple-clam-335465.hostingersite.com

Startup file: server.js
