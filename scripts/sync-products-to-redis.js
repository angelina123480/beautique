'use strict';

/**
 * One-time (or run-whenever-you-like) sync: pushes your local data/products.json
 * and data/categories.json up to production Upstash Redis, using the exact same
 * key shape lib/store.js already reads/writes (see FILES map there).
 *
 * Scoped to products + categories on purpose — never touches users/orders/
 * sessions, so it can't clobber real customer accounts or order history.
 *
 * Usage:
 *   1. Get production credentials without pasting secrets into chat:
 *        npx vercel env pull .env.production
 *      (requires being logged into the Vercel account/project via `vercel login`)
 *   2. Run this script pointed at that file:
 *        node -r dotenv/config scripts/sync-products-to-redis.js dotenv_config_path=.env.production
 *      or just export UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *      (or KV_REST_API_URL / KV_REST_API_TOKEN) in your shell first, then:
 *        node scripts/sync-products-to-redis.js
 */

const fs = require('fs');
const path = require('path');
const { Redis } = require('@upstash/redis');

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.error('Missing Upstash credentials. Set UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN) and try again.');
  console.error('Get them without typing secrets into chat: npx vercel env pull .env.production');
  process.exit(1);
}

const redis = new Redis({ url, token });

async function syncCollection(name, fileName) {
  const filePath = path.join(__dirname, '..', 'data', fileName);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  await redis.set(name, data);
  console.log('Synced ' + name + ': ' + data.length + ' records.');
}

async function main() {
  await syncCollection('products', 'products.json');
  await syncCollection('categories', 'categories.json');
  console.log('Done. Production Redis now matches your local catalog.');
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
