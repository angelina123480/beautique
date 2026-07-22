'use strict';

/* Migration runner: applies any db/migrations/*.sql file not yet recorded
   in the schema_migrations table, in filename order. Safe to run any time —
   already-applied files are skipped.
   Usage: node db/migrate.js */

const fs = require('fs');
const path = require('path');

require('fs').readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
  const i = line.indexOf('=');
  if (i === -1 || line.trim().startsWith('#')) return;
  const key = line.slice(0, i).trim();
  const val = line.slice(i + 1).trim();
  if (process.env[key] === undefined) process.env[key] = val;
});

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const migrationsDir = path.join(__dirname, 'migrations');

function statementsIn(fileContents) {
  return fileContents
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function tableExists(name) {
  const rows = await sql`select 1 from information_schema.tables where table_schema = 'public' and table_name = ${name}`;
  return rows.length > 0;
}

async function main() {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set((await sql`select filename from schema_migrations`).map((r) => r.filename));

  /* Bootstrap case: this database already has the full schema applied by
     hand (from before this migrations system existed), so the very first
     migration must be marked applied without re-running it — its
     CREATE TABLE statements would fail against tables that already exist. */
  if (files.length && !applied.has(files[0]) && (await tableExists('categories'))) {
    console.log('Detected existing schema — marking', files[0], 'as already applied without running it.');
    await sql`insert into schema_migrations (filename) values (${files[0]})`;
    applied.add(files[0]);
  }

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) {
      console.log('skip (already applied):', file);
      continue;
    }
    console.log('applying:', file);
    const contents = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    for (const statement of statementsIn(contents)) {
      await sql.query(statement);
    }
    await sql`insert into schema_migrations (filename) values (${file})`;
    ranAny = true;
    console.log('  done.');
  }

  console.log(ranAny ? 'All migrations applied.' : 'Already up to date.');
}

main().catch((err) => {
  console.error('Migration FAILED:', err.message);
  process.exit(1);
});
