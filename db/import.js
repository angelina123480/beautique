'use strict';

/* One-time import: reads data/*.json and inserts it into the Neon Postgres
   tables created by db/schema.sql. Safe to re-run — it truncates every
   table first, so a retry after a partial failure won't create duplicates. */

const fs = require('fs');
const path = require('path');

// Minimal .env loader (same approach as app.js) so DATABASE_URL is available
// without adding a dependency just for this one-off script.
require('fs').readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
  const i = line.indexOf('=');
  if (i === -1 || line.trim().startsWith('#')) return;
  const key = line.slice(0, i).trim();
  const val = line.slice(i + 1).trim();
  if (process.env[key] === undefined) process.env[key] = val;
});

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const dataDir = path.join(__dirname, '..', 'data');
function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

async function main() {
  console.log('Truncating existing tables...');
  await sql.query(`TRUNCATE categories, users, user_discount_codes, products,
    product_shades, product_reviews, orders, order_items, sessions,
    messages, email_log RESTART IDENTITY CASCADE`);

  const categories = readJson('categories.json');
  const users = readJson('users.json');
  const products = readJson('products.json');
  const orders = readJson('orders.json');
  const sessions = readJson('sessions.json');
  const messages = readJson('messages.json');
  const emailLog = readJson('email-log.json');

  console.log('Importing categories...');
  for (const c of categories) {
    await sql.query(
      `INSERT INTO categories (id, title, emoji, tone, text) VALUES ($1,$2,$3,$4,$5)`,
      [c.id, c.title, c.emoji || '', c.tone || 0, c.text || '']
    );
  }

  console.log('Importing users...');
  for (const u of users) {
    await sql.query(
      `INSERT INTO users (id, name, email, password, role, phone, address, otp,
         otp_expires, otp_verified, reset_otp, reset_otp_expires, google_id,
         reward_points, lifetime_points, redeemed_tiers, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        u.id, u.name, u.email.toLowerCase(), u.password || null, u.role || 'client',
        u.phone || '', u.address || '', u.otp || '', u.otpExpires || null,
        Boolean(u.otpVerified), u.resetOtp || '', u.resetOtpExpires || null, u.googleId || null,
        Number(u.rewardPoints) || 0, Number(u.lifetimePoints) || Number(u.rewardPoints) || 0,
        Array.isArray(u.redeemedTiers) ? u.redeemedTiers : [],
        u.createdAt || new Date().toISOString()
      ]
    );
    for (const code of (u.discountCodes || [])) {
      await sql.query(
        `INSERT INTO user_discount_codes (user_id, code, discount, tier, used_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [u.id, code.code, code.discount, code.tier, code.usedAt || null, code.createdAt || new Date().toISOString()]
      );
    }
  }

  console.log('Importing products...');
  for (const p of products) {
    await sql.query(
      `INSERT INTO products (id, name, brand, price, sale_price, badge, emoji, category,
         tone, description, stock, sold_out, images, model_image, scent_family, skin_goals, wink_map)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        p.id, p.name, p.brand || '', p.price || 0, p.salePrice || null, p.badge || '',
        p.emoji || '', p.category, p.tone || 0, p.description || '', p.stock || 0,
        Boolean(p.soldOut), p.images || [], p.modelImage || '',
        p.scentFamily || [], p.skinGoals || [], JSON.stringify(p.winkMap || {})
      ]
    );
    for (let i = 0; i < (p.shades || []).length; i++) {
      const s = p.shades[i];
      await sql.query(
        `INSERT INTO product_shades (product_id, name, label, color, images, tint_photos, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, s.name, s.label || s.name, s.color || '#d9a08b', s.images || [], Boolean(s.tintPhotos), i]
      );
    }
    for (const r of (p.reviews || [])) {
      await sql.query(
        `INSERT INTO product_reviews (id, product_id, user_id, user_name, rating, comment, verified, moderated_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [r.id || Date.now(), p.id, r.userId || null, r.userName || '', r.rating, r.comment || '',
          Boolean(r.verified), r.moderatedAt || null, r.createdAt || new Date().toISOString()]
      );
    }
  }

  console.log('Importing orders...');
  for (const o of orders) {
    await sql.query(
      `INSERT INTO orders (id, user_id, user_email, status, subtotal, discount, discount_code,
         shipping, total, points_earned, payment_method, address, hidden_from_user,
         cancelled_at, updated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        o.id, o.userId == null ? null : o.userId, o.userEmail || '', o.status || 'confirmed', o.subtotal || 0,
        o.discount || 0, o.discountCode || null, o.shipping || 0, o.total || 0,
        o.pointsEarned || 0, o.paymentMethod || 'online', o.address || '',
        Boolean(o.hiddenFromUser), o.cancelledAt || null, o.updatedAt || null,
        o.createdAt || new Date().toISOString()
      ]
    );
    for (const item of (o.items || [])) {
      await sql.query(
        `INSERT INTO order_items (order_id, product_id, name, quantity, price, shade)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [o.id, item.productId || null, item.name, item.quantity || 1, item.price || 0, item.shade || '']
      );
    }
  }

  console.log('Importing sessions...');
  for (const s of sessions) {
    await sql.query(
      `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)`,
      [s.token, s.userId, s.createdAt, s.expiresAt]
    );
  }

  console.log('Importing messages...');
  for (const m of messages) {
    await sql.query(
      `INSERT INTO messages (id, name, email, message, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [m.id, m.name, m.email, m.message, m.createdAt || new Date().toISOString()]
    );
  }

  console.log('Importing email log...');
  for (const e of emailLog) {
    await sql.query(
      `INSERT INTO email_log (id, type, to_email, subject, variant, delivered, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [e.id, e.type, e.to, e.subject || '', e.variant || '', Boolean(e.delivered), e.createdAt || new Date().toISOString()]
    );
  }

  console.log('Done. Imported:', {
    categories: categories.length, users: users.length, products: products.length,
    orders: orders.length, sessions: sessions.length, messages: messages.length, emailLog: emailLog.length
  });
}

main().catch((err) => {
  console.error('Import FAILED:', err.message);
  process.exit(1);
});
