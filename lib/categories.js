'use strict';

const { sql } = require('./db');

async function getCategories() {
  return sql`select id, title, emoji, tone, text from categories order by id`;
}

async function categoryExists(id) {
  const rows = await sql`select 1 from categories where id = ${id}`;
  return rows.length > 0;
}

async function createCategory(category) {
  const rows = await sql`
    insert into categories (id, title, emoji, tone, text)
    values (${category.id}, ${category.title}, ${category.emoji}, ${category.tone}, ${category.text})
    returning *
  `;
  return rows[0];
}

async function deleteCategory(id) {
  const rows = await sql`delete from categories where id = ${id} returning *`;
  return rows[0] || null;
}

/* Used by the admin "sync catalog to database" button — makes the table
   match whatever's currently in the repo's data/categories.json. Upserts
   rather than truncate+reinsert: products.category has a foreign key into
   this table, so truncating it while products reference existing rows
   would fail (or require CASCADE, which would wipe products too). */
async function replaceAllCategories(categories) {
  const incomingIds = categories.map((c) => c.id);
  for (const c of categories) {
    await sql`
      insert into categories (id, title, emoji, tone, text)
      values (${c.id}, ${c.title || ''}, ${c.emoji || ''}, ${c.tone || 0}, ${c.text || ''})
      on conflict (id) do update set
        title = excluded.title, emoji = excluded.emoji, tone = excluded.tone, text = excluded.text
    `;
  }
  // Drop any category that's no longer in the incoming set, as long as no
  // product still references it (same guard as the manual delete endpoint).
  await sql`
    delete from categories
    where not (id = any(${incomingIds}))
      and id not in (select distinct category from products)
  `;
}

module.exports = { getCategories, categoryExists, createCategory, deleteCategory, replaceAllCategories };
