# 🌸 Beautique

A modern beauty e-commerce demo built with **Node.js, Express 4, and EJS** — no database, no build step, no frontend framework. Everything is plain JavaScript, custom CSS, and JSON files.

## Features

**Storefront**
- Curated shop with search, category filters, and sorting
- Product pages with galleries, star ratings, verified-purchase reviews, and related products
- Slide-out shopping bag with quantity steppers, free-shipping progress bar, and persistent cart (localStorage)
- Checkout with delivery address, pay online / pay on delivery, and live totals
- Delivery address picker with an optional OpenStreetMap map (lazy-loaded Leaflet)

**Accounts**
- Sign up / sign in with email OTP verification (6-digit, 10-minute expiry)
- Passwords hashed with scrypt; sessions are random httpOnly tokens stored server-side
- Profile page with order history and one-click order cancellation
- Admin accounts require an invite code (`ADMIN_INVITE_CODE`)

**Admin dashboard** (`/admin`)
- Revenue / orders / inventory / customer stats
- Inline inventory editing, add & delete products
- Order management: mark shipped / delivered, cancel with restock
- Customer reviews and contact-form messages

**Email** (via [Resend](https://resend.com), optional)
- OTP codes, order confirmations, status updates, cancellations, review + contact notifications
- Without an API key the app runs in **dev mail mode**: emails are logged, and OTP codes appear directly in the UI so the demo always works

## Quick start

```bash
npm install
npm start        # or: npm run dev  (auto-restarts on changes)
```

Then open <http://localhost:3000>.

**Demo admin:** `admin@luna.com` / `admin123`

## Configuration

Copy `.env.example` to `.env` (all values optional):

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Enables real email delivery |
| `EMAIL_FROM` | From address for outgoing mail |
| `ADMIN_INVITE_CODE` | Code required to sign up as admin (default `BEAUTIQUE-ADMIN`) |
| `PORT` | Server port (default `3000`) |

## Project layout

```
app.js               Express app: middleware, security headers, error pages
bin/www              HTTP server bootstrap
lib/store.js         JSON-file data layer with atomic writes & migrations
lib/auth.js          Sessions, password hashing, auth middleware
lib/catalog.js       Product decoration (ratings, availability)
lib/emailService.js  Transactional email (Resend or dev mode)
routes/index.js      Page routes (server-rendered EJS)
routes/api.js        JSON API (auth, products, orders, reviews, contact)
views/               EJS templates + partials
public/              Custom design system CSS + vanilla JS modules
data/                JSON collections (users, products, orders, …)
```

Data lives in `data/*.json` and is created/migrated automatically on first run.
