/**
 * Route-level integration tests — start the real Express app (the same
 * module bin/www boots) on an ephemeral port and hit it over real HTTP,
 * rather than calling handler functions directly.
 *
 * Tests that only need the auth layer run unconditionally: requireUser /
 * requireAdmin reject an unauthenticated request before ever touching the
 * database (see lib/auth.js's getCurrentUser — no cookie means no DB call),
 * so those are safe to run with no DATABASE_URL at all, which is what makes
 * `npm test` safe to wire into CI without provisioning a database secret.
 *
 * Tests that need real data (e.g. reading the product catalog) are skipped
 * when DATABASE_URL isn't set, so this suite still passes in an environment
 * with no database configured.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../app');

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = 'http://localhost:' + server.address().port;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('every response carries the baseline security headers', async () => {
  const res = await fetch(baseUrl + '/');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('an unknown route renders a 404 instead of crashing', async () => {
  const res = await fetch(baseUrl + '/this-page-does-not-exist');
  assert.equal(res.status, 404);
});

test('requireUser rejects an unauthenticated request with 401 (no session cookie)', async () => {
  const res = await fetch(baseUrl + '/api/orders');
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('requireAdmin rejects a non-admin (unauthenticated) request with 403', async () => {
  const res = await fetch(baseUrl + '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', brand: 'x', price: 1, description: 'x' })
  });
  assert.equal(res.status, 403);
});

test('malformed JSON body is rejected with a 4xx, not a 500', async () => {
  const res = await fetch(baseUrl + '/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json'
  });
  assert.ok(res.status >= 400 && res.status < 500, 'expected a 4xx, got ' + res.status);
});

test('GET /api/products returns the real catalog', { skip: !process.env.DATABASE_URL }, async () => {
  const res = await fetch(baseUrl + '/api/products');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.products) && body.products.length > 0);
});

test('signin is rate-limited after repeated failures, end to end', { skip: !process.env.DATABASE_URL }, async (t) => {
  const email = 'integration-test-ratelimit-http@example.com';
  const { sql } = require('../lib/db');
  // Cleans up both the email-keyed rows this test created and the
  // IP-keyed ones recorded alongside them (see routes/api.js's signin
  // handler, which records both per attempt).
  t.after(async () => {
    await sql`delete from auth_attempts where key like '%' || ${email} || '%' or key like 'signin:ip:%'`;
  });

  let lastStatus;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(baseUrl + '/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' })
    });
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429);
});
