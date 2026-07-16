'use strict';

/**
 * JSON-file data store.
 *
 * Keeps the project database-free: every collection lives in /data as a
 * pretty-printed JSON file. Writes go through a temp file + rename so a
 * crash mid-write can't corrupt a collection.
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

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function write(name, data) {
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
  { id: 1, name: 'Velvet Satin Lip', brand: 'Luna', price: 24, badge: 'Bestseller', emoji: '💄', category: 'makeup', tone: 340, description: 'A soft matte finish with lasting comfort.', stock: 12, soldOut: false, images: [], modelImage: '', reviews: [], shades: ['Rose Nude', 'Berry', 'Cocoa'] },
  { id: 2, name: 'Glow Serum', brand: 'Aura', price: 39, badge: 'New', emoji: '✨', category: 'skincare', tone: 35, description: 'A dewy serum that brightens and hydrates.', stock: 8, soldOut: false, images: [], modelImage: '', reviews: [] },
  { id: 3, name: 'Lash Lift Mascara', brand: 'Nova', price: 22, badge: 'Top Rated', emoji: '👁️', category: 'makeup', tone: 265, description: 'Builds length and drama without clumping.', stock: 15, soldOut: false, images: [], modelImage: '', reviews: [], shades: ['Black', 'Deep Brown'] },
  { id: 4, name: 'Dawn Blush', brand: 'Luna', price: 28, badge: 'Trending', emoji: '🌸', category: 'makeup', tone: 350, description: 'A rosy flush for a healthy glow.', stock: 10, soldOut: false, images: [], modelImage: '', reviews: [], shades: ['Peony', 'Rosewood'] },
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

function init() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath('users'))) {
    write('users', [{
      id: 1,
      name: 'Admin User',
      email: 'admin@luna.com',
      password: hashPassword('admin123'),
      role: 'admin',
      phone: '',
      address: '',
      otp: '',
      otpVerified: true
    }]);
  }

  if (!fs.existsSync(filePath('products'))) {
    write('products', SEED_PRODUCTS);
  }

  ['orders', 'sessions', 'messages', 'emailLog'].forEach((name) => {
    if (!fs.existsSync(filePath(name))) {
      write(name, []);
    }
  });

  const users = read('users');
  if (migrateUsers(users)) {
    write('users', users);
  }

  const products = read('products');
  if (migrateProducts(products)) {
    write('products', products);
  }

  const orders = read('orders');
  if (migrateOrders(orders, products)) {
    write('orders', orders);
  }
}

module.exports = {
  read,
  write,
  nextId,
  init,
  hashPassword,
  verifyPassword,
  CATEGORIES
};
