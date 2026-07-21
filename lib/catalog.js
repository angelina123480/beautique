'use strict';

const products = require('./products');
const orders = require('./orders');

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
  const salePrice = (typeof product.salePrice === 'number' && product.salePrice > 0 && product.salePrice < product.price)
    ? product.salePrice
    : null;
  return Object.assign({}, product, {
    rating: reviewCount ? Math.round((sum / reviewCount) * 10) / 10 : 0,
    reviewCount,
    available: !product.soldOut && product.stock > 0,
    shades: normalizeShades(product.shades),
    selectedShade: getSelectedShade(product.shades),
    onSale: salePrice !== null,
    salePrice,
    discountPercent: salePrice !== null ? Math.round((1 - salePrice / product.price) * 100) : 0,
    effectivePrice: salePrice !== null ? salePrice : product.price
  });
}

async function getProducts() {
  return (await products.getAllProducts()).map(decorate);
}

async function findProduct(id) {
  const product = await products.getProductById(Number(id));
  return product ? decorate(product) : null;
}

async function relatedProducts(product, limit) {
  const products = (await getProducts()).filter((item) => item.id !== product.id);
  const sameCategory = products.filter((item) => item.category === product.category);
  const rest = products.filter((item) => item.category !== product.category);
  return sameCategory.concat(rest).slice(0, limit || 3);
}

/** Products most often bought alongside this one, ranked by co-purchase count. */
async function frequentlyBoughtWith(product, limit) {
  const activeOrders = await orders.getActiveOrders();
  const counts = new Map();

  activeOrders.forEach((order) => {
    const items = order.items || [];
    if (!items.some((item) => item.productId === product.id)) {
      return;
    }
    items.forEach((item) => {
      if (item.productId == null || item.productId === product.id) {
        return;
      }
      counts.set(item.productId, (counts.get(item.productId) || 0) + 1);
    });
  });

  if (!counts.size) {
    return [];
  }

  const byId = new Map((await getProducts()).map((item) => [item.id, item]));

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([productId]) => byId.get(productId))
    .filter(Boolean)
    .slice(0, limit || 4);
}

module.exports = {
  decorate,
  getProducts,
  findProduct,
  relatedProducts,
  frequentlyBoughtWith,
  normalizeShades,
  getSelectedShade
};
