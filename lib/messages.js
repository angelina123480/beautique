'use strict';

const { sql } = require('./db');

async function getMessages() {
  return sql`select id, name, email, message, created_at as "createdAt"
    from messages order by created_at desc`;
}

async function createMessage({ id, name, email, message }) {
  const rows = await sql`
    insert into messages (id, name, email, message)
    values (${id}, ${name}, ${email}, ${message})
    returning id, name, email, message, created_at as "createdAt"
  `;
  return rows[0];
}

module.exports = { getMessages, createMessage };
