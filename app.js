'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const logger = require('morgan');
const cookieParser = require('cookie-parser');

/* Minimal .env loader — keeps the project dependency-free for config. */
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
  fs.readFileSync(dotenvPath, 'utf8').split(/\r?\n/).forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const separator = line.indexOf('=');
    if (separator === -1) return;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

const auth = require('./lib/auth');
const icons = require('./lib/icons');
const rewards = require('./lib/rewards');
const scents = require('./lib/scents');
const skinGoals = require('./lib/skin-goals');

const app = express();

/* Vercel terminates TLS in front of the function and forwards over plain
   HTTP, setting X-Forwarded-Proto — without trusting that header, req.protocol
   always reports "http" in production, which breaks the Google OAuth
   redirect_uri (it wouldn't match the "https://" URI registered in Google
   Cloud Console). */
app.set('trust proxy', 1);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

/* Template helpers available in every view. */
const publicDir = path.join(__dirname, 'public');
/* Cache-busting query string for a static asset, based on its last-modified
   time — so editing style.css/product.js immediately invalidates the
   browser's cached copy instead of silently serving the old file for up to
   an hour (see the maxAge on the static middleware below). */
app.locals.assetVersion = (relPath) => {
  try {
    return Math.floor(fs.statSync(path.join(publicDir, relPath)).mtimeMs);
  } catch (err) {
    return Date.now();
  }
};
app.locals.money = (value) => '$' + (Number(value) || 0).toFixed(2);
app.locals.dateLabel = (value) => new Date(value).toLocaleDateString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric'
});
app.locals.dateTimeLabel = (value) => new Date(value).toLocaleString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
});
app.locals.icon = (name) => icons[name] || '';
const CATEGORY_ICONS = { makeup: 'lipstick', skincare: 'droplet', fragrance: 'perfume' };
app.locals.categoryIcon = (categoryId) => icons[CATEGORY_ICONS[categoryId]] || icons.box;
app.locals.rewardTiers = rewards.TIERS;
app.locals.scentFamilies = scents.SCENT_FAMILIES;
app.locals.skinGoals = skinGoals.SKIN_GOALS;

app.use(logger(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

/* Basic security headers. */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  /* Every page/API response here reflects live account state (who's signed
     in, their cart, orders...) — never let the browser cache or restore one
     from bfcache after sign-out, or the back button can show a stale
     "still signed in" page without ever asking the server again. Static
     assets are unaffected: express.static above already handled those. */
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(auth.attachUser);

app.use('/api', require('./routes/api'));
app.use('/', require('./routes/index'));

/* 404 */
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, message: 'Not found.' });
  }
  const err = new Error('The page you are looking for does not exist.');
  err.status = 404;
  next(err);
});

/* Error handler */
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ ok: false, message: status >= 500 ? 'Something went wrong.' : err.message });
  }
  res.status(status).render('error', {
    page: status === 404 ? 'Page not found' : 'Something went wrong',
    menuId: '',
    status,
    message: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Something went wrong on our side. Please try again.'
      : err.message
  });
});

module.exports = app;
