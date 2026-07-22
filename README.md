# 🌸 Beautique

A modern beauty e-commerce demo built with **Node.js, Express 4, and EJS** — no build step, no frontend framework. Everything is plain JavaScript, custom CSS, and Postgres.

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
- Inline inventory editing, add / edit / delete products, with photo uploads (gallery + model photo)
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
| `DATABASE_URL` | **Required.** Postgres connection string — see [Database](#database) below. |
| `BLOB_READ_WRITE_TOKEN` | Image upload storage (admin dashboard). Leave blank locally (uploads save to `public/img/products/`). **Required on Vercel** for the same read-only-filesystem reason — add a Blob store from the Storage tab in your Vercel project and it injects this automatically. |
| `RESEND_API_KEY` | Enables real email delivery |
| `EMAIL_FROM` | From address for outgoing mail |
| `ADMIN_INVITE_CODE` | Code required to sign up as admin (default `BEAUTIQUE-ADMIN`) |
| `PORT` | Server port (default `3000`) |

## Project layout

```
app.js                Express app: middleware, security headers, error pages
bin/www               HTTP server bootstrap
db/migrations/         Versioned schema changes, applied by db/migrate.js
db/migrate.js          Migration runner (source of truth for the schema)
db/schema.sql          Full current-state snapshot of the schema, for reference
db/import.js           One-time script to load data/*.json into a fresh database
lib/db.js             Shared Postgres connection (Neon serverless driver)
lib/users.js          User accounts, discount codes
lib/products.js       Products, shades, reviews
lib/orders.js         Orders, order items
lib/categories.js     Shop categories
lib/sessions.js       Login sessions
lib/messages.js       Contact-form messages
lib/emailLog.js       Sent-email log
lib/auth.js           Sessions, password verification, auth middleware
lib/passwords.js      Password hashing (scrypt)
lib/catalog.js        Product decoration (ratings, availability)
lib/emailService.js   Transactional email (Resend or dev mode)
lib/uploads.js        Image uploads: local files locally, Vercel Blob on Vercel
routes/index.js       Page routes (server-rendered EJS)
routes/api.js         JSON API (auth, products, orders, reviews, contact)
views/                EJS templates + partials
public/               Custom design system CSS + vanilla JS modules
data/                 Bundled catalog data (products.json, categories.json) used by
                      the admin "sync catalog to database" action, and db/import.js
```

## Database

All app data lives in Postgres — see `db/schema.sql` for a full current-state snapshot of the table structure. To set up a fresh database:

1. Provision a Postgres database (e.g. Neon, or Vercel's Storage tab) and put its connection string in `.env` as `DATABASE_URL`.
2. Apply the schema: `node db/migrate.js`.
3. Optionally seed it from the bundled demo data: `node db/import.js` (only works against an empty database — it refuses to run if `orders` already has rows, since it truncates everything first).

### Migrations

`db/migrations/*.sql` is the source of truth for the schema, applied in filename order by `node db/migrate.js` — it's safe to run any time, since it tracks what's already applied (in a `schema_migrations` table) and only runs what's new. To change the schema:

1. Add a new file, e.g. `db/migrations/0002_add_something.sql`.
2. Run `node db/migrate.js` locally to apply and test it.
3. Update `db/schema.sql` to match the new end state (it's a snapshot for reference, not applied directly).
4. Deploy, then run `node db/migrate.js` again pointed at production to apply it there too.

For local development, use a separate Neon branch rather than testing directly against production — see your Neon project's **Branches** tab to create one, then point your local `.env` at its connection string instead.

`data/products.json` and `data/categories.json` stay in the repo on purpose — they're what the admin dashboard's "sync catalog to database" button pushes live, so editing them (or the whole catalog) can be deployed without touching the database directly.
