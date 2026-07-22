'use strict';

const { sql } = require('./db');

/* Maps a users-table row (+ its joined discount codes) to the same shape
   the rest of the app has always used (camelCase, discountCodes array). */
function mapUser(row, discountCodes) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role,
    phone: row.phone,
    address: row.address,
    otp: row.otp,
    otpExpires: row.otp_expires,
    otpVerified: row.otp_verified,
    resetOtp: row.reset_otp,
    resetOtpExpires: row.reset_otp_expires,
    googleId: row.google_id,
    rewardPoints: row.reward_points,
    lifetimePoints: row.lifetime_points,
    redeemedTiers: row.redeemed_tiers || [],
    discountCodes: (discountCodes || []).map((c) => ({
      code: c.code,
      discount: c.discount,
      tier: c.tier,
      createdAt: c.created_at,
      usedAt: c.used_at
    })),
    createdAt: row.created_at
  };
}

async function getDiscountCodes(userId) {
  return sql`select code, discount, tier, used_at, created_at from user_discount_codes
    where user_id = ${userId} order by created_at`;
}

async function getUserByEmail(email) {
  const rows = await sql`select * from users where lower(email) = lower(${email})`;
  if (!rows[0]) return null;
  return mapUser(rows[0], await getDiscountCodes(rows[0].id));
}

async function getUserById(id) {
  const rows = await sql`select * from users where id = ${id}`;
  if (!rows[0]) return null;
  return mapUser(rows[0], await getDiscountCodes(rows[0].id));
}

/* Lightweight list for admin stats (customer counts, filtering admin-owned
   orders out of revenue) — no discount-code join needed for that. */
async function getAllUsers() {
  const rows = await sql`select * from users`;
  return rows.map((row) => mapUser(row, []));
}

async function emailTaken(email, excludeId) {
  const rows = excludeId
    ? await sql`select 1 from users where lower(email) = lower(${email}) and id != ${excludeId}`
    : await sql`select 1 from users where lower(email) = lower(${email})`;
  return rows.length > 0;
}

async function createUser(user) {
  const rows = await sql`
    insert into users (id, name, email, password, role, phone, address, otp, otp_verified, google_id)
    values (${user.id}, ${user.name}, ${user.email}, ${user.password || null}, ${user.role || 'client'},
      ${user.phone || ''}, ${user.address || ''}, ${user.otp || ''}, ${Boolean(user.otpVerified)}, ${user.googleId || null})
    returning *
  `;
  return mapUser(rows[0], []);
}

const COLUMN_MAP = {
  name: 'name',
  email: 'email',
  password: 'password',
  role: 'role',
  phone: 'phone',
  address: 'address',
  otp: 'otp',
  otpExpires: 'otp_expires',
  otpVerified: 'otp_verified',
  resetOtp: 'reset_otp',
  resetOtpExpires: 'reset_otp_expires',
  googleId: 'google_id',
  rewardPoints: 'reward_points',
  lifetimePoints: 'lifetime_points',
  redeemedTiers: 'redeemed_tiers'
};

/* Generic partial update — every call site here only ever touches a handful
   of fields at a time (same pattern the old mutate-then-store.write('users')
   code used), so one whitelisted dynamic-SET function covers all of them
   instead of a dozen near-duplicate named updates.

   Returns the query un-awaited (or null if patch has nothing valid to write)
   so callers can either await it directly or fold it into an
   sql.transaction([...]) batch alongside other writes. */
function updateUserQuery(id, patch) {
  const keys = Object.keys(patch).filter((key) => COLUMN_MAP[key]);
  if (!keys.length) return null;

  const setClause = keys.map((key, i) => `${COLUMN_MAP[key]} = $${i + 2}`).join(', ');
  const values = keys.map((key) => (patch[key] === '' && key.endsWith('Expires')) ? null : patch[key]);
  return sql.query(`update users set ${setClause} where id = $1`, [id, ...values]);
}

async function updateUser(id, patch) {
  const query = updateUserQuery(id, patch);
  if (query) await query;
  return getUserById(id);
}

async function deleteUser(id) {
  await sql`delete from users where id = ${id}`;
}

async function countAdmins() {
  const [row] = await sql`select count(*) from users where role = 'admin'`;
  return Number(row.count);
}

async function getAdminUser() {
  const rows = await sql`select * from users where role = 'admin' limit 1`;
  return mapUser(rows[0], []);
}

function addDiscountCodeQuery(userId, code) {
  return sql`
    insert into user_discount_codes (user_id, code, discount, tier, created_at)
    values (${userId}, ${code.code}, ${code.discount}, ${code.tier}, ${code.createdAt || new Date().toISOString()})
  `;
}

async function addDiscountCode(userId, code) {
  await addDiscountCodeQuery(userId, code);
}

function setDiscountCodeUsedQuery(userId, code, usedAt) {
  return sql`update user_discount_codes set used_at = ${usedAt}
    where user_id = ${userId} and code = ${code}`;
}

async function setDiscountCodeUsed(userId, code, usedAt) {
  await setDiscountCodeUsedQuery(userId, code, usedAt);
}

module.exports = {
  getUserByEmail,
  getUserById,
  getAllUsers,
  emailTaken,
  createUser,
  updateUser,
  updateUserQuery,
  deleteUser,
  countAdmins,
  getAdminUser,
  addDiscountCode,
  addDiscountCodeQuery,
  setDiscountCodeUsed,
  setDiscountCodeUsedQuery
};
