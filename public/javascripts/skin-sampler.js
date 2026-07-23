/* Shared face-detection + skin-sampling core, used by both the shade
   matcher page (capture -> rank against the catalog) and the profile
   page (capture -> save as a seasonal reading). Keeping this in one place
   means both pages get the exact same detection/sampling behavior instead
   of two copies drifting apart.

   Requires (loaded by the page before this file):
     - face-api.js (CDN <script>, exposes window.faceapi)
     - color-science.js (exposes window.ColorScience)

   Everything here runs in the browser — no image or pixel data leaves
   the page. */
(function () {
  'use strict';

  var CS = window.ColorScience;

  /* face-api.js model files — the tiny detector (~190KB) + 68-point landmark
     net (~350KB). Loaded from face-api.js's own model repo via jsdelivr for
     a working demo with zero setup. For production, download these two
     model's files into /public/models and point MODEL_URL at '/models'
     instead, so you're not depending on a third-party CDN staying up. */
  var MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
  var modelsReady = null;

  function ensureModelsLoaded() {
    if (!modelsReady) {
      modelsReady = Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
      ]);
    }
    return modelsReady;
  }

  /* 68-point landmark layout (dlib/ibug standard):
       0-16  jaw, 17-21 right eyebrow, 22-26 left eyebrow, 27-35 nose,
       36-41 right eye, 42-47 left eye, 48-67 mouth.
     There's no forehead point in this model, so we approximate two cheek
     sample centers: for each side, blend the eye's outer-corner x with the
     jaw's x (giving an x position under the eye, toward that side), and
     blend the nose-base y with the jaw y (giving a y position at roughly
     cheek height, between the nose and jawline). It's an approximation —
     swap to MediaPipe Face Mesh (478 points, including forehead) if you
     want tighter, more precise regions later. */
  function cheekSampleCenters(points) {
    var rightEyeOuter = points[36];
    var leftEyeOuter = points[45];
    var jawRight = points[2];
    var jawLeft = points[14];
    var noseBase = points[33];

    return [
      { x: (rightEyeOuter.x + jawRight.x) / 2, y: (noseBase.y + jawRight.y) / 2 },
      { x: (leftEyeOuter.x + jawLeft.x) / 2, y: (noseBase.y + jawLeft.y) / 2 }
    ];
  }

  /* Average RGB within a square patch, trimming the 10% of pixels furthest
     from the initial mean — cheap protection against a stray highlight,
     shadow, or hair strand skewing the sample. */
  function sampleRegionColor(ctx, cx, cy, size) {
    var half = size / 2;
    var x = Math.max(0, Math.round(cx - half));
    var y = Math.max(0, Math.round(cy - half));
    var w = Math.min(size, ctx.canvas.width - x);
    var h = Math.min(size, ctx.canvas.height - y);
    if (w <= 0 || h <= 0) return null;

    var data = ctx.getImageData(x, y, w, h).data;
    var pixels = [];
    for (var i = 0; i < data.length; i += 4) {
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
    if (!pixels.length) return null;

    var mean = pixels.reduce(function (acc, p) {
      acc.r += p.r; acc.g += p.g; acc.b += p.b;
      return acc;
    }, { r: 0, g: 0, b: 0 });
    mean.r /= pixels.length; mean.g /= pixels.length; mean.b /= pixels.length;

    var withDist = pixels.map(function (p) {
      var dr = p.r - mean.r, dg = p.g - mean.g, db = p.b - mean.b;
      return { p: p, d: dr * dr + dg * dg + db * db };
    }).sort(function (a, b) { return a.d - b.d; });

    var keep = withDist.slice(0, Math.ceil(withDist.length * 0.9));
    var trimmed = keep.reduce(function (acc, entry) {
      acc.r += entry.p.r; acc.g += entry.p.g; acc.b += entry.p.b;
      return acc;
    }, { r: 0, g: 0, b: 0 });

    return {
      r: trimmed.r / keep.length,
      g: trimmed.g / keep.length,
      b: trimmed.b / keep.length
    };
  }

  /* Points 48-59 of the 68-point layout trace the outer lip boundary (60-67
     are the inner boundary/mouth opening) — exactly the shape a "try it on"
     lip-color preview needs to clip to. Pulled from the same detection pass
     used for skin sampling, so previewing a shade never needs a second
     face-detection run. */
  function outerLipPoints(points) {
    return points.slice(48, 60);
  }

  /* Center point just below each eye's lower lid — where a concealer
     preview reads as "under-eye" rather than sitting on the eye itself. */
  function underEyeCenters(points) {
    var rightBottom = { x: (points[40].x + points[41].x) / 2, y: (points[40].y + points[41].y) / 2 };
    var leftBottom = { x: (points[46].x + points[47].x) / 2, y: (points[46].y + points[47].y) / 2 };
    var faceWidth = points[16].x - points[0].x;
    var dy = faceWidth * 0.07;
    return [
      { x: rightBottom.x, y: rightBottom.y + dy },
      { x: leftBottom.x, y: leftBottom.y + dy }
    ];
  }

  /* Runs detection + sampling on a canvas that already has a photo drawn
     to it. Resolves to one of:
       { ok: true, skinLab, lighting: 'ok' | 'dark' | 'bright',
         lipPoints, cheekCenters, underEyeCenters, faceBox, faceWidth }
       { ok: false, reason: 'no-face' | 'sampling-failed' | 'error', message }
     The extra geometry (beyond skinLab/lighting, which is all sampling ever
     needed before) is for the shade matcher's "try it on" preview — handing
     back ready-to-use points/box means shade-matcher.js never has to know
     the raw 68-point index layout itself. */
  function sampleFromCanvas(canvas) {
    return ensureModelsLoaded().then(function () {
      return faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
    }).then(function (detection) {
      if (!detection) {
        return { ok: false, reason: 'no-face', message: 'We couldn’t detect a face in that photo. Try a clearer, front-facing shot with more light.' };
      }

      var ctx = canvas.getContext('2d');
      var points = detection.landmarks.positions;
      var faceSize = detection.detection.box.width;
      var sampleSize = Math.max(12, Math.round(faceSize * 0.12));
      var cheekCenters = cheekSampleCenters(points);
      var samples = cheekCenters
        .map(function (c) { return sampleRegionColor(ctx, c.x, c.y, sampleSize); })
        .filter(Boolean);

      if (!samples.length) {
        return { ok: false, reason: 'sampling-failed', message: 'Couldn’t sample skin color from that photo — try a different angle.' };
      }

      var avg = samples.reduce(function (acc, s) {
        acc.r += s.r / samples.length;
        acc.g += s.g / samples.length;
        acc.b += s.b / samples.length;
        return acc;
      }, { r: 0, g: 0, b: 0 });

      var skinLab = CS.rgbToLab(avg.r, avg.g, avg.b);
      var lighting = skinLab.l < 30 ? 'dark' : skinLab.l > 88 ? 'bright' : 'ok';

      return {
        ok: true,
        skinLab: skinLab,
        lighting: lighting,
        lipPoints: outerLipPoints(points),
        cheekCenters: cheekCenters,
        underEyeCenters: underEyeCenters(points),
        faceBox: { x: detection.detection.box.x, y: detection.detection.box.y, width: detection.detection.box.width, height: detection.detection.box.height },
        faceWidth: points[16].x - points[0].x
      };
    }).catch(function (err) {
      console.error(err);
      return { ok: false, reason: 'error', message: 'Something went wrong analyzing that photo. Please try again.' };
    });
  }

  window.SkinSampler = {
    ensureModelsLoaded: ensureModelsLoaded,
    sampleFromCanvas: sampleFromCanvas
  };
})();
