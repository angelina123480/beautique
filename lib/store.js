'use strict';

/**
 * Data store — same read/write interface backed by two different engines:
 *
 *  - Local dev (no UPSTASH_REDIS_REST_URL/TOKEN set): flat JSON files in /data.
 *    Writes go through a temp file + rename so a crash mid-write can't corrupt
 *    a collection.
 *  - Production on Vercel: Upstash Redis. Vercel's deployed filesystem is
 *    read-only and nothing written to it survives between invocations, so the
 *    JSON-file approach silently fails there — every collection is instead
 *    stored as a single Redis key holding the whole array, mirroring the file
 *    shape exactly.
 *
 * Everything above this module (routes, auth, catalog) just calls
 * read(name)/write(name, data) and doesn't know or care which engine is live.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');

const FILES = {
  users: 'users.json',
  products: 'products.json',
  orders: 'orders.json',
  sessions: 'sessions.json',
  messages: 'messages.json',
  emailLog: 'email-log.json'
};

function filePath(name) {
  if (!FILES[name]) {
    throw new Error('Unknown collection: ' + name);
  }
  return path.join(dataDir, FILES[name]);
}

/* ------------------------------------------------------------------ *
 * Redis backend (production / Vercel — via Upstash)
 * ------------------------------------------------------------------ */

let redisClient = null;

/* Vercel's Upstash integration doesn't always use the same env var names —
   newer setups use UPSTASH_REDIS_REST_URL/TOKEN, but the Vercel Marketplace
   "KV"-flavored integration exposes KV_REST_API_URL/TOKEN instead. Accept
   either so this works regardless of which naming the integration picked. */
function redisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
}

function redisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
}

function useRedis() {
  return Boolean(redisUrl() && redisToken());
}

function getRedis() {
  if (!redisClient) {
    const { Redis } = require('@upstash/redis');
    redisClient = new Redis({
      url: redisUrl(),
      token: redisToken()
    });
  }
  return redisClient;
}

/* ------------------------------------------------------------------ *
 * Collection read/write
 * ------------------------------------------------------------------ */

async function read(name) {
  if (!FILES[name]) {
    throw new Error('Unknown collection: ' + name);
  }
  if (useRedis()) {
    const data = await getRedis().get(name);
    return data || [];
  }
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function write(name, data) {
  if (!FILES[name]) {
    throw new Error('Unknown collection: ' + name);
  }
  if (useRedis()) {
    await getRedis().set(name, data);
    return;
  }
  const target = filePath(name);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, target);
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

/* ------------------------------------------------------------------ *
 * Passwords (scrypt — no external dependency needed)
 * ------------------------------------------------------------------ */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return 'scrypt:' + salt + ':' + hash;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt:')) {
    return false;
  }
  const parts = stored.split(':');
  const expected = Buffer.from(parts[2], 'hex');
  const candidate = crypto.scryptSync(String(password), parts[1], 64);
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

/* ------------------------------------------------------------------ *
 * Seed data
 * ------------------------------------------------------------------ */

const SEED_PRODUCTS = [
  { id: 1, name: 'Velvet Satin Lip', brand: 'Luna', price: 24, badge: 'Bestseller', emoji: '💄', category: 'makeup', tone: 340, description: 'A soft matte finish with lasting comfort.', stock: 12, soldOut: false, images: [], modelImage: '', reviews: [], shades: [{ name: 'Rose Nude', label: 'Rose Nude', color: '#c98374' }, { name: 'Berry', label: 'Berry', color: '#8c3a4f' }, { name: 'Cocoa', label: 'Cocoa', color: '#6b4029' }] },
  { id: 2, name: 'Glow Serum', brand: 'Aura', price: 39, badge: 'New', emoji: '✨', category: 'skincare', tone: 35, description: 'A dewy serum that brightens and hydrates.', stock: 8, soldOut: false, images: [], modelImage: '', reviews: [] },
  { id: 3, name: 'Lash Lift Mascara', brand: 'Nova', price: 22, badge: 'Top Rated', emoji: '👁️', category: 'makeup', tone: 265, description: 'Builds length and drama without clumping.', stock: 15, soldOut: false, images: [], modelImage: '', reviews: [], shades: [{ name: 'Black', label: 'Black', color: '#1a1a1a' }, { name: 'Deep Brown', label: 'Deep Brown', color: '#3b2419' }] },
  { id: 4, name: 'Dawn Blush', brand: 'Luna', price: 28, badge: 'Trending', emoji: '🌸', category: 'makeup', tone: 350, description: 'A rosy flush for a healthy glow.', stock: 10, soldOut: false, images: [], modelImage: '', reviews: [], shades: [{ name: 'Peony', label: 'Peony', color: '#e8a3ab' }, { name: 'Rosewood', label: 'Rosewood', color: '#b5646b' }] },
  { id: 5, name: 'Hydra Cream', brand: 'Aura', price: 34, badge: 'Editor Pick', emoji: '🫧', category: 'skincare', tone: 195, description: 'A rich cream that locks in hydration.', stock: 6, soldOut: false, images: [], modelImage: '', reviews: [] },
  { id: 6, name: 'Velvet Eau De Parfum', brand: 'Nova', price: 46, badge: 'Limited', emoji: '🌼', category: 'fragrance', tone: 45, description: 'A soft floral scent designed for everyday elegance.', stock: 5, soldOut: false, images: [], modelImage: '', reviews: [] }
];

const CATEGORIES = [
  { id: 'makeup', title: 'Makeup', emoji: '💄', tone: 340, text: 'Bold color, refined finish, and everyday essentials.' },
  { id: 'skincare', title: 'Skincare', emoji: '🫧', tone: 195, text: 'Gentle hydration for a glow that feels healthy.' },
  { id: 'fragrance', title: 'Fragrance', emoji: '🌼', tone: 45, text: 'Fresh, floral, and confident signature scents.' }
];

/* ------------------------------------------------------------------ *
 * Migrations — upgrade data written by earlier versions of the app.
 * ------------------------------------------------------------------ */

function parsePrice(value) {
  if (typeof value === 'number') {
    return value;
  }
  const parsed = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferCategory(product) {
  const name = (product.name || '').toLowerCase();
  if (/parfum|perfume|scent|eau|mist/.test(name)) return 'fragrance';
  if (/serum|cream|cleanser|mask|toner|moistur|hydra/.test(name)) return 'skincare';
  return 'makeup';
}

function migrateProducts(products) {
  let changed = false;
  products.forEach((product) => {
    if (typeof product.price !== 'number') {
      product.price = parsePrice(product.price);
      changed = true;
    }
    if (!product.category) {
      product.category = inferCategory(product);
      changed = true;
    }
    if (typeof product.tone !== 'number') {
      const seeded = SEED_PRODUCTS.find((p) => p.id === product.id);
      product.tone = seeded ? seeded.tone : (Number(product.id) * 47) % 360;
      changed = true;
    }
    if (!Array.isArray(product.reviews)) {
      product.reviews = [];
      changed = true;
    }
    if (!Array.isArray(product.images)) {
      product.images = [];
      changed = true;
    }
    if (!Array.isArray(product.shades)) {
      const seeded = SEED_PRODUCTS.find((p) => p.id === product.id);
      product.shades = seeded && Array.isArray(seeded.shades) ? seeded.shades : (product.category === 'makeup' ? ['Default'] : []);
      changed = true;
    }
  });
  return changed;
}

function migrateUsers(users) {
  let changed = false;
  users.forEach((user) => {
    if (typeof user.password === 'string' && !user.password.startsWith('scrypt:')) {
      user.password = hashPassword(user.password);
      changed = true;
    }
    // Old records stored a bare OTP string with no expiry — clear stale codes.
    if (user.otp && !user.otpExpires) {
      user.otp = '';
      changed = true;
    }
    if (user.phone === undefined) { user.phone = ''; changed = true; }
    if (user.address === undefined) { user.address = ''; changed = true; }
  });
  return changed;
}

function migrateOrders(orders, products) {
  let changed = false;
  orders.forEach((order) => {
    if (!order.status) { order.status = 'confirmed'; changed = true; }
    if (order.subtotal === undefined) {
      order.subtotal = parsePrice(order.total);
      order.shipping = 0;
      changed = true;
    }
    (order.items || []).forEach((item) => {
      if (typeof item.price !== 'number') {
        item.price = parsePrice(item.price);
        changed = true;
      }
      if (item.productId === undefined) {
        const match = products.find((p) => p.name === item.name);
        item.productId = match ? match.id : null;
        changed = true;
      }
    });
  });
  return changed;
}

async function init() {
  if (!useRedis() && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let users = await read('users');
  if (!users.length) {
    users = [{
      id: 1,
      name: 'Admin User',
      email: 'admin@luna.com',
      password: hashPassword('admin123'),
      role: 'admin',
      phone: '',
      address: '',
      otp: '',
      otpVerified: true
    }];
    await write('users', users);
  }

  let products = await read('products');
  if (!products.length) {
    products = SEED_PRODUCTS;
    await write('products', products);
  }

  if (migrateUsers(users)) {
    await write('users', users);
  }
  if (migrateProducts(products)) {
    await write('products', products);
  }

  const orders = await read('orders');
  if (migrateOrders(orders, products)) {
    await write('orders', orders);
  }
}

module.exports = {
  read,
  write,
  nextId,
  init,
  hashPassword,
  verifyPassword,
  useRedis,
  CATEGORIES
};
