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

      renderResults(result.skinLab);
      maybeRememberPhoto(result.skinLab);
    });
  }

  /* ---------------- Remember photo (opt-in, local only, per-season) ----------------
     Nothing here ever leaves the browser: it's a plain localStorage entry
     on this device (via window.Beautique.seasonalShades, shared with the
     profile page), written only if the user ticks the consent checkbox,
     and readable/removable only by this same site in this same browser.
     Skin tone shifts with tanning/season for a lot of people, so this
     supports a separate "summer" and "winter" reading rather than one. */

  var consentBox = B.$('#matcher-remember-consent');
  var seasonPicker = B.$('#matcher-season-picker');
  var rememberedCard = B.$('#matcher-remembered');
  var rememberedGrid = B.$('#matcher-remembered-grid');

  function selectedSeason() {
    var active = seasonPicker && seasonPicker.querySelector('.matcher-season-btn.is-active');
    return active ? active.getAttribute('data-season') : 'summer';
  }

  if (seasonPicker) {
    seasonPicker.addEventListener('click', function (e) {
      var btn = e.target.closest('.matcher-season-btn');
      if (!btn) return;
      B.$$('.matcher-season-btn', seasonPicker).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
    });
  }

  function maybeRememberPhoto(skinLab) {
    if (!consentBox || !consentBox.checked) return;
    try {
      var photoDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      B.seasonalShades.save(selectedSeason(), {
        photoDataUrl: photoDataUrl,
        skinLab: skinLab,
        savedAt: Date.now()
      });
      renderRememberedCard();
    } catch (err) {
      // Storage full or unavailable (e.g. private browsing) — fail silently,
      // remembering the photo is a convenience, not a required step.
    }
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
          // We already have this photo's skin-tone reading saved, so we can
          // skip re-running face detection entirely and jump straight to results.
          setStatus('');
          renderResults(entry.skinLab);
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
