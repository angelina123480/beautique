'use strict';

const { sql } = require('./db');

function mapSettings(row) {
  return {
    logoUrl: (row && row.logo_url) || '/img/logo.png',
    heroVideoUrl: (row && row.hero_video_url) || null,
    heroVideoProductId: row && row.hero_video_product_id !== null ? Number(row.hero_video_product_id) : null
  };
}

async function getSettings() {
  const [row] = await sql`select * from site_settings where id = 1`;
  return mapSettings(row);
}

/* Same "recompute everything, write it all back" shape used elsewhere in
   this app (see lib/products.js) — reads the current row, applies whatever
   fields were actually passed, and writes the full row back. */
async function updateSettings(fields) {
  const current = await getSettings();
  const logoUrl = fields.logoUrl !== undefined ? fields.logoUrl : current.logoUrl;
  const heroVideoUrl = fields.heroVideoUrl !== undefined ? fields.heroVideoUrl : current.heroVideoUrl;
  const heroVideoProductId = fields.heroVideoProductId !== undefined ? fields.heroVideoProductId : current.heroVideoProductId;

  await sql`
    update site_settings set
      logo_url = ${logoUrl},
      hero_video_url = ${heroVideoUrl},
      hero_video_product_id = ${heroVideoProductId}
    where id = 1
  `;
  return getSettings();
}

module.exports = { getSettings, updateSettings };
