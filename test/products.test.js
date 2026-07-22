const test = require('node:test');
const assert = require('node:assert/strict');
const { mapProduct, mapShade } = require('../lib/products');

const baseRow = {
  id: 1, name: 'Velvet Satin Lip', brand: 'Luna', price: 24, sale_price: null,
  badge: '', emoji: '💄', category: 'makeup', tone: 340, description: 'A lipstick.',
  stock: 7, sold_out: false, images: [], scent_family: [], skin_goals: [], wink_map: {}
};

test('mapShade reports soldOut based on its own stock', () => {
  assert.equal(mapShade({ name: 'Rose', label: 'Rose', color: '#c98374', images: [], stock: 0 }).soldOut, true);
  assert.equal(mapShade({ name: 'Rose', label: 'Rose', color: '#c98374', images: [], stock: 2 }).soldOut, false);
});

test('mapProduct falls back to products.stock/sold_out when the product has no shades', () => {
  const product = mapProduct(baseRow, [], []);
  assert.equal(product.stock, 7);
  assert.equal(product.soldOut, false);
});

test('mapProduct derives stock as the sum of shade stock when shades exist, ignoring products.stock', () => {
  const shades = [
    { name: 'Rose', label: 'Rose', color: '#c98374', images: [], stock: 3 },
    { name: 'Berry', label: 'Berry', color: '#8c3a4f', images: [], stock: 0 }
  ];
  const product = mapProduct({ ...baseRow, stock: 999, sold_out: true }, shades, []);

  assert.equal(product.stock, 3);
  assert.equal(product.soldOut, false);
});

test('mapProduct with shades is sold out only once every shade is at 0 stock', () => {
  const shades = [
    { name: 'Rose', label: 'Rose', color: '#c98374', images: [], stock: 0 },
    { name: 'Berry', label: 'Berry', color: '#8c3a4f', images: [], stock: 0 }
  ];
  const product = mapProduct(baseRow, shades, []);

  assert.equal(product.stock, 0);
  assert.equal(product.soldOut, true);
});

test('mapProduct returns null for a missing row', () => {
  assert.equal(mapProduct(null, [], []), null);
});
