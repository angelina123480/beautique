'use strict';

const { sql } = require('./db');

async function getMessages() {
  return sql`select id, name, email, message, reply, replied_at as "repliedAt", created_at as "createdAt"
    from messages order by created_at desc`;
}

async function getMessageById(id) {
  const rows = await sql`select id, name, email, message, reply, replied_at as "repliedAt", created_at as "createdAt"
    from messages where id = ${id}`;
  return rows[0] || null;
}

async function createMessage({ id, name, email, message }) {
  const rows = await sql`
    insert into messages (id, name, email, message)
    values (${id}, ${name}, ${email}, ${message})
    returning id, name, email, message, reply, replied_at as "repliedAt", created_at as "createdAt"
  `;
  return rows[0];
}

async function deleteMessage(id) {
  await sql`delete from messages where id = ${id}`;
}

async function replyToMessage(id, reply) {
  const rows = await sql`
    update messages set reply = ${reply}, replied_at = now()
    where id = ${id}
    returning id, name, email, message, reply, replied_at as "repliedAt", created_at as "createdAt"
  `;
  return rows[0] || null;
}

module.exports = { getMessages, getMessageById, createMessage, deleteMessage, replyToMessage };
