'use strict';

/* Shared Postgres (Neon) connection. app.js loads .env into process.env
   before requiring anything under lib/, so DATABASE_URL is already set by
   the time this runs. */

const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

module.exports = { sql };
