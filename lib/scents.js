'use strict';

/* Shared scent-family taxonomy — used to (a) tag fragrance products in the
   admin panel, (b) validate that data server-side, and (c) score the
   fragrance quiz's answers against the catalog. One source of truth so a
   product's tags and a quiz answer's tags always mean the same thing. */
const SCENT_FAMILIES = [
  { id: 'floral', label: 'Floral' },
  { id: 'woody', label: 'Woody' },
  { id: 'citrus', label: 'Citrus' },
  { id: 'amber', label: 'Amber & Spice' },
  { id: 'fresh', label: 'Fresh & Aquatic' },
  { id: 'gourmand', label: 'Gourmand & Sweet' }
];

module.exports = { SCENT_FAMILIES };
