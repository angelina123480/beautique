'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const store = require('../lib/store');
const auth = require('../lib/auth');
const catalog = require('../lib/catalog');
const emailService = require('../lib/emailService');
const uploads = require('../lib/uploads');
const rewards = require('../lib/rewards');

const router = express.Router();

/* Images only, kept under Vercel's 4.5MB function request-body limit. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(null, true);
    }
    const err = new Error('Only JPG, PNG, WEBP, or GIF images are allowed.');
    err.status = 400;
    cb(err);
  }
});

/* Normalizes multer's own errors (e.g. file-too-large) into the same
   { status, message } shape the rest of the app's error handler expects. */
function uploadSingleImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      err.message = 'Image is too large (max 4MB).';
    }
    err.status = err.status || 400;
    next(err);
  });
}

const OTP_TTL_MS = 10 * 60 * 1000;
const FREE_SHIPPING_THRESHOLD = 50;
const SHIPPING_FLAT = 5.95;
const ORDER_STATUSES = ['confirmed', 'shipped', 'delivered', 'cancelled'];

/* Express 4 doesn't forward rejected promises to the error handler on its own. */
function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function adminInviteCode() {
  return process.env.ADMIN_INVITE_CODE || 'BEAUTIQUE-ADMIN';
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const PASSWORD_REQUIREMENT_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a symbol.';

function isStrongPassword(value) {
  return typeof value === 'string' &&
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Issues a fresh OTP for a user, persists it, and emails it. When no email
 * provider is configured (local demo), the code is returned so the UI can
 * display it instead of leaving the user stranded.
 */
async function issueOtp(users, user) {
  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await store.write('users', users);
  /* Must be awaited, not fire-and-forget — on Vercel the function can be
     frozen the instant the response goes out, killing any still-pending
     background work before it actually reaches Resend. */
  await emailService.sendEmail('otp', user.email, { firstName: user.name, otp }).catch(() => {});
  return emailService.isConfigured() ? undefined : otp;
}

/** Same idea as issueOtp, but for the separate "forgot password" reset code. */
async function issueResetOtp(users, user) {
  const otp = generateOtp();
  user.resetOtp = otp;
  user.resetOtpExpires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await store.write('users', users);
  await emailService.sendEmail('password_reset', user.email, { firstName: user.name, otp }).catch(() => {});
  return emailService.isConfigured() ? undefined : otp;
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

router.get('/auth/me', (req, res) => {
  res.json({ ok: true, user: auth.safeUser(req.user) });
});

router.post('/auth/signup', ah(async (req, res) => {
  const payload = req.body || {};
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');
  const name = String(payload.name || '').trim();

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ ok: false, message: PASSWORD_REQUIREMENT_MESSAGE });
  }

  let role = payload.role === 'admin' ? 'admin' : 'client';
  if (role === 'admin' && String(payload.inviteCode || '') !== adminInviteCode()) {
    return res.status(403).json({ ok: false, message: 'Invalid admin invite code.' });
  }

  const users = await store.read('users');
  const existing = users.find((user) => normalizeEmail(user.email) === email);

  if (existing && existing.otpVerified) {
    return res.status(409).json({ ok: false, message: 'An account with this email already exists. Please sign in.' });
  }

  let account = existing;
  if (account) {
    // Unverified leftover from an abandoned signup — let it be claimed again.
    account.name = name || account.name;
    account.password = store.hashPassword(password);
    account.role = role;
  } else {
    account = {
      id: Date.now(),
      name: name || 'Customer',
      email,
      password: store.hashPassword(password),
      role,
      phone: '',
      address: '',
      otp: '',
      otpVerified: false,
      createdAt: new Date().toISOString()
    };
    users.push(account);
  }

  const devOtp = await issueOtp(users, account);
  res.json({ ok: true, requiresOtp: true, email: account.email, devOtp });
}));

router.post('/auth/signin', ah(async (req, res) => {
  const payload = req.body || {};
  const email = normalizeEmail(payload.email);
  const users = await store.read('users');
  const user = users.find((entry) => normalizeEmail(entry.email) === email);

  if (!user || !store.verifyPassword(String(payload.password || ''), user.password)) {
    return res.status(401).json({ ok: false, message: 'Invalid email or password.' });
  }

  if (!user.otpVerified) {
    const devOtp = await issueOtp(users, user);
    return res.json({ ok: true, requiresOtp: true, email: user.email, devOtp });
  }

  await auth.createSession(res, user.id);
  res.json({ ok: true, user: auth.safeUser(user) });
}));

router.post('/auth/verify-otp', ah(async (req, res) => {
  const payload = req.body || {};
  const email = normalizeEmail(payload.email);
  const users = await store.read('users');
  const user = users.find((entry) => normalizeEmail(entry.email) === email);

  if (!user) {
    return res.status(404).json({ ok: false, message: 'No account found for that email.' });
  }
  if (!user.otp || String(user.otp) !== String(payload.otp || '').trim()) {
    return res.status(401).json({ ok: false, message: 'That code is not valid. Please try again.' });
  }
  if (user.otpExpires && new Date(user.otpExpires).getTime() < Date.now()) {
    return res.status(401).json({ ok: false, message: 'That code has expired. Request a new one.' });
  }

  user.otpVerified = true;
  user.otp = '';
  user.otpExpires = '';
  await store.write('users', users);

  await auth.createSession(res, user.id);
  res.json({ ok: true, user: auth.safeUser(user) });
}));

router.post('/auth/resend-otp', ah(async (req, res) => {
  const email = normalizeEmail((req.body || {}).email);
  const users = await store.read('users');
  const user = users.find((entry) => normalizeEmail(entry.email) === email);

  if (!user || user.otpVerified) {
    // Do not reveal whether the account exists.
    return res.json({ ok: true, message: 'If a verification is pending, a new code has been sent.' });
  }

  const devOtp = await issueOtp(users, user);
  res.json({ ok: true, message: 'A new code is on its way.', devOtp });
}));

router.post('/auth/forgot-password', ah(async (req, res) => {
  const email = normalizeEmail((req.body || {}).email);
  const users = await store.read('users');
  const user = users.find((entry) => normalizeEmail(entry.email) === email);

  if (!user) {
    // Do not reveal whether the account exists.
    return res.json({ ok: true, message: 'If an account exists for that email, a reset code is on its way.' });
  }

  const devOtp = await issueResetOtp(users, user);
  res.json({ ok: true, message: 'If an account exists for that email, a reset code is on its way.', devOtp });
}));

router.post('/auth/reset-password', ah(async (req, res) => {
  const payload = req.body || {};
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');

  if (!isStrongPassword(password)) {
    return res.status(400).json({ ok: false, message: PASSWORD_REQUIREMENT_MESSAGE });
  }

  const users = await store.read('users');
  const user = users.find((entry) => normalizeEmail(entry.email) === email);

  if (!user || !user.resetOtp || String(user.resetOtp) !== String(payload.otp || '').trim()) {
    return res.status(401).json({ ok: false, message: 'That code is not valid. Please try again.' });
  }
  if (user.resetOtpExpires && new Date(user.resetOtpExpires).getTime() < Date.now()) {
    return res.status(401).json({ ok: false, message: 'That code has expired. Request a new one.' });
  }

  user.password = store.hashPassword(password);
  user.resetOtp = '';
  user.resetOtpExpires = '';
  await store.write('users', users);

  res.json({ ok: true, message: 'Password updated. Please sign in.' });
}));

router.post('/auth/signout', ah(async (req, res) => {
  await auth.destroySession(req, res);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

router.post('/profile/update', auth.requireUser, ah(async (req, res) => {
  const payload = req.body || {};
  const users = await store.read('users');
  const current = users.find((entry) => entry.id === req.user.id);

  if (!current) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }

  if (payload.email !== undefined) {
    const email = normalizeEmail(payload.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    }
    const taken = users.some((entry) => entry.id !== current.id && normalizeEmail(entry.email) === email);
    if (taken) {
      return res.status(409).json({ ok: false, message: 'That email is already in use by another account.' });
    }
    current.email = email;
  }

  if (payload.name !== undefined && String(payload.name).trim()) {
    current.name = String(payload.name).trim();
  }
  if (payload.phone !== undefined) {
    current.phone = String(payload.phone).trim();
  }
  if (payload.address !== undefined) {
    current.address = String(payload.address).trim();
  }

  await store.write('users', users);
  res.json({ ok: true, user: auth.safeUser(current) });
}));

router.post('/profile/delete', auth.requireUser, ah(async (req, res) => {
  const password = String((req.body || {}).password || '');
  const users = await store.read('users');
  const current = users.find((entry) => entry.id === req.user.id);

  if (!current || !store.verifyPassword(password, current.password)) {
    return res.status(401).json({ ok: false, message: 'Incorrect password.' });
  }

  if (current.role === 'admin' && users.filter((entry) => entry.role === 'admin').length <= 1) {
    return res.status(400).json({ ok: false, message: 'You are the only admin account — promote another admin before deleting this one.' });
  }

  await store.write('users', users.filter((entry) => entry.id !== current.id));
  await auth.destroySession(req, res);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

router.get('/categories', ah(async (req, res) => {
  res.json({ ok: true, categories: await store.read('categories') });
}));

router.post('/categories', auth.requireAdmin, ah(async (req, res) => {
  const payload = req.body || {};
  const title = String(payload.title || '').trim();
  if (!title) {
    return res.status(400).json({ ok: false, message: 'A category name is required.' });
  }

  const id = slugify(title);
  if (!id) {
    return res.status(400).json({ ok: false, message: 'That name doesn\'t produce a usable category id — try adding some letters or numbers.' });
  }

  const categories = await store.read('categories');
  if (categories.some((entry) => entry.id === id)) {
    return res.status(409).json({ ok: false, message: 'A category with that name already exists.' });
  }

  const category = {
    id,
    title,
    emoji: String(payload.emoji || '').trim() || '🌸',
    tone: Math.min(360, Math.max(0, Math.round(Number(payload.tone)) || 0)),
    text: String(payload.text || '').trim()
  };
  categories.push(category);
  await store.write('categories', categories);
  res.json({ ok: true, category });
}));

router.delete('/categories/:id', auth.requireAdmin, ah(async (req, res) => {
  const categories = await store.read('categories');
  const index = categories.findIndex((entry) => entry.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ ok: false, message: 'Category not found.' });
  }

  const products = await store.read('products');
  const inUse = products.some((product) => product.category === req.params.id);
  if (inUse) {
    return res.status(400).json({ ok: false, message: 'Move or delete the products in this category before removing it.' });
  }

  const removed = categories.splice(index, 1)[0];
  await store.write('categories', categories);
  res.json({ ok: true, category: removed });
}));

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

router.get('/products', ah(async (req, res) => {
  res.json({ ok: true, products: await catalog.getProducts() });
}));

router.post('/uploads', auth.requireAdmin, uploadSingleImage, ah(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: 'No image file provided.' });
  }
  const url = await uploads.saveUpload(req.file.buffer, req.file.originalname, req.file.mimetype);
  res.json({ ok: true, url });
}));

function applyProductFields(product, payload, validCategoryIds) {
  if (payload.name !== undefined) product.name = String(payload.name).trim();
  if (payload.brand !== undefined) product.brand = String(payload.brand).trim();
  if (payload.price !== undefined) product.price = Math.max(0, Number(payload.price) || 0);
  if (payload.salePrice !== undefined) {
    const sale = payload.salePrice === null || payload.salePrice === '' ? null : Number(payload.salePrice);
    product.salePrice = (sale && sale > 0 && sale < product.price) ? sale : null;
  }
  if (payload.badge !== undefined) product.badge = String(payload.badge).trim();
  if (payload.emoji !== undefined) product.emoji = String(payload.emoji).trim();
  if (payload.category !== undefined && validCategoryIds.has(payload.category)) {
    product.category = payload.category;
  }
  if (payload.description !== undefined) product.description = String(payload.description).trim();
  if (payload.stock !== undefined) product.stock = Math.max(0, Math.floor(Number(payload.stock) || 0));
  if (payload.soldOut !== undefined) product.soldOut = payload.soldOut === true;
  if (payload.images !== undefined && Array.isArray(payload.images)) {
    product.images = payload.images.map(String).filter(Boolean).slice(0, 8);
  }
  if (payload.shades !== undefined) {
    if (Array.isArray(payload.shades)) {
      product.shades = payload.shades.map((shade) => {
        if (shade && typeof shade === 'object') {
          const name = String(shade.name || '').trim();
          if (!name) return null;
          const normalized = {
            name,
            label: String(shade.label || name).trim() || name,
            color: String(shade.color || '').trim() || '#d9a08b'
          };
          if (Array.isArray(shade.images)) {
            normalized.images = shade.images.map(String).map((value) => value.trim()).filter(Boolean);
          }
          if (shade.tintPhotos) {
            normalized.tintPhotos = true;
          }
          return normalized;
        }
        const name = String(shade).trim();
        return name ? { name, label: name, color: '#d9a08b' } : null;
      }).filter(Boolean);
    } else if (typeof payload.shades === 'string') {
      product.shades = payload.shades.split(',').map((value) => value.trim()).filter(Boolean)
        .map((name) => ({ name, label: name, color: '#d9a08b' }));
    }
  }
  if (payload.winkMap !== undefined && payload.winkMap && typeof payload.winkMap === 'object' && !Array.isArray(payload.winkMap)) {
    product.winkMap = payload.winkMap;
  }
  if (payload.modelImage !== undefined) product.modelImage = String(payload.modelImage).trim();
  if (product.stock <= 0) product.soldOut = true;
  if (product.soldOut) product.stock = 0;
}

/* One-off/repeatable admin action: pushes the products+categories bundled
   with the currently deployed code into whichever store.js backend is
   active (Redis in production, the local files in dev) — so a catalog
   built up locally (or edited directly in the repo) can be brought to
   production without needing a terminal or Redis credentials at all,
   just an admin login in the browser. Scoped to products/categories only
   — never touches users/orders, so it can't clobber real customer data. */
router.post('/admin/sync-catalog', auth.requireAdmin, ah(async (req, res) => {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8'));
  const categories = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'categories.json'), 'utf8'));

  await store.write('products', products);
  await store.write('categories', categories);

  res.json({ ok: true, productsCount: products.length, categoriesCount: categories.length });
}));

router.post('/products', auth.requireAdmin, ah(async (req, res) => {
  const payload = req.body || {};
  if (!payload.name || !payload.brand || payload.price === undefined || !payload.description) {
    return res.status(400).json({ ok: false, message: 'Name, brand, price, and description are required.' });
  }

  const [products, categories] = await Promise.all([store.read('products'), store.read('categories')]);
  const validCategoryIds = new Set(categories.map((entry) => entry.id));
  const product = {
    id: store.nextId(products),
    name: '',
    brand: '',
    price: 0,
    salePrice: null,
    badge: '',
    emoji: '🌸',
    category: validCategoryIds.has('makeup') ? 'makeup' : (categories[0] && categories[0].id) || '',
    tone: Math.floor(Math.random() * 360),
    description: '',
    stock: 0,
    soldOut: false,
    images: [],
    modelImage: '',
    reviews: []
  };
  applyProductFields(product, payload, validCategoryIds);

  products.push(product);
  await store.write('products', products);
  res.json({ ok: true, product: catalog.decorate(product) });
}));

router.patch('/products/:id', auth.requireAdmin, ah(async (req, res) => {
  const products = await store.read('products');
  const product = products.find((item) => item.id === Number(req.params.id));
  if (!product) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const validCategoryIds = new Set((await store.read('categories')).map((entry) => entry.id));
  applyProductFields(product, req.body || {}, validCategoryIds);
  await store.write('products', products);
  res.json({ ok: true, product: catalog.decorate(product) });
}));

router.delete('/products/:id', auth.requireAdmin, ah(async (req, res) => {
  const products = await store.read('products');
  const index = products.findIndex((item) => item.id === Number(req.params.id));
  if (index === -1) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const removed = products.splice(index, 1)[0];
  await store.write('products', products);
  res.json({ ok: true, product: removed });
}));

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

router.post('/products/:id/reviews', auth.requireUser, ah(async (req, res) => {
  const products = await store.read('products');
  const product = products.find((item) => item.id === Number(req.params.id));
  if (!product) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const payload = req.body || {};
  const rating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 5)));
  const comment = String(payload.comment || '').trim().slice(0, 1000);

  const orders = await store.read('orders');
  const verifiedPurchase = orders.some((order) =>
    order.userId === req.user.id &&
    order.status !== 'cancelled' &&
    (order.items || []).some((item) => item.productId === product.id));

  product.reviews = product.reviews || [];
  const review = {
    id: Date.now(),
    userId: req.user.id,
    userName: req.user.name || 'Customer',
    rating,
    comment,
    verified: verifiedPurchase,
    createdAt: new Date().toISOString()
  };
  product.reviews.push(review);

  await store.write('products', products);

  const admin = (await store.read('users')).find((account) => account.role === 'admin');
  if (admin && admin.email) {
    await emailService.sendEmail('review_notification', admin.email, {
      firstName: admin.name,
      reviewerName: review.userName,
      productName: product.name,
      rating: review.rating,
      comment: review.comment
    }).catch((err) => console.error('Review notification failed:', err));
  }

  res.json({ ok: true, review, product: catalog.decorate(product) });
}));

router.get('/reviews', auth.requireAdmin, ah(async (req, res) => {
  const reviews = [];
  (await store.read('products')).forEach((product) => {
    (product.reviews || []).forEach((review) => {
      reviews.push({
        productId: product.id,
        productName: product.name,
        rating: review.rating,
        comment: review.comment,
        userName: review.userName,
        verified: Boolean(review.verified),
        createdAt: review.createdAt
      });
    });
  });
  reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, reviews });
}));

router.patch('/products/:productId/reviews/:reviewId', auth.requireUser, ah(async (req, res) => {
  const products = await store.read('products');
  const product = products.find((item) => item.id === Number(req.params.productId));
  if (!product) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const review = (product.reviews || []).find((entry) => entry.id === Number(req.params.reviewId));
  if (!review) {
    return res.status(404).json({ ok: false, message: 'Review not found.' });
  }
  if (req.user.role !== 'admin' && review.userId !== req.user.id) {
    return res.status(403).json({ ok: false, message: 'You can only edit your own review.' });
  }

  const payload = req.body || {};
  if (payload.comment !== undefined) {
    review.comment = String(payload.comment).trim().slice(0, 1000);
  }
  if (payload.rating !== undefined) {
    review.rating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || review.rating)));
  }
  review.moderatedAt = new Date().toISOString();

  await store.write('products', products);
  res.json({ ok: true, review });
}));

router.delete('/products/:productId/reviews/:reviewId', auth.requireUser, ah(async (req, res) => {
  const products = await store.read('products');
  const product = products.find((item) => item.id === Number(req.params.productId));
  if (!product) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const index = (product.reviews || []).findIndex((entry) => entry.id === Number(req.params.reviewId));
  if (index === -1) {
    return res.status(404).json({ ok: false, message: 'Review not found.' });
  }
  const review = product.reviews[index];
  if (req.user.role !== 'admin' && review.userId !== req.user.id) {
    return res.status(403).json({ ok: false, message: 'You can only delete your own review.' });
  }

  product.reviews.splice(index, 1);
  await store.write('products', products);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

router.get('/orders', auth.requireUser, ah(async (req, res) => {
  let orders = await store.read('orders');
  if (req.user.role !== 'admin') {
    orders = orders.filter((order) => order.userId === req.user.id);
  }
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, orders });
}));

router.post('/orders', auth.requireUser, ah(async (req, res) => {
  const payload = req.body || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    return res.status(400).json({ ok: false, message: 'Your bag is empty.' });
  }

  const products = await store.read('products');
  const orderItems = [];
  let subtotal = 0;

  for (const item of items) {
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const product = products.find((entry) => entry.id === Number(item.id));
    const shade = String(item.shade || '').trim();

    if (!product) {
      return res.status(400).json({ ok: false, message: 'One of the items is no longer available.' });
    }
    if (product.soldOut || product.stock < quantity) {
      return res.status(400).json({
        ok: false,
        message: product.stock > 0
          ? 'Only ' + product.stock + ' of ' + product.name + ' left in stock.'
          : product.name + ' is sold out.'
      });
    }

    product.stock -= quantity;
    product.soldOut = product.stock <= 0;
    const unitPrice = (typeof product.salePrice === 'number' && product.salePrice > 0 && product.salePrice < product.price)
      ? product.salePrice
      : product.price;
    subtotal += unitPrice * quantity;
    orderItems.push({ productId: product.id, name: product.name, quantity, price: unitPrice, shade });
  }

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;

  let discount = 0;
  let redeemedTier = null;
  if (payload.redeemTier) {
    const tier = rewards.TIERS.find((entry) => entry.threshold === Number(payload.redeemTier));
    const points = Number(req.user.rewardPoints) || 0;
    const alreadyRedeemed = (req.user.redeemedTiers || []).includes(Number(payload.redeemTier));
    if (tier && !alreadyRedeemed && points >= tier.threshold) {
      discount = Math.round(subtotal * (tier.discount / 100) * 100) / 100;
      redeemedTier = tier.threshold;
    }
  }

  const total = Math.round((subtotal - discount + shipping) * 100) / 100;
  const pointsEarned = Math.max(0, Math.floor(subtotal - discount));
  const paymentMethod = payload.paymentMethod === 'delivery' ? 'delivery' : 'online';
  const address = String(payload.address || req.user.address || '').trim();

  const order = {
    id: Date.now(),
    userId: req.user.id,
    userEmail: req.user.email,
    status: 'confirmed',
    items: orderItems,
    subtotal: Math.round(subtotal * 100) / 100,
    discount,
    redeemedTier,
    shipping,
    total,
    pointsEarned,
    paymentMethod,
    address,
    createdAt: new Date().toISOString()
  };

  await store.write('products', products);
  const orders = await store.read('orders');
  orders.push(order);
  await store.write('orders', orders);

  const users = await store.read('users');
  const userRecord = users.find((entry) => entry.id === req.user.id);
  if (userRecord) {
    userRecord.rewardPoints = (Number(userRecord.rewardPoints) || 0) + pointsEarned;
    if (redeemedTier) {
      userRecord.redeemedTiers = Array.isArray(userRecord.redeemedTiers) ? userRecord.redeemedTiers : [];
      if (!userRecord.redeemedTiers.includes(redeemedTier)) userRecord.redeemedTiers.push(redeemedTier);
    }
    await store.write('users', users);
  }

  const itemsSummary = orderItems
    .map((item) => '  • ' + item.quantity + ' × ' + item.name + (item.shade ? ' (' + item.shade + ')' : '') + ' ($' + item.price.toFixed(2) + ')')
    .join('\n');
  await emailService.sendEmail('order_confirmation', req.user.email, {
    firstName: req.user.name,
    orderNumber: order.id,
    total: total.toFixed(2),
    itemsSummary
  }).catch(console.error);
  await emailService.sendEmail('follow_up', req.user.email, { firstName: req.user.name }).catch(console.error);

  res.json({ ok: true, order });
}));

router.post('/orders/:orderId/cancel', auth.requireUser, ah(async (req, res) => {
  const orders = await store.read('orders');
  const order = orders.find((entry) => entry.id === Number(req.params.orderId));

  if (!order) {
    return res.status(404).json({ ok: false, message: 'Order not found.' });
  }
  if (order.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'You are not authorized to cancel this order.' });
  }
  if (order.status === 'cancelled') {
    return res.status(400).json({ ok: false, message: 'This order has already been cancelled.' });
  }
  if (order.status === 'delivered') {
    return res.status(400).json({ ok: false, message: 'Delivered orders can no longer be cancelled.' });
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date().toISOString();

  const products = await store.read('products');
  (order.items || []).forEach((item) => {
    const product = products.find((entry) => entry.id === item.productId || entry.name === item.name);
    if (product) {
      product.stock += item.quantity || 1;
      product.soldOut = product.stock <= 0;
    }
  });

  await store.write('products', products);
  await store.write('orders', orders);

  // Refund isn't a real payment-gateway transaction here (no card was ever
  // actually charged), but the order's reward-program effects are real —
  // reverse the points it earned, and give back any tier it redeemed so
  // the customer isn't left worse off for a cancelled order.
  if (order.pointsEarned || order.redeemedTier) {
    const users = await store.read('users');
    const userRecord = users.find((entry) => entry.id === order.userId);
    if (userRecord) {
      if (order.pointsEarned) {
        userRecord.rewardPoints = Math.max(0, (Number(userRecord.rewardPoints) || 0) - order.pointsEarned);
      }
      if (order.redeemedTier && Array.isArray(userRecord.redeemedTiers)) {
        const tierIndex = userRecord.redeemedTiers.indexOf(order.redeemedTier);
        if (tierIndex !== -1) userRecord.redeemedTiers.splice(tierIndex, 1);
      }
      await store.write('users', users);
    }
  }

  if (order.userEmail) {
    await emailService.sendEmail('order_cancellation', order.userEmail, {
      firstName: req.user.name,
      orderNumber: order.id,
      total: Number(order.total || 0).toFixed(2)
    }).catch(console.error);
  }

  res.json({ ok: true, order });
}));

router.post('/orders/:orderId/status', auth.requireAdmin, ah(async (req, res) => {
  const status = String((req.body || {}).status || '');
  if (!ORDER_STATUSES.includes(status) || status === 'cancelled') {
    return res.status(400).json({ ok: false, message: 'Invalid order status.' });
  }

  const orders = await store.read('orders');
  const order = orders.find((entry) => entry.id === Number(req.params.orderId));
  if (!order) {
    return res.status(404).json({ ok: false, message: 'Order not found.' });
  }
  if (order.status === 'cancelled') {
    return res.status(400).json({ ok: false, message: 'Cancelled orders cannot change status.' });
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();
  await store.write('orders', orders);

  if (order.userEmail && status !== 'confirmed') {
    const customer = (await store.read('users')).find((entry) => entry.id === order.userId);
    await emailService.sendEmail('order_status', order.userEmail, {
      firstName: customer ? customer.name : 'there',
      orderNumber: order.id,
      status
    }).catch(console.error);
  }

  res.json({ ok: true, order });
}));

/* ------------------------------------------------------------------ *
 * Contact
 * ------------------------------------------------------------------ */

router.post('/contact', ah(async (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || '').trim();
  const email = normalizeEmail(payload.email);
  const message = String(payload.message || '').trim();

  if (!name || !message || !isValidEmail(email)) {
    return res.status(400).json({ ok: false, message: 'Please fill in your name, a valid email, and a message.' });
  }

  const messages = await store.read('messages');
  messages.push({
    id: Date.now(),
    name,
    email,
    message: message.slice(0, 2000),
    createdAt: new Date().toISOString()
  });
  await store.write('messages', messages);

  const admin = (await store.read('users')).find((account) => account.role === 'admin');
  if (admin && admin.email) {
    await emailService.sendEmail('contact_message', admin.email, {
      firstName: admin.name,
      senderName: name,
      senderEmail: email,
      message: message.slice(0, 2000)
    }).catch(console.error);
  }

  res.json({ ok: true, message: 'Thank you! We will get back to you shortly.' });
}));

module.exports = router;
