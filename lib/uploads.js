'use strict';

/**
 * Image uploads — same dual-backend idea as lib/store.js:
 *
 *  - Local dev (no Blob store connected): files are written straight into
 *    public/img/products/, exactly like the photos added by hand throughout
 *    this project.
 *  - Production on Vercel: Vercel's filesystem is read-only, so uploads
 *    instead go to Vercel Blob and we return its public URL. A connected
 *    Blob store shows up either as BLOB_READ_WRITE_TOKEN (classic token
 *    auth) or BLOB_STORE_ID (newer OIDC-based auth, where @vercel/blob
 *    resolves credentials itself from the ambient VERCEL_OIDC_TOKEN) —
 *    accept either so this works regardless of which one Vercel set up.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'public', 'img', 'products');

const ALLOWED_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};

function useBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function extensionFor(mimetype, originalName) {
  if (ALLOWED_EXTENSIONS[mimetype]) {
    return ALLOWED_EXTENSIONS[mimetype];
  }
  const ext = path.extname(originalName || '').toLowerCase();
  return /^\.(jpe?g|png|webp|gif|mp4|webm)$/.test(ext) ? ext : '.jpg';
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
