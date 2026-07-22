const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeShades, getSelectedShade } = require('../lib/catalog');

test('normalizeShades turns simple shade values into rich objects', () => {
  const shades = normalizeShades(['Rose Nude', { name: 'Berry', color: '#b33a6b' }]);

  assert.deepEqual(shades, [
    { name: 'Rose Nude', label: 'Rose Nude', color: '#d9a08b', images: [], stock: 0, soldOut: true },
    { name: 'Berry', label: 'Berry', color: '#b33a6b', images: [], stock: 0, soldOut: true }
  ]);
});

test('normalizeShades derives soldOut from stock when not given explicitly', () => {
  const shades = normalizeShades([{ name: 'Berry', color: '#b33a6b', stock: 3 }]);
  assert.equal(shades[0].stock, 3);
  assert.equal(shades[0].soldOut, false);
});

test('normalizeShades respects an explicit soldOut override even with stock left', () => {
  const shades = normalizeShades([{ name: 'Berry', stock: 3, soldOut: true }]);
  assert.equal(shades[0].soldOut, true);
});

test('normalizeShades returns [] for anything that is not a non-empty array', () => {
  assert.deepEqual(normalizeShades(undefined), []);
  assert.deepEqual(normalizeShades([]), []);
});

test('getSelectedShade picks the first shade by default', () => {
  const shades = normalizeShades(['Rose Nude', 'Soft Mauve']);
  const selected = getSelectedShade(shades);

  assert.equal(selected.name, 'Rose Nude');
});

test('getSelectedShade skips a sold-out first shade in favor of one still in stock', () => {
  const shades = normalizeShades([
    { name: 'Rose Nude', stock: 0 },
    { name: 'Berry', stock: 5 }
  ]);

  assert.equal(getSelectedShade(shades).name, 'Berry');
});

test('getSelectedShade falls back to the first shade when every shade is sold out', () => {
  const shades = normalizeShades([
    { name: 'Rose Nude', stock: 0 },
    { name: 'Berry', stock: 0 }
  ]);

  assert.equal(getSelectedShade(shades).name, 'Rose Nude');
});

test('getSelectedShade returns null for a product with no shades', () => {
  assert.equal(getSelectedShade([]), null);
});
