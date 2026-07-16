'use strict';

/**
 * Session + current-user helpers.
 *
 * Sessions are random 256-bit tokens stored server-side in data/sessions.json,
 * sent to the browser as an httpOnly cookie. (The previous version used the
 * raw user id as the cookie value, which let anyone impersonate any user.)
 */

const crypto = require('crypto');
const store = require('./store');

const COOKIE_NAME = 'beautiqueSession';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function pruneExpired(sessions) {
  const now = Date.now();
  return sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = pruneExpired(store.read('sessions'));
  sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  });
  store.write('sessions', sessions);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS
  });
}

function destroySession(req, res) {
  const token = req.cookies[COOKIE_NAME];
  if (token) {
    const sessions = store.read('sessions').filter((session) => session.token !== token);
    store.write('sessions', sessions);
  }
  res.clearCookie(COOKIE_NAME);
}

function getCurrentUser(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return null;
  }
  const session = store.read('sessions').find((entry) => entry.token === token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }
  return store.read('users').find((user) => user.id === session.userId) || null;
}

/** Strip secrets before a user object ever reaches a template or API response. */
function safeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || '',
    address: user.address || ''
  };
}

/** Express middleware: exposes req.user and res.locals.user (sanitized) everywhere. */
function attachUser(req, res, next) {
  req.user = getCurrentUser(req);
  res.locals.user = safeUser(req.user);
  next();
}

function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, message: 'Please sign in to continue.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'Admin access required.' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  createSession,
  destroySession,
  getCurrentUser,
  safeUser,
  attachUser,
  requireUser,
  requireAdmin
};
