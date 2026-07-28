'use strict';

const { sql } = require('./db');

function mapSettings(row) {
  return {
    logoUrl: (row && row.logo_url) || '/img/logo.png',
    heroVideoUrl: (row && row.hero_video_url) || null,
    heroVideoProductId: row && row.hero_video_product_id !== null ? Number(row.hero_video_product_id) : null,
    heroVideoPositionX: row && row.hero_video_position_x !== null && row.hero_video_position_x !== undefined ? Number(row.hero_video_position_x) : 50,
    heroVideoPositionY: row && row.hero_video_position_y !== null && row.hero_video_position_y !== undefined ? Number(row.hero_video_position_y) : 50,
    heroVideoZoom: row && row.hero_video_zoom !== null && row.hero_video_zoom !== undefined ? Number(row.hero_video_zoom) : 1
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
  const heroVideoPositionX = fields.heroVideoPositionX !== undefined ? fields.heroVideoPositionX : current.heroVideoPositionX;
  const heroVideoPositionY = fields.heroVideoPositionY !== undefined ? fields.heroVideoPositionY : current.heroVideoPositionY;
  const heroVideoZoom = fields.heroVideoZoom !== undefined ? fields.heroVideoZoom : current.heroVideoZoom;

  await sql`
    update site_settings set
      logo_url = ${logoUrl},
      hero_video_url = ${heroVideoUrl},
      hero_video_product_id = ${heroVideoProductId},
      hero_video_position_x = ${heroVideoPositionX},
      hero_video_position_y = ${heroVideoPositionY},
      hero_video_zoom = ${heroVideoZoom}
    where id = 1
  `;
  return getSettings();
}

module.exports = { getSettings, updateSettings };
