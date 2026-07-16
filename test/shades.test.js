const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeShades, getSelectedShade } = require('../lib/catalog');

test('normalizeShades turns simple shade values into rich objects', () => {
  const shades = normalizeShades(['Rose Nude', { name: 'Berry', color: '#b33a6b' }]);

  assert.deepEqual(shades, [
    { name: 'Rose Nude', label: 'Rose Nude', color: '#d9a08b' },
    { name: 'Berry', label: 'Berry', color: '#b33a6b' }
  ]);
});

test('getSelectedShade picks the first shade by default', () => {
  const shades = normalizeShades(['Rose Nude', 'Soft Mauve']);
  const selected = getSelectedShade(shades);

  assert.equal(selected.name, 'Rose Nude');
});
