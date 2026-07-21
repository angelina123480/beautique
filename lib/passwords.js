'use strict';

const crypto = require('crypto');

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

module.exports = { hashPassword, verifyPassword };
