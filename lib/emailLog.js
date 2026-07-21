'use strict';

const { sql } = require('./db');

async function logEmail({ id, type, to, subject, variant, delivered }) {
  const rows = await sql`
    insert into email_log (id, type, to_email, subject, variant, delivered)
    values (${id}, ${type}, ${to}, ${subject || ''}, ${variant || ''}, ${Boolean(delivered)})
    returning id, type, to_email as "to", subject, variant, delivered, created_at as "createdAt"
  `;
  return rows[0];
}

module.exports = { logEmail };
