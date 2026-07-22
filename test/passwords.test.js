const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../lib/passwords');

test('verifyPassword accepts the correct password against its own hash', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('correct horse battery staple', stored), true);
});

test('verifyPassword rejects a wrong password', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('wrong password', stored), false);
});

test('hashPassword salts each hash independently, even for the same password', () => {
  const a = hashPassword('same password');
  const b = hashPassword('same password');
  assert.notEqual(a, b);
});

test('verifyPassword rejects malformed/legacy stored values instead of throwing', () => {
  assert.equal(verifyPassword('anything', 'plaintext-not-a-hash'), false);
  assert.equal(verifyPassword('anything', null), false);
  assert.equal(verifyPassword('anything', undefined), false);
});
