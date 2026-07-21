'use strict';

/**
 * Session + current-user helpers.
 *
 * Sessions are random 256-bit tokens stored server-side in Postgres (see
 * lib/sessions.js), sent to the browser as an httpOnly cookie. (The previous
 * version used the raw user id as the cookie value, which let anyone
 * impersonate any user.)
 */

const sessions = require('./sessions');
const users = require('./users');

const COOKIE_NAME = 'beautiqueSession';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function createSession(res, userId) {
  const token = await sessions.createSession(userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS
  });
}

async function destroySession(req, res) {
  const token = req.cookies[COOKIE_NAME];
  if (token) {
    await sessions.destroySession(token);
  }
  res.clearCookie(COOKIE_NAME);
}

async function getCurrentUser(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return null;
  }
  const session = await sessions.getSession(token);
  if (!session) {
    return null;
  }
  return users.getUserById(session.userId);
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
    address: user.address || '',
    rewardPoints: Number(user.rewardPoints) || 0,
    lifetimePoints: Number(user.lifetimePoints) || Number(user.rewardPoints) || 0,
    redeemedTiers: Array.isArray(user.redeemedTiers) ? user.redeemedTiers : [],
    discountCodes: Array.isArray(user.discountCodes) ? user.discountCodes : []
  };
}

/** Express middleware: exposes req.user and res.locals.user (sanitized) everywhere. */
function attachUser(req, res, next) {
  getCurrentUser(req).then((user) => {
    req.user = user;
    res.locals.user = safeUser(user);
    next();
  }).catch(next);
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

/** Finds the existing account for this Google email (linking the Google ID
    onto it if it isn't already), or creates a new one. Google has already
    verified the email address, so a new account skips the OTP step
    entirely and starts with no password — signing in still works the same
    way via Google, and they can set a password later via "forgot password"
    if they ever want the option. */
async function findOrCreateGoogleUser(profile) {
  const email = String(profile.email || '').trim().toLowerCase();
  const user = await users.getUserByEmail(email);

  if (user) {
    if (!user.googleId) {
      return users.updateUser(user.id, { googleId: profile.googleId });
    }
    return user;
  }

  return users.createUser({
    id: Date.now(),
    name: profile.name || 'Customer',
    email,
    password: null,
    role: 'client',
    otp: '',
    otpVerified: true,
    googleId: profile.googleId
  });
}

module.exports = {
  COOKIE_NAME,
  createSession,
  destroySession,
  getCurrentUser,
  safeUser,
  attachUser,
  requireUser,
  requireAdmin,
  findOrCreateGoogleUser
};
