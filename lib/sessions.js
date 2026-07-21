'use strict';

const crypto = require('crypto');
const { sql } = require('./db');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, ${expiresAt})`;
  // Opportunistic cleanup — same "prune on write" approach the JSON store used.
  await sql`delete from sessions where expires_at <= now()`;
  return token;
}

async function destroySession(token) {
  await sql`delete from sessions where token = ${token}`;
}

/* Returns { token, userId, expiresAt } for a live (non-expired) session, or
   null. userId comes back cast to a JS number — Postgres BIGINT columns are
   returned as strings by this driver, which would silently fail strict
   equality against the plain-number ids used everywhere else in the app. */
async function getSession(token) {
  const rows = await sql`select token, user_id, expires_at as "expiresAt"
    from sessions where token = ${token} and expires_at > now()`;
  if (!rows[0]) return null;
  return { token: rows[0].token, userId: Number(rows[0].user_id), expiresAt: rows[0].expiresAt };
}

module.exports = { createSession, destroySession, getSession };
