'use strict';

/* Shared skin-goal taxonomy — used to (a) tag skincare products in the
   admin panel, (b) validate that data server-side, and (c) score the
   skincare quiz's answers against the catalog. Mirrors lib/scents.js. */
const SKIN_GOALS = [
  { id: 'hydration', label: 'Hydration' },
  { id: 'anti-aging', label: 'Anti-Aging & Firmness' },
  { id: 'glow', label: 'Glow & Radiance' },
  { id: 'soothing', label: 'Soothing & Sensitive' },
  { id: 'clarifying', label: 'Clarifying & Oil Control' },
  { id: 'brightening', label: 'Brightening & Even Tone' }
];

module.exports = { SKIN_GOALS };
