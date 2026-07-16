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

const store = require('./lib/store');
const auth = require('./lib/auth');

store.init();

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

/* Template helpers available in every view. */
app.locals.money = (value) => '$' + (Number(value) || 0).toFixed(2);
app.locals.dateLabel = (value) => new Date(value).toLocaleDateString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric'
});
app.locals.dateTimeLabel = (value) => new Date(value).toLocaleString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
});

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
