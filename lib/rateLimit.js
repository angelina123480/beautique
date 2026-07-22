'use strict';

/**
 * DB-backed rate limiting for auth endpoints (signin, OTP verification,
 * password reset). An in-memory counter would not work reliably here —
 * Vercel runs this app as serverless functions across multiple cold
 * instances that share no memory, so a counter kept in a variable resets
 * (or is simply absent) on the next invocation. Postgres is the one thing
 * every instance actually shares.
 */

const { sql } = require('./db');

/** Records one attempt against `key` (e.g. "signin:email:a@b.com"). */
async function recordAttempt(key) {
  await sql`insert into auth_attempts (key) values (${key})`;
}

/** True if `key` has hit `max` recorded attempts within the last `windowMs`. */
async function isLimited(key, { max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const [{ count }] = await sql`
    select count(*) from auth_attempts where key = ${key} and created_at > ${since}
  `;
  return Number(count) >= max;
}

/** Clears a key's attempt history — called after a successful auth so a
    legitimate user who mistyped a couple of times isn't left locked out. */
async function clearAttempts(key) {
  await sql`delete from auth_attempts where key = ${key}`;
}

module.exports = { recordAttempt, isLimited, clearAttempts };
