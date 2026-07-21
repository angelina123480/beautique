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

  /* Runs detection + sampling on a canvas that already has a photo drawn
     to it. Resolves to one of:
       { ok: true, skinLab, lighting: 'ok' | 'dark' | 'bright' }
       { ok: false, reason: 'no-face' | 'sampling-failed' | 'error', message } */
  function sampleFromCanvas(canvas) {
    return ensureModelsLoaded().then(function () {
      return faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
    }).then(function (detection) {
      if (!detection) {
        return { ok: false, reason: 'no-face', message: 'We couldn’t detect a face in that photo. Try a clearer, front-facing shot with more light.' };
      }

      var ctx = canvas.getContext('2d');
      var faceSize = detection.detection.box.width;
      var sampleSize = Math.max(12, Math.round(faceSize * 0.12));
      var centers = cheekSampleCenters(detection.landmarks.positions);
      var samples = centers
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

      return { ok: true, skinLab: skinLab, lighting: lighting };
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
