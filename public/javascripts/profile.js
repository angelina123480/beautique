/* Profile page — account details and order history. */
(function () {
  'use strict';
  var B = window.Beautique;

  var form = B.$('#profile-form');
  if (!form) return;

  var status = B.$('#profile-status');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    B.api('/api/profile/update', {
      method: 'POST',
      body: {
        name: B.$('#profile-name').value.trim(),
        email: B.$('#profile-email').value.trim(),
        phone: B.$('#profile-phone').value.trim(),
        address: B.$('#profile-address').value.trim()
      }
    }).then(function () {
      status.textContent = 'Saved!';
      status.className = 'form-status is-success';
      B.toast('Profile updated');
      var pill = B.$('#deliver-pill-text');
      var address = B.$('#profile-address').value.trim();
      if (pill && address) pill.textContent = address;
    }).catch(function (err) {
      status.textContent = err.message;
      status.className = 'form-status is-error';
    });
  });

  B.$('#signout-button').addEventListener('click', function () {
    B.api('/api/auth/signout', { method: 'POST' }).then(function () {
      localStorage.removeItem('beautiqueCart');
      window.location.href = '/auth';
    });
  });

  /* Redeem a reward tier for a discount code */
  var rewardsCard = B.$('#rewards-card');
  if (rewardsCard) {
    rewardsCard.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-redeem-tier]');
      if (!btn) return;
      var tier = btn.getAttribute('data-redeem-tier');
      btn.disabled = true;
      btn.textContent = 'Redeeming…';
      B.api('/api/rewards/redeem', { method: 'POST', body: { tier: Number(tier) } })
        .then(function (result) {
          B.toast('Redeemed! Your code: ' + result.code);
          window.location.reload();
        })
        .catch(function (err) {
          B.toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Redeem';
        });
    });
  }

  /* Delete account */
  var deleteOpenBtn = B.$('#delete-account-open');
  var deleteForm = B.$('#delete-account-form');
  var deleteCancelBtn = B.$('#delete-account-cancel');
  var deletePasswordInput = B.$('#delete-account-password');
  var deleteStatus = B.$('#delete-account-status');

  deleteOpenBtn.addEventListener('click', function () {
    deleteOpenBtn.style.display = 'none';
    deleteForm.style.display = '';
    deletePasswordInput.focus();
  });

  deleteCancelBtn.addEventListener('click', function () {
    deleteForm.style.display = 'none';
    deleteOpenBtn.style.display = '';
    deletePasswordInput.value = '';
    deleteStatus.textContent = '';
    deleteStatus.className = 'form-status';
  });

  deleteForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var password = deletePasswordInput.value;
    if (!password) {
      deleteStatus.textContent = 'Please enter your password.';
      deleteStatus.className = 'form-status is-error';
      return;
    }
    B.confirmDialog('Delete your account permanently?', 'This removes your account for good — it cannot be undone.')
      .then(function (confirmed) {
        if (!confirmed) return;
        deleteStatus.textContent = 'Deleting…';
        deleteStatus.className = 'form-status is-info';
        B.api('/api/profile/delete', { method: 'POST', body: { password: password } })
          .then(function () {
            localStorage.removeItem('beautiqueCart');
            window.location.href = '/auth';
          })
          .catch(function (err) {
            deleteStatus.textContent = err.message;
            deleteStatus.className = 'form-status is-error';
          });
      });
  });

  /* Orders */
  var ordersList = B.$('#orders-list');

  function statusPill(order) {
    return '<span class="status-pill status-' + order.status + '">' + order.status + '</span>';
  }

  function orderHtml(order) {
    var items = (order.items || []).map(function (item) {
      return '<li>' + item.quantity + '× ' + B.escapeHtml(item.name) + ' — ' + B.money(item.price * item.quantity) + '</li>';
    }).join('');

    var canCancel = order.status === 'confirmed' || order.status === 'shipped';

    return '' +
      '<div class="order-card" data-order="' + order.id + '">' +
        '<div class="order-card-head">' +
          '<div><strong>Order #' + order.id + '</strong><br><span class="order-date">' + new Date(order.createdAt).toLocaleString() + '</span></div>' +
          statusPill(order) +
        '</div>' +
        '<ul class="order-items-list">' + items + '</ul>' +
        '<div class="order-card-foot">' +
          '<span><strong>' + B.money(order.total) + '</strong>' +
            (order.shipping === 0 ? ' <span class="text-muted" style="font-size:12px;">(free shipping)</span>' : '') +
            ' · <span class="text-muted" style="font-size:12.5px; text-transform:capitalize;">' + (order.paymentMethod || 'online') + '</span></span>' +
          '<span class="order-card-actions">' +
            (canCancel ? '<button class="btn btn-danger btn-sm" data-cancel-order="' + order.id + '" type="button">Cancel order</button>' : '') +
            '<button class="btn btn-soft btn-sm" data-delete-order="' + order.id + '" type="button">Delete</button>' +
          '</span>' +
        '</div>' +
      '</div>';
  }

  var ORDERS_PAGE_SIZE = 3;
  var allOrders = [];
  var ordersExpanded = false;

  var clearOrdersBtn = B.$('#orders-clear-all');

  function renderOrdersList() {
    var visible = ordersExpanded ? allOrders : allOrders.slice(0, ORDERS_PAGE_SIZE);
    var hiddenCount = allOrders.length - ORDERS_PAGE_SIZE;
    var toggleHtml = '';
    if (allOrders.length > ORDERS_PAGE_SIZE) {
      toggleHtml = '<button type="button" class="btn btn-soft btn-block" id="orders-toggle" style="margin-top:12px;">' +
        (ordersExpanded ? 'View less' : 'View ' + hiddenCount + ' more order' + (hiddenCount === 1 ? '' : 's')) +
        '</button>';
    }
    ordersList.innerHTML = visible.map(orderHtml).join('') + toggleHtml;
    if (clearOrdersBtn) clearOrdersBtn.style.display = allOrders.length ? '' : 'none';
  }

  function loadOrders() {
    B.api('/api/orders').then(function (result) {
      allOrders = result.orders || [];
      if (!allOrders.length) {
        ordersList.innerHTML = '<div class="empty-state" style="padding: 40px 10px;"><span class="empty-emoji">' + window.BeautiqueIcons.bag + '</span><h3>No orders yet</h3><p>Treat yourself — you deserve it.</p><a class="btn btn-primary btn-sm" href="/shop">Start shopping</a></div>';
        if (clearOrdersBtn) clearOrdersBtn.style.display = 'none';
        return;
      }
      ordersExpanded = false;
      renderOrdersList();
    }).catch(function (err) {
      ordersList.innerHTML = '<p class="text-muted">' + B.escapeHtml(err.message) + '</p>';
    });
  }

  ordersList.addEventListener('click', function (e) {
    var toggleBtn = e.target.closest('#orders-toggle');
    if (toggleBtn) {
      ordersExpanded = !ordersExpanded;
      renderOrdersList();
      return;
    }

    var cancelBtn = e.target.closest('[data-cancel-order]');
    if (cancelBtn) {
      var cancelId = cancelBtn.getAttribute('data-cancel-order');
      B.confirmDialog('Cancel this order?', 'Order #' + cancelId + ' will be cancelled and refunded. Items go back in stock.')
        .then(function (confirmed) {
          if (!confirmed) return;
          B.api('/api/orders/' + cancelId + '/cancel', { method: 'POST' })
            .then(function () {
              B.toast('Order cancelled — confirmation email sent.');
              loadOrders();
            })
            .catch(function (err) { B.toast(err.message, 'error'); });
        });
      return;
    }

    var deleteBtn = e.target.closest('[data-delete-order]');
    if (deleteBtn) {
      var deleteId = deleteBtn.getAttribute('data-delete-order');
      B.confirmDialog('Remove this order?', 'Order #' + deleteId + ' will be removed from your order history here. This won\'t affect your account or any refund already given.')
        .then(function (confirmed) {
          if (!confirmed) return;
          B.api('/api/orders/' + deleteId, { method: 'DELETE' })
            .then(function () {
              B.toast('Order removed from your history.');
              loadOrders();
            })
            .catch(function (err) { B.toast(err.message, 'error'); });
        });
    }
  });

  if (clearOrdersBtn) {
    clearOrdersBtn.addEventListener('click', function () {
      B.confirmDialog('Clear your entire order history?', 'All orders will be removed from this list. This won\'t affect your account or any refunds already given.')
        .then(function (confirmed) {
          if (!confirmed) return;
          B.api('/api/orders', { method: 'DELETE' })
            .then(function () {
              B.toast('Order history cleared.');
              loadOrders();
            })
            .catch(function (err) { B.toast(err.message, 'error'); });
        });
    });
  }

  loadOrders();

  /* ---------------- Saved seasonal shades ----------------
     Reads the same localStorage data the shade matcher writes (see
     window.Beautique.seasonalShades in app.js) — purely a viewing/
     management surface here, no face detection needed on this page. */
  var savedShadesList = B.$('#saved-shades-list');
  var SEASON_LABELS = { summer: '☀️ Summer', winter: '❄️ Winter' };

  function renderSavedShades() {
    if (!savedShadesList) return;
    var saved = B.seasonalShades.get();
    var seasons = Object.keys(saved);

    if (!seasons.length) {
      savedShadesList.innerHTML = '<div class="empty-state" style="padding: 30px 10px;">' +
        '<span class="empty-emoji">' + window.BeautiqueIcons.bottle + '</span>' +
        '<h3>Nothing saved yet</h3>' +
        '<p>Save a summer or winter reading below to see it here.</p>' +
        '</div>';
      return;
    }

    savedShadesList.innerHTML = '<div class="matcher-remembered-grid">' + seasons.map(function (season) {
      var entry = saved[season];
      return '' +
        '<div class="matcher-remembered-item">' +
          '<img src="' + entry.photoDataUrl + '" alt="Your saved ' + season + ' photo">' +
          '<div class="matcher-remembered-info">' +
            '<strong>' + (SEASON_LABELS[season] || season) + '</strong>' +
            '<span class="text-muted">Saved ' + new Date(entry.savedAt).toLocaleDateString() + '</span>' +
          '</div>' +
          '<div class="matcher-remembered-actions">' +
            '<a class="btn btn-primary btn-sm" href="/shade-matcher">View matches</a>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-forget-season="' + season + '">Forget it</button>' +
          '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  if (savedShadesList) {
    savedShadesList.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-forget-season]');
      if (!btn) return;
      B.seasonalShades.forget(btn.getAttribute('data-forget-season'));
      renderSavedShades();
      B.toast('Removed');
    });
    renderSavedShades();
  }

  /* ---------------- Save a new reading, right from the profile ----------------
     Mirrors the shade matcher's capture flow (see shade-matcher.js /
     skin-sampler.js) but skips ranking against the product catalog — here
     we only need a skin-tone reading to save into a season slot. */
  var shadeCanvas = B.$('#profile-shade-canvas');
  if (shadeCanvas && window.SkinSampler) {
    var shadeVideo = B.$('#profile-shade-video');
    var shadePlaceholder = B.$('#profile-shade-placeholder');
    var shadeStatusBox = B.$('#profile-shade-status');
    var shadeWebcamStart = B.$('#profile-shade-webcam-start');
    var shadeWebcamCapture = B.$('#profile-shade-webcam-capture');
    var shadeUploadBtn = B.$('#profile-shade-upload-btn');
    var shadeFileInput = B.$('#profile-shade-file-input');
    var shadeSeasonPicker = B.$('#profile-season-picker');
    var shadeStream = null;

    function setShadeStatus(message, kind) {
      shadeStatusBox.textContent = message || '';
      shadeStatusBox.className = 'matcher-status' + (kind ? ' is-' + kind : '');
    }

    function selectedProfileSeason() {
      var active = shadeSeasonPicker.querySelector('.matcher-season-btn.is-active');
      return active ? active.getAttribute('data-season') : 'summer';
    }

    shadeSeasonPicker.addEventListener('click', function (e) {
      var btn = e.target.closest('.matcher-season-btn');
      if (!btn) return;
      B.$$('.matcher-season-btn', shadeSeasonPicker).forEach(function (b) { b.classList.toggle('is-active', b === btn); });
    });

    B.$$('.matcher-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        B.$$('.matcher-tab').forEach(function (t) { t.classList.toggle('is-active', t === tab); });
        var mode = tab.getAttribute('data-matcher-tab');
        B.$('#profile-shade-panel-upload').style.display = mode === 'upload' ? '' : 'none';
        B.$('#profile-shade-panel-webcam').style.display = mode === 'webcam' ? '' : 'none';
        stopShadeWebcam();
      });
    });

    shadeUploadBtn.addEventListener('click', function () { shadeFileInput.click(); });

    shadeFileInput.addEventListener('change', function () {
      var file = shadeFileInput.files[0];
      if (!file) return;
      var img = new Image();
      img.onload = function () {
        drawShadeToCanvas(img, img.naturalWidth, img.naturalHeight);
        captureAndSave();
      };
      img.src = URL.createObjectURL(file);
    });

    shadeWebcamStart.addEventListener('click', function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setShadeStatus('Your browser does not support webcam access. Try uploading a photo instead.', 'error');
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        .then(function (mediaStream) {
          shadeStream = mediaStream;
          shadeVideo.srcObject = shadeStream;
          shadeVideo.style.display = '';
          shadeCanvas.style.display = 'none';
          shadePlaceholder.style.display = 'none';
          shadeVideo.play();
          shadeWebcamStart.style.display = 'none';
          shadeWebcamCapture.style.display = '';
          setShadeStatus('');
        })
        .catch(function () {
          setShadeStatus('Camera permission was denied or unavailable. You can upload a photo instead.', 'error');
        });
    });

    shadeWebcamCapture.addEventListener('click', function () {
      drawShadeToCanvas(shadeVideo, shadeVideo.videoWidth, shadeVideo.videoHeight);
      stopShadeWebcam();
      captureAndSave();
    });

    function stopShadeWebcam() {
      if (shadeStream) {
        shadeStream.getTracks().forEach(function (track) { track.stop(); });
        shadeStream = null;
      }
      shadeVideo.style.display = 'none';
      shadeWebcamStart.style.display = '';
      shadeWebcamCapture.style.display = 'none';
    }

    function drawShadeToCanvas(source, width, height) {
      var MAX_W = 480;
      var scale = width > MAX_W ? MAX_W / width : 1;
      shadeCanvas.width = Math.round(width * scale);
      shadeCanvas.height = Math.round(height * scale);
      shadeCanvas.getContext('2d').drawImage(source, 0, 0, shadeCanvas.width, shadeCanvas.height);
      shadeCanvas.style.display = '';
      shadePlaceholder.style.display = 'none';
    }

    function captureAndSave() {
      setShadeStatus('Detecting face…');
      window.SkinSampler.sampleFromCanvas(shadeCanvas).then(function (result) {
        if (!result.ok) {
          setShadeStatus(result.message, 'error');
          return;
        }
        var season = selectedProfileSeason();
        var photoDataUrl = shadeCanvas.toDataURL('image/jpeg', 0.7);
        B.seasonalShades.save(season, { photoDataUrl: photoDataUrl, skinLab: result.skinLab, savedAt: Date.now() });
        renderSavedShades();
        B.toast('Saved your ' + season + ' shade');
        if (result.lighting === 'dark') {
          setShadeStatus('Saved — though this photo looked quite dark, so the match may be less accurate.', 'warn');
        } else if (result.lighting === 'bright') {
          setShadeStatus('Saved — though this photo looked overexposed, so the match may be less accurate.', 'warn');
        } else {
          setShadeStatus('Saved as your ' + season + ' shade.', 'success');
        }
      });
    }
  }
})();
