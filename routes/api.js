'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const passwords = require('../lib/passwords');
const db = require('../lib/db');
const auth = require('../lib/auth');
const catalog = require('../lib/catalog');
const categories = require('../lib/categories');
const messages = require('../lib/messages');
const users = require('../lib/users');
const products = require('../lib/products');
const orders = require('../lib/orders');
const emailService = require('../lib/emailService');
const uploads = require('../lib/uploads');
const rewards = require('../lib/rewards');
const scents = require('../lib/scents');
const skinGoals = require('../lib/skin-goals');

const SCENT_FAMILIES = new Set(scents.SCENT_FAMILIES.map((entry) => entry.id));
const SKIN_GOALS = new Set(skinGoals.SKIN_GOALS.map((entry) => entry.id));

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

/* We currently only deliver within Lebanon. Addresses are free text (no
   structured country field), so this is a simple, honest best-effort
   check rather than real address validation — it just requires the
   country to be spelled out somewhere in what the customer typed. */
const DELIVERY_COUNTRY_PATTERN = /lebanon|liban/i;
function isDeliverableAddress(address) {
  return DELIVERY_COUNTRY_PATTERN.test(String(address || ''));
}

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
async function issueOtp(user) {
  const otp = generateOtp();
  await users.updateUser(user.id, { otp, otpExpires: new Date(Date.now() + OTP_TTL_MS).toISOString() });
  /* Must be awaited, not fire-and-forget — on Vercel the function can be
     frozen the instant the response goes out, killing any still-pending
     background work before it actually reaches Resend. */
  await emailService.sendEmail('otp', user.email, { firstName: user.name, otp }).catch(() => {});
  return emailService.isConfigured() ? undefined : otp;
}

/** Same idea as issueOtp, but for the separate "forgot password" reset code. */
async function issueResetOtp(user) {
  const otp = generateOtp();
  await users.updateUser(user.id, { resetOtp: otp, resetOtpExpires: new Date(Date.now() + OTP_TTL_MS).toISOString() });
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

  const existing = await users.getUserByEmail(email);

  if (existing && existing.otpVerified) {
    return res.status(409).json({ ok: false, message: 'An account with this email already exists. Please sign in.' });
  }

  let account = existing;
  if (account) {
    // Unverified leftover from an abandoned signup — let it be claimed again.
    account = await users.updateUser(account.id, {
      name: name || account.name,
      password: passwords.hashPassword(password),
      role
    });
  } else {
    account = await users.createUser({
      id: Date.now(),
      name: name || 'Customer',
      email,
      password: passwords.hashPassword(password),
      role,
      otp: '',
      otpVerified: false
    });
  }

  const devOtp = await issueOtp(account);
  res.json({ ok: true, requiresOtp: true, email: account.email, devOtp });
}));

router.post('/auth/signin', ah(async (req, res) => {
  const payload = req.body || {};
  const email = normalizeEmail(payload.email);
  const user = await users.getUserByEmail(email);

  if (!user || !passwords.verifyPassword(String(payload.password || ''), user.password)) {
    return res.status(401).json({ ok: false, message: 'Invalid email or password.' });
  }

  if (!user.otpVerified) {
    const devOtp = await issueOtp(user);
    return res.json({ ok: true, requiresOtp: true, email: user.email, devOtp });
  }

  await auth.createSession(res, user.id);
  res.json({ ok: true, user: auth.safeUser(user) });
}));

router.post('/auth/verify-otp', ah(async (req, res) => {
  const payload = req.body || {};
  const email = normalizeEmail(payload.email);
  const user = await users.getUserByEmail(email);

  if (!user) {
    return res.status(404).json({ ok: false, message: 'No account found for that email.' });
  }
  if (!user.otp || String(user.otp) !== String(payload.otp || '').trim()) {
    return res.status(401).json({ ok: false, message: 'That code is not valid. Please try again.' });
  }
  if (user.otpExpires && new Date(user.otpExpires).getTime() < Date.now()) {
    return res.status(401).json({ ok: false, message: 'That code has expired. Request a new one.' });
  }

  await users.updateUser(user.id, { otpVerified: true, otp: '', otpExpires: null });

  await auth.createSession(res, user.id);
  res.json({ ok: true, user: auth.safeUser(user) });
}));

router.post('/auth/resend-otp', ah(async (req, res) => {
  const email = normalizeEmail((req.body || {}).email);
  const user = await users.getUserByEmail(email);

  if (!user || user.otpVerified) {
    // Do not reveal whether the account exists.
    return res.json({ ok: true, message: 'If a verification is pending, a new code has been sent.' });
  }

  const devOtp = await issueOtp(user);
  res.json({ ok: true, message: 'A new code is on its way.', devOtp });
}));

router.post('/auth/forgot-password', ah(async (req, res) => {
  const email = normalizeEmail((req.body || {}).email);
  const user = await users.getUserByEmail(email);

  if (!user) {
    // Do not reveal whether the account exists.
    return res.json({ ok: true, message: 'If an account exists for that email, a reset code is on its way.' });
  }

  const devOtp = await issueResetOtp(user);
  res.json({ ok: true, message: 'If an account exists for that email, a reset code is on its way.', devOtp });
}));

router.post('/auth/reset-password', ah(async (req, res) => {
  const payload = req.body || {};
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');

  if (!isStrongPassword(password)) {
    return res.status(400).json({ ok: false, message: PASSWORD_REQUIREMENT_MESSAGE });
  }

  const user = await users.getUserByEmail(email);

  if (!user || !user.resetOtp || String(user.resetOtp) !== String(payload.otp || '').trim()) {
    return res.status(401).json({ ok: false, message: 'That code is not valid. Please try again.' });
  }
  if (user.resetOtpExpires && new Date(user.resetOtpExpires).getTime() < Date.now()) {
    return res.status(401).json({ ok: false, message: 'That code has expired. Request a new one.' });
  }

  await users.updateUser(user.id, { password: passwords.hashPassword(password), resetOtp: '', resetOtpExpires: null });

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
  const current = req.user;
  const patch = {};

  if (payload.email !== undefined) {
    const email = normalizeEmail(payload.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    }
    if (await users.emailTaken(email, current.id)) {
      return res.status(409).json({ ok: false, message: 'That email is already in use by another account.' });
    }
    patch.email = email;
  }

  if (payload.name !== undefined && String(payload.name).trim()) {
    patch.name = String(payload.name).trim();
  }
  if (payload.phone !== undefined) {
    patch.phone = String(payload.phone).trim();
  }
  if (payload.address !== undefined) {
    const address = String(payload.address).trim();
    if (address && !isDeliverableAddress(address)) {
      return res.status(400).json({ ok: false, message: 'Sorry, we currently only deliver within Lebanon — please include "Lebanon" in your address.' });
    }
    patch.address = address;
  }

  const updated = await users.updateUser(current.id, patch);
  res.json({ ok: true, user: auth.safeUser(updated) });
}));

router.post('/profile/delete', auth.requireUser, ah(async (req, res) => {
  const password = String((req.body || {}).password || '');
  const current = req.user;

  if (!passwords.verifyPassword(password, current.password)) {
    return res.status(401).json({ ok: false, message: 'Incorrect password.' });
  }

  if (current.role === 'admin' && (await users.countAdmins()) <= 1) {
    return res.status(400).json({ ok: false, message: 'You are the only admin account — promote another admin before deleting this one.' });
  }

  await users.deleteUser(current.id);
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
  res.json({ ok: true, categories: await categories.getCategories() });
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

  if (await categories.categoryExists(id)) {
    return res.status(409).json({ ok: false, message: 'A category with that name already exists.' });
  }

  const category = await categories.createCategory({
    id,
    title,
    emoji: String(payload.emoji || '').trim() || '🌸',
    tone: Math.min(360, Math.max(0, Math.round(Number(payload.tone)) || 0)),
    text: String(payload.text || '').trim()
  });
  res.json({ ok: true, category });
}));

router.delete('/categories/:id', auth.requireAdmin, ah(async (req, res) => {
  if (!(await categories.categoryExists(req.params.id))) {
    return res.status(404).json({ ok: false, message: 'Category not found.' });
  }

  const allProducts = await products.getAllProducts();
  const inUse = allProducts.some((product) => product.category === req.params.id);
  if (inUse) {
    return res.status(400).json({ ok: false, message: 'Move or delete the products in this category before removing it.' });
  }

  const removed = await categories.deleteCategory(req.params.id);
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
            color: String(shade.color || '').trim() || '#d9a08b',
            stock: Math.max(0, Math.floor(Number(shade.stock) || 0))
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
        return name ? { name, label: name, color: '#d9a08b', stock: 0 } : null;
      }).filter(Boolean);
    } else if (typeof payload.shades === 'string') {
      product.shades = payload.shades.split(',').map((value) => value.trim()).filter(Boolean)
        .map((name) => ({ name, label: name, color: '#d9a08b' }));
    }
  }
  if (payload.winkMap !== undefined && payload.winkMap && typeof payload.winkMap === 'object' && !Array.isArray(payload.winkMap)) {
    product.winkMap = payload.winkMap;
  }
  if (payload.scentFamily !== undefined && Array.isArray(payload.scentFamily)) {
    product.scentFamily = payload.scentFamily.map(String).filter((tag) => SCENT_FAMILIES.has(tag));
  }
  if (payload.skinGoals !== undefined && Array.isArray(payload.skinGoals)) {
    product.skinGoals = payload.skinGoals.map(String).filter((tag) => SKIN_GOALS.has(tag));
  }
  if (payload.modelImage !== undefined) product.modelImage = String(payload.modelImage).trim();
  /* Stock is the single source of truth for availability — otherwise a
     "Sold out" checkbox left checked from before a restock (it only gets
     checked automatically when stock hits 0, never unchecked automatically)
     would silently wipe the new stock count straight back to 0. */
  product.soldOut = product.stock <= 0;
}

/* One-off/repeatable admin action: pushes the products+categories bundled
   with the currently deployed code into the database — so a catalog built
   up locally (or edited directly in the repo) can be brought to production
   without needing a terminal or database credentials at all, just an admin
   login in the browser. Scoped to products/categories only — never touches
   users/orders, so it can't clobber real customer data. */
router.post('/admin/sync-catalog', auth.requireAdmin, ah(async (req, res) => {
  const productData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8'));
  const categoryData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'categories.json'), 'utf8'));

  await products.replaceAllProducts(productData);
  await categories.replaceAllCategories(categoryData);

  res.json({ ok: true, productsCount: productData.length, categoriesCount: categoryData.length });
}));

router.post('/products', auth.requireAdmin, ah(async (req, res) => {
  const payload = req.body || {};
  if (!payload.name || !payload.brand || payload.price === undefined || !payload.description) {
    return res.status(400).json({ ok: false, message: 'Name, brand, price, and description are required.' });
  }

  const [nextId, categoryList] = await Promise.all([products.nextProductId(), categories.getCategories()]);
  const validCategoryIds = new Set(categoryList.map((entry) => entry.id));
  const product = {
    id: nextId,
    name: '',
    brand: '',
    price: 0,
    salePrice: null,
    badge: '',
    emoji: '🌸',
    category: validCategoryIds.has('makeup') ? 'makeup' : (categoryList[0] && categoryList[0].id) || '',
    tone: Math.floor(Math.random() * 360),
    description: '',
    stock: 0,
    soldOut: false,
    images: [],
    modelImage: '',
    reviews: []
  };
  applyProductFields(product, payload, validCategoryIds);

  const created = await products.createProduct(product);
  res.json({ ok: true, product: catalog.decorate(created) });
}));

router.patch('/products/:id', auth.requireAdmin, ah(async (req, res) => {
  const product = await products.getProductById(Number(req.params.id));
  if (!product) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const validCategoryIds = new Set((await categories.getCategories()).map((entry) => entry.id));
  applyProductFields(product, req.body || {}, validCategoryIds);
  const saved = await products.saveProduct(product);
  res.json({ ok: true, product: catalog.decorate(saved) });
}));

router.delete('/products/:id', auth.requireAdmin, ah(async (req, res) => {
  const product = await products.getProductById(Number(req.params.id));
  if (!product) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  await products.deleteProduct(product.id);
  res.json({ ok: true, product });
}));

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

router.post('/products/:id/reviews', auth.requireUser, ah(async (req, res) => {
  const product = await products.getProductById(Number(req.params.id));
  if (!product) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const payload = req.body || {};
  const rating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 5)));
  const comment = String(payload.comment || '').trim().slice(0, 1000);

  const verifiedPurchase = await orders.hasVerifiedPurchase(req.user.id, product.id);

  const review = await products.addReview(product.id, {
    id: Date.now(),
    userId: req.user.id,
    userName: req.user.name || 'Customer',
    rating,
    comment,
    verified: verifiedPurchase,
    createdAt: new Date().toISOString()
  });
  product.reviews.push(review);

  const admin = await users.getAdminUser();
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
  const reviews = await products.getAllReviews();
  res.json({ ok: true, reviews });
}));

router.patch('/products/:productId/reviews/:reviewId', auth.requireUser, ah(async (req, res) => {
  const productId = Number(req.params.productId);
  const reviewId = Number(req.params.reviewId);
  if (!(await products.productExists(productId))) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const review = await products.getReview(productId, reviewId);
  if (!review) {
    return res.status(404).json({ ok: false, message: 'Review not found.' });
  }
  if (req.user.role !== 'admin' && review.userId !== req.user.id) {
    return res.status(403).json({ ok: false, message: 'You can only edit your own review.' });
  }

  const payload = req.body || {};
  const updated = await products.updateReview(reviewId, {
    comment: payload.comment !== undefined ? String(payload.comment).trim().slice(0, 1000) : undefined,
    rating: payload.rating !== undefined ? Math.min(5, Math.max(1, Math.round(Number(payload.rating) || review.rating))) : undefined,
    moderatedAt: new Date().toISOString()
  });
  res.json({ ok: true, review: updated });
}));

router.delete('/products/:productId/reviews/:reviewId', auth.requireUser, ah(async (req, res) => {
  const productId = Number(req.params.productId);
  const reviewId = Number(req.params.reviewId);
  if (!(await products.productExists(productId))) {
    return res.status(404).json({ ok: false, message: 'Product not found.' });
  }

  const review = await products.getReview(productId, reviewId);
  if (!review) {
    return res.status(404).json({ ok: false, message: 'Review not found.' });
  }
  if (req.user.role !== 'admin' && review.userId !== req.user.id) {
    return res.status(403).json({ ok: false, message: 'You can only delete your own review.' });
  }

  await products.deleteReview(productId, reviewId);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

/* Turns an unlocked reward tier into a one-time discount code the customer
   can hang onto and apply at checkout whenever they like — separate from
   actually using it, so redeeming doesn't have to happen in the same
   session as placing an order. */
router.post('/rewards/redeem', auth.requireUser, ah(async (req, res) => {
  const tierThreshold = Number((req.body || {}).tier);
  const tier = rewards.TIERS.find((entry) => entry.threshold === tierThreshold);
  if (!tier) {
    return res.status(400).json({ ok: false, message: 'Not a valid reward tier.' });
  }

  const userRecord = await users.getUserById(req.user.id);
  if (!userRecord) {
    return res.status(404).json({ ok: false, message: 'Account not found.' });
  }

  /* Gate eligibility on lifetime points earned, not the current spendable
     balance — otherwise redeeming a lower tier (which spends points) would
     retroactively re-lock a higher tier the customer already qualified for. */
  const lifetimePoints = Number(userRecord.lifetimePoints) || Number(userRecord.rewardPoints) || 0;
  const balance = Number(userRecord.rewardPoints) || 0;
  const redeemedTiers = Array.isArray(userRecord.redeemedTiers) ? userRecord.redeemedTiers : [];
  if (lifetimePoints < tier.threshold) {
    return res.status(400).json({ ok: false, message: 'You don’t have enough points for this tier yet.' });
  }
  if (redeemedTiers.includes(tier.threshold)) {
    return res.status(400).json({ ok: false, message: 'This tier has already been redeemed.' });
  }

  const code = rewards.generateCode();
  await db.sql.transaction([
    users.updateUserQuery(userRecord.id, {
      redeemedTiers: redeemedTiers.concat(tier.threshold),
      lifetimePoints,
      rewardPoints: Math.max(0, balance - tier.threshold)
    }),
    users.addDiscountCodeQuery(userRecord.id, {
      code,
      discount: tier.discount,
      tier: tier.threshold,
      createdAt: new Date().toISOString()
    })
  ]);

  res.json({ ok: true, code, discount: tier.discount });
}));

router.get('/orders', auth.requireUser, ah(async (req, res) => {
  const orderList = req.user.role === 'admin'
    ? await orders.getAllOrders()
    : await orders.getOrdersForUser(req.user.id);
  res.json({ ok: true, orders: orderList });
}));

router.post('/orders', auth.requireUser, ah(async (req, res) => {
  const payload = req.body || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    return res.status(400).json({ ok: false, message: 'Your bag is empty.' });
  }

  const address = String(payload.address || req.user.address || '').trim();
  if (!address) {
    return res.status(400).json({ ok: false, message: 'Please enter a delivery address.' });
  }
  if (!isDeliverableAddress(address)) {
    return res.status(400).json({ ok: false, message: 'Sorry, we currently only deliver within Lebanon — please include "Lebanon" in your delivery address.' });
  }

  const orderItems = [];
  let subtotal = 0;

  /* Validate every item before committing any stock changes — otherwise a
     later item failing validation would leave earlier items' stock already
     decremented with no order actually created. */
  for (const item of items) {
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const product = await products.getProductById(Number(item.id));
    const shade = String(item.shade || '').trim();

    if (!product) {
      return res.status(400).json({ ok: false, message: 'One of the items is no longer available.' });
    }
    /* Without this, an item added via a shortcut that skips the shade
       picker (shop-grid "Add to bag", wishlist quick-add) would check out
       with no shade specified, leaving fulfillment with no way to know
       which one to send. */
    if (Array.isArray(product.shades) && product.shades.length && !shade) {
      return res.status(400).json({ ok: false, message: 'Please choose a shade for ' + product.name + ' before checking out.' });
    }

    /* For a shaded product, availability is the specific shade's own stock
       (product.stock/soldOut are just the sum across all shades — a shade
       with 0 left shouldn't be buyable just because a different shade of
       the same product still has stock). */
    let availableStock = product.stock;
    let itemSoldOut = product.soldOut;
    if (shade) {
      const shadeEntry = (product.shades || []).find((entry) => entry.name === shade);
      if (!shadeEntry) {
        return res.status(400).json({ ok: false, message: 'That shade of ' + product.name + ' is no longer available.' });
      }
      availableStock = shadeEntry.stock;
      itemSoldOut = shadeEntry.soldOut;
    }

    if (itemSoldOut || availableStock < quantity) {
      const label = product.name + (shade ? ' (' + shade + ')' : '');
      return res.status(400).json({
        ok: false,
        message: availableStock > 0
          ? 'Only ' + availableStock + ' of ' + label + ' left in stock.'
          : label + ' is sold out.'
      });
    }

    const unitPrice = (typeof product.salePrice === 'number' && product.salePrice > 0 && product.salePrice < product.price)
      ? product.salePrice
      : product.price;
    subtotal += unitPrice * quantity;
    orderItems.push({ productId: product.id, name: product.name, quantity, price: unitPrice, shade });
  }

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;

  let discount = 0;
  let usedDiscountCode = null;
  const requestedCode = payload.discountCode ? String(payload.discountCode).trim().toUpperCase() : '';
  if (requestedCode) {
    const codeEntry = (req.user.discountCodes || []).find((entry) => entry.code === requestedCode && !entry.usedAt);
    if (codeEntry) {
      discount = Math.round(subtotal * (codeEntry.discount / 100) * 100) / 100;
      usedDiscountCode = codeEntry.code;
    }
  }

  const total = Math.round((subtotal - discount + shipping) * 100) / 100;
  const pointsEarned = Math.max(0, Math.floor(subtotal - discount));
  const paymentMethod = payload.paymentMethod === 'delivery' ? 'delivery' : 'online';

  const order = {
    id: Date.now(),
    userId: req.user.id,
    userEmail: req.user.email,
    status: 'confirmed',
    items: orderItems,
    subtotal: Math.round(subtotal * 100) / 100,
    discount,
    discountCode: usedDiscountCode,
    shipping,
    total,
    pointsEarned,
    paymentMethod,
    address,
    createdAt: new Date().toISOString()
  };

  /* Everything below must commit together — otherwise a crash partway
     through could decrement stock or award points without the order that
     justified it (or vice versa). */
  const txQueries = [
    ...orders.createOrderQueries(order),
    ...orderItems.map((item) => item.shade
      ? products.adjustShadeStockQuery(item.productId, item.shade, -item.quantity)
      : products.adjustStockQuery(item.productId, -item.quantity))
  ];

  const userRecord = req.user;
  if (userRecord) {
    /* Lifetime total never decreases (even when points are later spent on a
       reward), so a redeemed tier can't retroactively re-lock a higher tier
       the customer already qualified for. Seed it from the current balance
       the first time this field is written for an older account. */
    const priorLifetime = Number(userRecord.lifetimePoints) || Number(userRecord.rewardPoints) || 0;
    /* Whatever address they just delivered to becomes their saved address,
       so checkout stays pre-filled with wherever they actually asked us to
       ship last time, not just whatever they set once in their profile. */
    txQueries.push(users.updateUserQuery(userRecord.id, {
      rewardPoints: (Number(userRecord.rewardPoints) || 0) + pointsEarned,
      lifetimePoints: priorLifetime + pointsEarned,
      address
    }));
    if (usedDiscountCode) {
      txQueries.push(users.setDiscountCodeUsedQuery(userRecord.id, usedDiscountCode, new Date().toISOString()));
    }
  }

  await db.sql.transaction(txQueries.filter(Boolean));

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
  const order = await orders.getOrderById(Number(req.params.orderId));

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

  let allProducts = null;
  const txQueries = [orders.cancelOrderQuery(order.id)];
  for (const item of (order.items || [])) {
    let productId = item.productId;
    if (!productId) {
      // Defensive fallback for legacy order items missing a productId — should
      // never trigger now that order_items.product_id is populated at checkout.
      allProducts = allProducts || (await products.getAllProducts());
      const match = allProducts.find((entry) => entry.name === item.name);
      productId = match ? match.id : null;
    }
    if (productId) {
      txQueries.push(item.shade
        ? products.adjustShadeStockQuery(productId, item.shade, item.quantity || 1)
        : products.adjustStockQuery(productId, item.quantity || 1));
    }
  }

  // Refund isn't a real payment-gateway transaction here (no card was ever
  // actually charged), but the order's reward-program effects are real —
  // reverse the points it earned, and un-use any discount code it spent
  // (the code itself was earned separately via redeeming a tier, so a
  // cancelled order gives back the ability to use that code again rather
  // than un-redeeming the tier). Everything here commits atomically with the
  // cancellation and restock above.
  if (order.userId && (order.pointsEarned || order.discountCode)) {
    const userRecord = await users.getUserById(order.userId);
    if (userRecord) {
      if (order.pointsEarned) {
        const priorLifetime = Number(userRecord.lifetimePoints) || Number(userRecord.rewardPoints) || 0;
        txQueries.push(users.updateUserQuery(userRecord.id, {
          rewardPoints: Math.max(0, (Number(userRecord.rewardPoints) || 0) - order.pointsEarned),
          lifetimePoints: Math.max(0, priorLifetime - order.pointsEarned)
        }));
      }
      if (order.discountCode) {
        txQueries.push(users.setDiscountCodeUsedQuery(userRecord.id, order.discountCode, null));
      }
    }
  }

  await db.sql.transaction(txQueries.filter(Boolean));

  if (order.userEmail) {
    await emailService.sendEmail('order_cancellation', order.userEmail, {
      firstName: req.user.name,
      orderNumber: order.id,
      total: Number(order.total || 0).toFixed(2)
    }).catch(console.error);
  }

  res.json({ ok: true, order });
}));

/* "Deleting" an order only hides it from the customer's own history — the
   record stays in the database so admin revenue/order stats stay accurate. */
router.delete('/orders/:orderId', auth.requireUser, ah(async (req, res) => {
  const order = await orders.getOrderById(Number(req.params.orderId));

  if (!order) {
    return res.status(404).json({ ok: false, message: 'Order not found.' });
  }
  if (order.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'You are not authorized to remove this order.' });
  }

  await orders.hideOrder(order.id);
  res.json({ ok: true });
}));

router.delete('/orders', auth.requireUser, ah(async (req, res) => {
  await orders.hideAllOrdersForUser(req.user.id);
  res.json({ ok: true });
}));

router.post('/orders/:orderId/status', auth.requireAdmin, ah(async (req, res) => {
  const status = String((req.body || {}).status || '');
  if (!ORDER_STATUSES.includes(status) || status === 'cancelled') {
    return res.status(400).json({ ok: false, message: 'Invalid order status.' });
  }

  const order = await orders.getOrderById(Number(req.params.orderId));
  if (!order) {
    return res.status(404).json({ ok: false, message: 'Order not found.' });
  }
  if (order.status === 'cancelled') {
    return res.status(400).json({ ok: false, message: 'Cancelled orders cannot change status.' });
  }

  await orders.setStatus(order.id, status);
  order.status = status;
  order.updatedAt = new Date().toISOString();

  if (order.userEmail && status !== 'confirmed') {
    const customer = order.userId ? await users.getUserById(order.userId) : null;
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

  await messages.createMessage({
    id: Date.now(),
    name,
    email,
    message: message.slice(0, 2000)
  });

  const admin = await users.getAdminUser();
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
