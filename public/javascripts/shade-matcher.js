/* Shade matcher — capture UI + shade ranking. Face detection and skin
   sampling themselves live in skin-sampler.js (shared with the profile
   page's capture widget).
   Requires (loaded by views/shade-matcher.ejs before this file):
     - face-api.js (CDN <script>, exposes window.faceapi)
     - color-science.js (exposes window.ColorScience)
     - skin-sampler.js (exposes window.SkinSampler)
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
    var retakeBtn = B.$('#matcher-retake-btn');
    if (retakeBtn) retakeBtn.style.display = '';

    // A pristine snapshot to restore before every try-on preview — without
    // it, re-tinting for a second shade would paint on top of the first
    // instead of starting from the real photo again.
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    clearTryOn();
  }

  /* ---------------- Try it on (virtual shade preview) ----------------
     Which facial region a shade previews on depends on what kind of
     product it is — a lipstick clips to the actual lip shape, but blush/
     foundation/concealer have no equivalent "their own shape" the way lips
     do, so they use soft feathered ellipses instead (a hard-edged fill
     would look like a sticker, not makeup). There's no product field for
     this in the catalog, so it's inferred from the product name — good
     enough for real product names like "Dawn Blush" or "Foundation";
     defaults to a lip preview for anything that doesn't match (e.g. a
     mascara shade), which is at least a real color preview rather than
     nothing. */
  function regionForProduct(productName) {
    var name = (productName || '').toLowerCase();
    if (name.indexOf('concealer') !== -1) return 'concealer';
    if (name.indexOf('blush') !== -1) return 'blush';
    if (name.indexOf('foundation') !== -1) return 'foundation';
    return 'lips';
  }

  function hexToRgba(hex, alpha) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.substr(0, 2), 16) || 0;
    var g = parseInt(hex.substr(2, 2), 16) || 0;
    var b = parseInt(hex.substr(4, 2), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* A soft, center-opaque-fading-to-transparent-edge circle — reads as
     blended makeup rather than a hard-edged sticker of color. */
  function paintFeatheredEllipse(ctx, cx, cy, rx, ry, hex, alpha, blend) {
    var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    gradient.addColorStop(0, hexToRgba(hex, alpha));
    gradient.addColorStop(1, hexToRgba(hex, 0));
    ctx.save();
    ctx.globalCompositeOperation = blend;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  var baseImageData = null;
  var activeTryOn = null; // { hex, region }

  function redrawTryOn() {
    if (!baseImageData) return;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(baseImageData, 0, 0);
    if (!activeTryOn || !lastCapture) return;

    var hex = activeTryOn.hex;

    if (activeTryOn.region === 'lips') {
      if (!lastCapture.lipPoints || !lastCapture.lipPoints.length) return;
      ctx.save();
      ctx.beginPath();
      lastCapture.lipPoints.forEach(function (p, i) {
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.clip();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = hex;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      return;
    }

    if (activeTryOn.region === 'blush' && lastCapture.cheekCenters) {
      var blushR = Math.max(16, lastCapture.faceWidth * 0.16);
      lastCapture.cheekCenters.forEach(function (c) {
        paintFeatheredEllipse(ctx, c.x, c.y, blushR, blushR * 0.75, hex, 0.5, 'multiply');
      });
      return;
    }

    if (activeTryOn.region === 'concealer' && lastCapture.underEyeCenters) {
      var rx = lastCapture.faceWidth * 0.12;
      var ry = lastCapture.faceWidth * 0.075;
      lastCapture.underEyeCenters.forEach(function (c) {
        // Concealer brightens/covers rather than tints, so 'lighten'
        // (keeps whichever is lighter, photo or fill) reads truer here
        // than the 'multiply' the color-based regions use.
        paintFeatheredEllipse(ctx, c.x, c.y, rx, ry, hex, 0.55, 'lighten');
      });
      return;
    }

    if (activeTryOn.region === 'foundation' && lastCapture.faceBox) {
      var box = lastCapture.faceBox;
      paintFeatheredEllipse(
        ctx,
        box.x + box.width / 2,
        box.y + box.height / 2,
        box.width * 0.62,
        box.height * 0.75,
        hex,
        0.3,
        'multiply'
      );
    }
  }

  function applyTryOn(hex, region) {
    if (!lastCapture || !lastCapture.faceBox) {
      setStatus('Try-on needs a clear, front-facing photo with your face detected.', 'error');
      return false;
    }
    activeTryOn = { hex: hex, region: region };
    redrawTryOn();
    var resetBtn = B.$('#matcher-tryon-reset');
    if (resetBtn) resetBtn.style.display = '';
    return true;
  }

  function clearTryOn() {
    activeTryOn = null;
    redrawTryOn();
    B.$$('[data-tryon-hex]').forEach(function (btn) { btn.classList.remove('is-active'); });
    var resetBtn = B.$('#matcher-tryon-reset');
    if (resetBtn) resetBtn.style.display = 'none';
  }

  resultsBox.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tryon-hex]');
    if (!btn) return;
    var applied = applyTryOn(btn.getAttribute('data-tryon-hex'), btn.getAttribute('data-tryon-region'));
    if (applied) {
      B.$$('[data-tryon-hex]', resultsBox).forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
    }
  });

  var tryOnResetBtn = B.$('#matcher-tryon-reset');
  if (tryOnResetBtn) {
    tryOnResetBtn.addEventListener('click', clearTryOn);
  }

  /* Fully starts over — distinct from "Clear tint" above, which keeps the
     same photo and only removes the try-on preview. This drops the photo
     itself, so the upload/webcam controls further up the card are the way
     back in (already visible; nothing to re-show there). */
  function retakePhoto() {
    stopWebcam();
    canvas.style.display = 'none';
    placeholder.style.display = '';
    lastCapture = null;
    baseImageData = null;
    activeTryOn = null;
    if (saveBtn) saveBtn.disabled = true;
    setStatus('');

    var retakeBtn = B.$('#matcher-retake-btn');
    if (retakeBtn) retakeBtn.style.display = 'none';
    if (tryOnResetBtn) tryOnResetBtn.style.display = 'none';

    resultsBox.innerHTML =
      '<div class="empty-state" style="padding: 40px 10px;">' +
        '<span class="empty-emoji">' + window.BeautiqueIcons.lipstick + '</span>' +
        '<h3>No photo yet</h3>' +
        '<p>Capture or upload a photo to see your best-matching shade in every product that has shades.</p>' +
      '</div>';
  }

  var retakeBtn = B.$('#matcher-retake-btn');
  if (retakeBtn) {
    retakeBtn.addEventListener('click', retakePhoto);
  }

  /* ---------------- Face detection + skin sampling ---------------- */

  function runMatch() {
    resultsBox.innerHTML = '<p class="text-muted">Analyzing…</p>';
    setStatus('Detecting face…');

    window.SkinSampler.sampleFromCanvas(canvas).then(function (result) {
      if (!result.ok) {
        setStatus(result.message, 'error');
        resultsBox.innerHTML = emptyResultsHtml(
          result.reason === 'no-face' ? 'No face detected' : 'Sampling failed',
          'Try again with your whole face visible and good lighting.'
        );
        return;
      }

      if (result.lighting === 'dark') {
        setStatus('This photo looks quite dark — try brighter, more even lighting for a more reliable match.', 'warn');
      } else if (result.lighting === 'bright') {
        setStatus('This photo looks overexposed — try softer or more indirect lighting for a more reliable match.', 'warn');
      } else {
        setStatus('');
      }

      lastCapture = {
        skinLab: result.skinLab,
        lipPoints: result.lipPoints,
        cheekCenters: result.cheekCenters,
        underEyeCenters: result.underEyeCenters,
        faceBox: result.faceBox,
        faceWidth: result.faceWidth
      };
      if (saveBtn) saveBtn.disabled = false;
      renderResults(result.skinLab);
    });
  }

  /* ---------------- Save photo (opt-in, local only, per-season) ----------------
     Nothing here ever leaves the browser: it's a plain localStorage entry
     on this device (via window.Beautique.seasonalShades, shared with the
     profile page), written only when the user clicks Save, and
     readable/removable only by this same site in this same browser.
     Skin tone shifts with tanning/season for a lot of people, so this
     supports a separate "summer" and "winter" reading rather than one —
     and since the whole point is two different readings, saving the exact
     same photo for both seasons is refused. */

  var seasonPicker = B.$('#matcher-season-picker');
  var saveBtn = B.$('#matcher-save-btn');
  var rememberedCard = B.$('#matcher-remembered');
  var rememberedGrid = B.$('#matcher-remembered-grid');
  var lastCapture = null; // { skinLab } for whatever photo is currently on the canvas

  function selectedSeason() {
    var active = seasonPicker && seasonPicker.querySelector('.matcher-season-btn.is-active');
    return active ? active.getAttribute('data-season') : 'summer';
  }

  function otherSeason(season) {
    return season === 'summer' ? 'winter' : 'summer';
  }

  if (seasonPicker) {
    seasonPicker.addEventListener('click', function (e) {
      var btn = e.target.closest('.matcher-season-btn');
      if (!btn) return;
      B.$$('.matcher-season-btn', seasonPicker).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      if (!lastCapture) return;
      var season = selectedSeason();
      try {
        var photoDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        var existingOther = B.seasonalShades.get()[otherSeason(season)];
        if (existingOther && existingOther.photoDataUrl === photoDataUrl) {
          setStatus('This is the same photo already saved for your ' + otherSeason(season) + ' shade — use a different photo for your ' + season + ' shade.', 'error');
          return;
        }
        B.seasonalShades.save(season, {
          photoDataUrl: photoDataUrl,
          skinLab: lastCapture.skinLab,
          savedAt: Date.now()
        });
        renderRememberedCard();
        setStatus('Saved as your ' + season + ' shade.', 'success');
      } catch (err) {
        setStatus('Could not save this photo (your browser storage may be full).', 'error');
      }
    });
  }

  var SEASON_LABELS = { summer: '☀️ Summer', winter: '❄️ Winter' };

  function renderRememberedCard() {
    if (!rememberedCard) return;
    var saved = B.seasonalShades.get();
    var seasons = Object.keys(saved);
    if (!seasons.length) {
      rememberedCard.style.display = 'none';
      return;
    }
    rememberedCard.style.display = '';
    rememberedGrid.innerHTML = seasons.map(function (season) {
      var entry = saved[season];
      return '' +
        '<div class="matcher-remembered-item">' +
          '<img src="' + entry.photoDataUrl + '" alt="Your saved ' + season + ' photo">' +
          '<div class="matcher-remembered-info">' +
            '<strong>' + (SEASON_LABELS[season] || season) + '</strong>' +
            '<span class="text-muted">Saved ' + new Date(entry.savedAt).toLocaleDateString() + '</span>' +
          '</div>' +
          '<div class="matcher-remembered-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-use-season="' + season + '">Use this photo</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-forget-season="' + season + '">Forget it</button>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  if (rememberedGrid) {
    rememberedGrid.addEventListener('click', function (e) {
      var useBtn = e.target.closest('[data-use-season]');
      if (useBtn) {
        var entry = B.seasonalShades.get()[useBtn.getAttribute('data-use-season')];
        if (!entry) return;
        var img = new Image();
        img.onload = function () {
          drawToCanvas(img, img.naturalWidth, img.naturalHeight);
          // The skin-tone reading was already saved, but lip points for the
          // try-on preview weren't — re-running detection is cheap (tiny
          // detector, one face) and keeps try-on available here too, rather
          // than only for a freshly-captured photo.
          runMatch();
        };
        img.src = entry.photoDataUrl;
        return;
      }

      var forgetBtn = e.target.closest('[data-forget-season]');
      if (forgetBtn) {
        B.seasonalShades.forget(forgetBtn.getAttribute('data-forget-season'));
        renderRememberedCard();
      }
    });
  }

  renderRememberedCard();

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
      var region = regionForProduct(shade.productName);
      return '' +
        '<div class="matcher-result reveal" style="transition-delay:' + (i * 0.08).toFixed(2) + 's;">' +
          '<span class="matcher-swatch" style="background:' + shade.hex + ';"></span>' +
          '<span class="matcher-result-info">' +
            '<strong>' + B.escapeHtml(shade.productName) + '</strong>' +
            '<span class="text-muted">' + B.escapeHtml(shade.shadeName) + ' · ' + closeness + '</span>' +
          '</span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-tryon-hex="' + shade.hex + '" data-tryon-region="' + region + '">Try it on</button>' +
          '<a class="btn btn-soft btn-sm" href="/product/' + shade.productId + '?shade=' + encodeURIComponent(shade.shadeSlug || '') + '">Shop this shade</a>' +
        '</div>';
    }).join('');

    // Trigger the fade/slide-in (same .reveal pattern used site-wide).
    requestAnimationFrame(function () {
      B.$$('#matcher-results .reveal').forEach(function (el) { el.classList.add('is-visible'); });
    });
  }
})();
