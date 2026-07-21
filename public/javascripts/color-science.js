/* Color science helpers for the shade matcher.
   Pure functions, no DOM/browser API dependencies — kept in their own file
   so they're easy to unit-test or reuse (e.g. server-side, if you ever want
   to precompute LAB values for your catalog in Node instead of in-browser).

   Color pipeline: sRGB (0-255 per channel) -> linear RGB -> CIE XYZ -> CIE LAB.
   LAB is used (instead of comparing raw RGB) because it's designed so that
   Euclidean distance between two LAB points roughly tracks how different two
   colors look to a human eye — RGB distance does not have that property
   (e.g. a small RGB shift in blue is far more visible than the same shift in
   green, but plain RGB distance treats them as equal). */
(function () {
  'use strict';

  /** sRGB -> linear RGB channel (removes gamma correction). */
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  /** D65-reference-white XYZ, standard for sRGB. */
  function rgbToXyz(r, g, b) {
    const rl = srgbToLinear(r);
    const gl = srgbToLinear(g);
    const bl = srgbToLinear(b);
    return {
      x: rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
      y: rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750,
      z: rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041
    };
  }

  function xyzToLab(x, y, z) {
    // CIE standard illuminant D65 reference white.
    const REF = { x: 0.95047, y: 1.0, z: 1.08883 };
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116);
    const fx = f(x / REF.x);
    const fy = f(y / REF.y);
    const fz = f(z / REF.z);
    return {
      l: (116 * fy) - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  }

  /** sRGB (0-255 each) -> CIE LAB { l, a, b }. */
  function rgbToLab(r, g, b) {
    const xyz = rgbToXyz(r, g, b);
    return xyzToLab(xyz.x, xyz.y, xyz.z);
  }

  /** '#rrggbb' or 'rrggbb' -> { r, g, b } (0-255 each). */
  function hexToRgb(hex) {
    const clean = String(hex || '').replace('#', '');
    return {
      r: parseInt(clean.substr(0, 2), 16) || 0,
      g: parseInt(clean.substr(2, 2), 16) || 0,
      b: parseInt(clean.substr(4, 2), 16) || 0
    };
  }

  function hexToLab(hex) {
    const rgb = hexToRgb(hex);
    return rgbToLab(rgb.r, rgb.g, rgb.b);
  }

  /** CIE76 — plain Euclidean distance in LAB space. Simple, fast, decent. */
  function deltaE76(lab1, lab2) {
    const dl = lab1.l - lab2.l;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  /** CIE94 — weights a/b distance by chroma, closer to perceived difference
      than CIE76 (skin tones sit in a narrow, fairly saturated band where
      this matters). Uses the "graphic arts" reference weighting (kL=kC=kH=1). */
  function deltaE94(lab1, lab2) {
    const dl = lab1.l - lab2.l;
    const c1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
    const c2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);
    const dc = c1 - c2;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;
    const dhSq = Math.max(0, (da * da) + (db * db) - (dc * dc));

    const sl = 1;
    const sc = 1 + 0.045 * c1;
    const sh = 1 + 0.015 * c1;

    const termL = dl / sl;
    const termC = dc / sc;
    const termH = Math.sqrt(dhSq) / sh;
    return Math.sqrt(termL * termL + termC * termC + termH * termH);
  }

  window.ColorScience = {
    rgbToLab,
    hexToLab,
    hexToRgb,
    deltaE76,
    deltaE94
  };
})();
