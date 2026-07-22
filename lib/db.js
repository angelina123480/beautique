'use strict';

/* Shared Postgres (Neon) connection. app.js loads .env into process.env
   before requiring anything under lib/, so DATABASE_URL is already set by
   the time a real query runs.

   The connection itself is created lazily (on first actual use) rather than
   at require-time — modules like lib/products.js pull in lib/db.js just to
   get `sql`, but plenty of pure logic (e.g. lib/catalog.js's normalizeShades)
   never touches the database at all. Eagerly calling neon() here meant even
   those pure-function tests needed a real DATABASE_URL just to import the
   module. */
let _sql = null;
function getSql() {
  if (!_sql) {
    _sql = require('@neondatabase/serverless').neon(process.env.DATABASE_URL);
  }
  return _sql;
}

const sql = new Proxy(function () {}, {
  apply(target, thisArg, args) {
    return getSql()(...args);
  },
  get(target, prop) {
    return getSql()[prop];
  }
});

module.exports = { sql };
