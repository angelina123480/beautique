/* Shade matcher — face detection, skin sampling, and shade ranking.
   Requires (loaded by views/shade-matcher.ejs before this file):
     - face-api.js (CDN <script>, exposes window.faceapi)
     - color-science.js (exposes window.ColorScience)
     - window.SHADE_CATALOG — array of { productId, productName, shadeName, hex }

   Everything here runs in the browser. No image or pixel data ever leaves
   the page — detection, sampling, and matching all happen locally. */
(function () {
  'use strict';

  var B = window.Beautique;
  var page = B.$('#matcher-frame');
  if (!page) return;

  var CS = window.ColorScience;
  var CATALOG = (window.SHADE_CATALOG || []).map(function (shade) {
    return Object.assign({}, shade, { lab: CS.hexToLab(shade.hex) });
  });

  /* face-api.js model files — the tiny detector (~190KB) + 68-point landmark
     net (~350KB). Loaded from face-api.js's own model repo via jsdelivr for
     a working demo with zero setup. For production, download these two
     model's files into /public/models and point MODEL_URL at '/models'
     instead, so you're not depending on a third-party CDN staying up. */
  var MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

  var video = B.$('#matcher-video');
  var canvas = B.$('#matcher-canvas');
  var placeholder = B.$('#matcher-placeholder');
  var statusBox = B.$('#matcher-status');
  var resultsBox = B.$('#matcher-results');
  var webcamStartBtn = B.$('#matcher-webcam-start');
  var webcamCaptureBtn = B.$('#matcher-webcam-capture');
  var uploadBtn = B.$('#matcher-upload-btn');
  var fileInput = B.$('#matcher-file-input');
  var stream = null;
  var modelsReady = null;

  function setStatus(message, kind) {
    statusBox.textContent = message || '';
    statusBox.className = 'matcher-status' + (kind ? ' is-' + kind : '');
  }

  /* ---------------- Tabs ---------------- */

  B.$$('.matcher-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      B.$$('.matcher-tab').forEach(function (t) { t.classList.toggle('is-active', t === tab); });
      var mode = tab.getAttribute('data-matcher-tab');
      B.$('#matcher-panel-upload').style.display = mode === 'upload' ? '' : 'none';
      B.$('#matcher-panel-webcam').style.display = mode === 'webcam' ? '' : 'none';
      stopWebcam();
    });
  });

  /* ---------------- Model loading (lazy, once) ---------------- */

  function ensureModelsLoaded() {
    if (modelsReady) return modelsReady;
    setStatus('Loading face-detection model…');
    modelsReady = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    ]).then(function () {
      setStatus('');
    }).catch(function (err) {
      setStatus('Could not load the face-detection model — check your connection and reload.', 'error');
      throw err;
    });
    return modelsReady;
  }

  /* ---------------- Upload flow ---------------- */

  uploadBtn.addEventListener('click', function () { fileInput.click(); });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    var img = new Image();
    img.onload = function () {
      drawToCanvas(img, img.naturalWidth, img.naturalHeight);
      runMatch();
    };
    img.src = URL.createObjectURL(file);
  });

  /* ---------------- Webcam flow ---------------- */

  webcamStartBtn.addEventListener('click', function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Your browser does not support webcam access. Try uploading a photo instead.', 'error');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(function (mediaStream) {
        stream = mediaStream;
        video.srcObject = stream;
        video.style.display = '';
        canvas.style.display = 'none';
        placeholder.style.display = 'none';
        video.play();
        webcamStartBtn.style.display = 'none';
        webcamCaptureBtn.style.display = '';
        setStatus('');
      })
      .catch(function () {
        setStatus('Camera permission was denied or unavailable. You can upload a photo instead.', 'error');
      });
  });

  webcamCaptureBtn.addEventListener('click', function () {
    drawToCanvas(video, video.videoWidth, video.videoHeight);
    stopWebcam();
    runMatch();
  });

  function stopWebcam() {
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    video.style.display = 'none';
    webcamStartBtn.style.display = '';
    webcamCaptureBtn.style.display = 'none';
  }

  /* Draws whatever we captured (uploaded image or webcam frame) onto the
     working canvas, capped at a sane width so detection stays fast. */
  function drawToCanvas(source, width, height) {
    var MAX_W = 480;
    var scale = width > MAX_W ? MAX_W / width : 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.style.display = '';
    placeholder.style.display = 'none';
  }

  /* ---------------- Face detection + skin sampling ---------------- */

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

  function runMatch() {
    resultsBox.innerHTML = '<p class="text-muted">Analyzing…</p>';
    setStatus('Detecting face…');

    ensureModelsLoaded().then(function () {
      return faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
    }).then(function (detection) {
      if (!detection) {
        setStatus('We couldn’t detect a face in that photo. Try a clearer, front-facing shot with more light.', 'error');
        resultsBox.innerHTML = emptyResultsHtml('No face detected', 'Try again with your whole face visible and good lighting.');
        return;
      }

      var ctx = canvas.getContext('2d');
      var faceSize = detection.detection.box.width;
      var sampleSize = Math.max(12, Math.round(faceSize * 0.12));
      var centers = cheekSampleCenters(detection.landmarks.positions);
      var samples = centers
        .map(function (c) { return sampleRegionColor(ctx, c.x, c.y, sampleSize); })
        .filter(Boolean);

      if (!samples.length) {
        setStatus('Couldn’t sample skin color from that photo — try a different angle.', 'error');
        resultsBox.innerHTML = emptyResultsHtml('Sampling failed', 'Try a photo with both cheeks clearly visible.');
        return;
      }

      var avg = samples.reduce(function (acc, s) {
        acc.r += s.r / samples.length;
        acc.g += s.g / samples.length;
        acc.b += s.b / samples.length;
        return acc;
      }, { r: 0, g: 0, b: 0 });

      var skinLab = CS.rgbToLab(avg.r, avg.g, avg.b);

      // Crude lighting sanity check on LAB lightness (0 = black, 100 = white).
      if (skinLab.l < 30) {
        setStatus('This photo looks quite dark — try brighter, more even lighting for a more reliable match.', 'warn');
      } else if (skinLab.l > 88) {
        setStatus('This photo looks overexposed — try softer or more indirect lighting for a more reliable match.', 'warn');
      } else {
        setStatus('');
      }

      renderResults(skinLab);
      maybeRememberPhoto(skinLab);
    }).catch(function (err) {
      console.error(err);
      setStatus('Something went wrong analyzing that photo. Please try again.', 'error');
    });
  }

  /* ---------------- Remember photo (opt-in, local only) ----------------
     Nothing here ever leaves the browser: it's a plain localStorage entry
     on this device, written only if the user ticks the consent checkbox,
     and readable/removable only by this same site in this same browser. */

  var REMEMBER_KEY = 'beautiqueShadeMatcherPhoto';
  var consentBox = B.$('#matcher-remember-consent');
  var rememberedBanner = B.$('#matcher-remembered');
  var rememberedThumb = B.$('#matcher-remembered-thumb');

  function maybeRememberPhoto(skinLab) {
    if (!consentBox || !consentBox.checked) return;
    try {
      var photoDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({
        photoDataUrl: photoDataUrl,
        skinLab: skinLab,
        savedAt: Date.now()
      }));
    } catch (err) {
      // Storage full or unavailable (e.g. private browsing) — fail silently,
      // remembering the photo is a convenience, not a required step.
    }
  }

  function getRememberedPhoto() {
    try {
      return JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null');
    } catch (err) {
      return null;
    }
  }

  function initRememberedBanner() {
    if (!rememberedBanner) return;
    var saved = getRememberedPhoto();
    if (!saved) return;
    rememberedThumb.src = saved.photoDataUrl;
    rememberedBanner.style.display = '';

    B.$('#matcher-remembered-use').addEventListener('click', function () {
      var img = new Image();
      img.onload = function () {
        drawToCanvas(img, img.naturalWidth, img.naturalHeight);
        // We already have this photo's skin-tone reading saved, so we can
        // skip re-running face detection entirely and jump straight to results.
        setStatus('');
        renderResults(saved.skinLab);
      };
      img.src = saved.photoDataUrl;
    });

    B.$('#matcher-remembered-forget').addEventListener('click', function () {
      localStorage.removeItem(REMEMBER_KEY);
      rememberedBanner.style.display = 'none';
    });
  }

  initRememberedBanner();

  function emptyResultsHtml(title, text) {
    return '<div class="empty-state" style="padding: 40px 10px;">' +
      '<span class="empty-emoji">' + window.BeautiqueIcons.alert + '</span>' +
      '<h3>' + title + '</h3><p>' + text + '</p></div>';
  }

  /* ---------------- Ranking + rendering ---------------- */

  function renderResults(skinLab) {
    if (!CATALOG.length) {
      resultsBox.innerHTML = emptyResultsHtml('No shades to compare', 'Add shades to a product in the admin panel first.');
      return;
    }

    // One recommendation per product, not top-3 overall — otherwise a
    // product with a deep shade range (e.g. a 22-shade foundation) would
    // always win every slot and other product lines would never show up.
    var bestPerProduct = new Map();
    CATALOG.forEach(function (shade) {
      var distance = CS.deltaE94(skinLab, shade.lab);
      var current = bestPerProduct.get(shade.productId);
      if (!current || distance < current.distance) {
        bestPerProduct.set(shade.productId, Object.assign({}, shade, { distance: distance }));
      }
    });

    var ranked = Array.from(bestPerProduct.values()).sort(function (a, b) { return a.distance - b.distance; });

    resultsBox.innerHTML = ranked.map(function (shade, i) {
      // Rough, non-scientific "closeness" label from the CIE94 distance —
      // under ~2 is essentially imperceptible, under ~10 reads as "close".
      var closeness = shade.distance < 5 ? 'Excellent match' : shade.distance < 12 ? 'Good match' : 'Closest available';
      return '' +
        '<a class="matcher-result reveal" href="/product/' + shade.productId + '?shade=' + encodeURIComponent(shade.shadeSlug || '') + '" style="transition-delay:' + (i * 0.08).toFixed(2) + 's;">' +
          '<span class="matcher-swatch" style="background:' + shade.hex + ';"></span>' +
          '<span class="matcher-result-info">' +
            '<strong>' + B.escapeHtml(shade.productName) + '</strong>' +
            '<span class="text-muted">' + B.escapeHtml(shade.shadeName) + ' · ' + closeness + '</span>' +
          '</span>' +
          '<span class="btn btn-soft btn-sm">Shop this shade</span>' +
        '</a>';
    }).join('');

    // Trigger the fade/slide-in (same .reveal pattern used site-wide).
    requestAnimationFrame(function () {
      B.$$('#matcher-results .reveal').forEach(function (el) { el.classList.add('is-visible'); });
    });
  }
})();
