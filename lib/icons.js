'use strict';

/* Minimal inline SVG icon set — replaces emoji used as functional UI chrome.
   Kept as plain strings (no build step) so both the server (via app.locals.icon)
   and the browser (public/javascripts/icons.js) can render identical markup. */

const ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const icons = {
  heart: `<svg ${ATTRS}><path d="M12 20.3c-.3 0-.6-.1-.8-.3C7.6 17 4 13.6 4 9.8 4 7 6.2 5 8.7 5c1.4 0 2.7.7 3.3 1.8C12.6 5.7 13.9 5 15.3 5 17.8 5 20 7 20 9.8c0 3.8-3.6 7.2-7.2 10.2-.2.2-.5.3-.8.3z"/></svg>`,
  bag: `<svg ${ATTRS}><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`,
  user: `<svg ${ATTRS}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.5 4-5.5 7-5.5s5.8 2 7 5.5"/></svg>`,
  menu: `<svg ${ATTRS}><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`,
  close: `<svg ${ATTRS}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`,
  search: `<svg ${ATTRS}><circle cx="11" cy="11" r="6.5"/><line x1="20" y1="20" x2="15.8" y2="15.8"/></svg>`,
  pin: `<svg ${ATTRS}><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/></svg>`,
  phone: `<svg ${ATTRS}><path d="M5 4.5h3.2l1.3 3.6-1.8 1.7a10.5 10.5 0 0 0 5.5 5.5l1.7-1.8 3.6 1.3V18a1.5 1.5 0 0 1-1.6 1.5C10.8 18.7 5.3 13.2 4.5 6.6A1.5 1.5 0 0 1 5 4.5z"/></svg>`,
  mail: `<svg ${ATTRS}><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 6.5l8 6 8-6"/></svg>`,
  lock: `<svg ${ATTRS}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>`,
  card: `<svg ${ATTRS}><rect x="3" y="5.5" width="18" height="13" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>`,
  box: `<svg ${ATTRS}><path d="M3.5 8l8.5-4 8.5 4-8.5 4-8.5-4z"/><path d="M3.5 8v8l8.5 4 8.5-4V8"/><line x1="12" y1="12" x2="12" y2="20"/></svg>`,
  leaf: `<svg ${ATTRS}><path d="M5 19c9 0 14-5 14-14-9 0-14 5-14 14z"/><path d="M5 19c0-5 2.5-8.5 6-10.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  alert: `<svg ${ATTRS}><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
  message: `<svg ${ATTRS}><path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3.3V16.5H4.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/></svg>`,
  eye: `<svg ${ATTRS}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>`,
  eyeOff: `<svg ${ATTRS}><path d="M3 3l18 18"/><path d="M10.6 5.7A9.4 9.4 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a15.6 15.6 0 0 1-3.4 4.2M6.6 6.6C4 8.3 2 12 2 12s3.5 6.5 10 6.5c1.4 0 2.6-.3 3.7-.8"/><path d="M9.5 10a2.6 2.6 0 0 0 3.6 3.6"/></svg>`,
  map: `<svg ${ATTRS}><path d="M9 4.5L4 6.5v13l5-2 6 2 5-2v-13l-5 2-6-2z"/><line x1="9" y1="4.5" x2="9" y2="17.5"/><line x1="15" y1="6.5" x2="15" y2="19.5"/></svg>`,
  crosshair: `<svg ${ATTRS}><circle cx="12" cy="12" r="7"/><line x1="12" y1="2" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="22"/><line x1="2" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="22" y2="12"/></svg>`,
  lipstick: `<svg ${ATTRS}><rect x="9" y="3" width="6" height="3.5" rx="1"/><path d="M9.3 6.5h5.4l-.9 12.3a1.3 1.3 0 0 1-1.3 1.2h-1a1.3 1.3 0 0 1-1.3-1.2L9.3 6.5z"/></svg>`,
  droplet: `<svg ${ATTRS}><path d="M12 3.5c2.8 3.6 6 8.3 6 11.5a6 6 0 0 1-12 0c0-3.2 3.2-7.9 6-11.5z"/></svg>`,
  perfume: `<svg ${ATTRS}><path d="M10.5 3h3v2h-3z"/><rect x="9.5" y="5" width="5" height="2.5" rx="0.6"/><path d="M8.5 7.5h7l.8 11a1.5 1.5 0 0 1-1.5 1.5h-5.6a1.5 1.5 0 0 1-1.5-1.5l.8-11z"/><line x1="8.8" y1="12" x2="15.2" y2="12"/></svg>`,
  bottle: `<svg ${ATTRS}><rect x="9" y="3" width="6" height="3" rx="1"/><path d="M8 6h8l1 13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 8.5 19L8 6z"/><line x1="8.3" y1="10" x2="15.7" y2="10"/></svg>`,
  star: `<svg ${ATTRS}><path d="M12 3l2.5 5.6 6 .6-4.5 4 1.3 6-5.3-3-5.3 3 1.3-6-4.5-4 6-.6L12 3z"/></svg>`
};

module.exports = icons;
