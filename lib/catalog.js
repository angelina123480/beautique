'use strict';

const store = require('./store');

function normalizeShades(shades) {
  if (!Array.isArray(shades) || !shades.length) {
    return [];
  }

  return shades.map((shade) => {
    if (typeof shade === 'string') {
      return { name: shade, label: shade, color: '#d9a08b', images: [], tintPhotos: false };
    }
    if (shade && typeof shade === 'object') {
      let images = [];
      if (Array.isArray(shade.images)) {
        images = shade.images.map(String).map((value) => value.trim()).filter(Boolean);
      } else if (shade.image) {
        images = [String(shade.image).trim()].filter(Boolean);
      }
      return {
        name: String(shade.name || '').trim() || 'Shade',
        label: String(shade.label || shade.name || '').trim() || 'Shade',
        color: String(shade.color || '').trim() || '#d9a08b',
        images,
        tintPhotos: Boolean(shade.tintPhotos)
      };
    }
    return { name: String(shade || '').trim() || 'Shade', label: String(shade || '').trim() || 'Shade', color: '#d9a08b', images: [], tintPhotos: false };
  });
}

function getSelectedShade(shades) {
  const normalized = normalizeShades(shades);
  return normalized[0] || null;
}

/** Adds derived, display-ready fields to a raw product record. */
function decorate(product) {
  const reviews = Array.isArray(product.reviews) ? product.reviews : [];
  const reviewCount = reviews.length;
  const sum = reviews.reduce((acc, review) => acc + (Number(review.rating) || 0), 0);
  return Object.assign({}, product, {
    rating: reviewCount ? Math.round((sum / reviewCount) * 10) / 10 : 0,
    reviewCount,
    available: !product.soldOut && product.stock > 0,
    shades: normalizeShades(product.shades),
    selectedShade: getSelectedShade(product.shades)
  });
}

async function getProducts() {
  return (await store.read('products')).map(decorate);
}

async function findProduct(id) {
  const product = (await store.read('products')).find((item) => item.id === Number(id));
  return product ? decorate(product) : null;
}

async function relatedProducts(product, limit) {
  const products = (await getProducts()).filter((item) => item.id !== product.id);
  const sameCategory = products.filter((item) => item.category === product.category);
  const rest = products.filter((item) => item.category !== product.category);
  return sameCategory.concat(rest).slice(0, limit || 3);
}

module.exports = {
  decorate,
  getProducts,
  findProduct,
  relatedProducts,
  normalizeShades,
  getSelectedShade
};
