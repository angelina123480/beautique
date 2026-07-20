'use strict';

/**
 * Image uploads — same dual-backend idea as lib/store.js:
 *
 *  - Local dev (no BLOB_READ_WRITE_TOKEN set): files are written straight
 *    into public/img/products/, exactly like the photos added by hand
 *    throughout this project.
 *  - Production on Vercel: Vercel's filesystem is read-only, so uploads
 *    instead go to Vercel Blob and we return its public URL.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'public', 'img', 'products');

const ALLOWED_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function extensionFor(mimetype, originalName) {
  if (ALLOWED_EXTENSIONS[mimetype]) {
    return ALLOWED_EXTENSIONS[mimetype];
  }
  const ext = path.extname(originalName || '').toLowerCase();
  return /^\.(jpe?g|png|webp|gif)$/.test(ext) ? ext : '.jpg';
}

/** Saves an uploaded image buffer and returns the URL it's reachable at. */
async function saveUpload(buffer, originalName, mimetype) {
  const filename = crypto.randomBytes(8).toString('hex') + extensionFor(mimetype, originalName);

  if (useBlob()) {
    const { put } = require('@vercel/blob');
    const blob = await put('products/' + filename, buffer, {
      access: 'public',
      addRandomSuffix: false
    });
    return blob.url;
  }

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  fs.writeFileSync(path.join(uploadDir, filename), buffer);
  return '/img/products/' + filename;
}

module.exports = { saveUpload, useBlob };
