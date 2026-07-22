/* Product page — gallery, quantity stepper, star picker, review form. */
(function () {
  'use strict';
  var B = window.Beautique;

  var page = B.$('#product-page');
  if (!page) return;
  var productId = Number(page.getAttribute('data-product-id'));

  /* Gallery — arrows and thumbnails step through the current photo set.
     The set itself is rebuilt per shade (see applyShade below) so each
     shade only ever shows its own matching photos. */
  var galleryTrack = B.$('#gallery-thumbs');
  var galleryMain = B.$('#gallery-main');
  var galleryMainImg = B.$('#gallery-main-img');
  var galleryWinkOverlay = B.$('#gallery-wink-overlay');
  var galleryArrows = B.$$('.gallery-arrow');
  var galleryImages = [];
  var galleryIndex = 0;

  /* Wink loop — photos listed in data-wink-map get a periodic blink: the
     "eyes closed" frame crossfades in on top of the base photo (smooth,
     no hard cut), holds, then fades back out. Keyed by the normal
     ("eyes open") photo's URL, so it only runs while that photo is showing. */
  var galleryWinkMap = {};
  if (galleryMain) {
    try { galleryWinkMap = JSON.parse(galleryMain.getAttribute('data-wink-map') || '{}'); } catch (e) { /* ignore */ }
  }
  var winkTimer = null;
  var WINK_HOLD_MS = 650;

  function stopWink() {
    if (winkTimer) { clearInterval(winkTimer); winkTimer = null; }
    if (galleryWinkOverlay) galleryWinkOverlay.style.opacity = '0';
  }

  function maybeStartWink() {
    stopWink();
    var openSrc = galleryImages[galleryIndex];
    var closedSrc = galleryWinkMap[openSrc];
    if (!closedSrc || !galleryWinkOverlay) return;
    galleryWinkOverlay.src = closedSrc;
    winkTimer = setInterval(function () {
      galleryWinkOverlay.style.opacity = '1';
      setTimeout(function () {
        galleryWinkOverlay.style.opacity = '0';
      }, WINK_HOLD_MS);
    }, 3500);
  }

  function renderThumbs() {
    if (!galleryTrack) return;
    galleryTrack.innerHTML = '';
    galleryTrack.style.display = galleryImages.length > 1 ? '' : 'none';
    galleryArrows.forEach(function (arrow) { arrow.style.display = galleryImages.length > 1 ? '' : 'none'; });
    galleryImages.forEach(function (src, i) {
      var img = document.createElement('img');
      img.className = 'thumb' + (i === 0 ? ' is-active' : '');
      img.src = src;
      img.alt = 'Photo ' + (i + 1);
      img.addEventListener('click', function () { showImage(i); });
      galleryTrack.appendChild(img);
    });
  }

  function showImage(index) {
    if (!galleryImages.length || !galleryMainImg) return;
    galleryIndex = (index + galleryImages.length) % galleryImages.length;
    var nextSrc = galleryImages[galleryIndex];
    galleryMainImg.classList.add('is-fading');
    setTimeout(function () {
      galleryMainImg.src = nextSrc;
      galleryMainImg.classList.remove('is-fading');
    }, 160);
    if (galleryTrack) {
      Array.prototype.forEach.call(galleryTrack.children, function (el, i) {
        el.classList.toggle('is-active', i === galleryIndex);
      });
    }
    maybeStartWink();
  }

  function setGallery(images) {
    galleryImages = (images || []).filter(Boolean);
    galleryIndex = 0;
    if (galleryImages.length && galleryMainImg) galleryMainImg.src = galleryImages[0];
    renderThumbs();
    maybeStartWink();
  }

  if (galleryTrack) {
    var initialImages = [];
    try { initialImages = JSON.parse(galleryTrack.getAttribute('data-images') || '[]'); } catch (e) { /* ignore */ }
    setGallery(initialImages);
  }

  var prevBtn = B.$('#gallery-prev');
  var nextBtn = B.$('#gallery-next');
  if (prevBtn) prevBtn.addEventListener('click', function () { showImage(galleryIndex - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { showImage(galleryIndex + 1); });

  /* Quantity stepper feeds the add-to-cart button's data-qty */
  var qtyVal = B.$('#pdp-qty-val');
  var addBtn = B.$('#pdp-add');

  function currentQty() { return Number(qtyVal.textContent) || 1; }

  function setQty(next) {
    var stock = Number(addBtn.getAttribute('data-stock')) || 99;
    next = Math.max(1, Math.min(stock, next));
    qtyVal.textContent = next;
    addBtn.setAttribute('data-qty', next);
    var price = Number(addBtn.getAttribute('data-price')) || 0;
    addBtn.textContent = 'Add to bag — ' + B.money(price * next);
  }

  if (qtyVal && addBtn) {
    B.$('#pdp-qty-minus').addEventListener('click', function () { setQty(currentQty() - 1); });
    B.$('#pdp-qty-plus').addEventListener('click', function () { setQty(currentQty() + 1); });
  }

  /* Shade swatches — clicking one swaps in that shade's own photos, if it has any. */
  var shadeSwatches = B.$$('#shade-swatches .shade-swatch');
  var shadeLabel = B.$('#shade-label');

  function applyShade(swatch) {
    var label = swatch.getAttribute('data-label');
    var soldOut = swatch.getAttribute('data-sold-out') === '1';
    var stock = Number(swatch.getAttribute('data-stock')) || 0;
    var images = [];
    try { images = JSON.parse(swatch.getAttribute('data-images') || '[]'); } catch (e) { /* ignore */ }

    shadeSwatches.forEach(function (s) { s.classList.toggle('is-active', s === swatch); });
    if (shadeLabel) shadeLabel.textContent = label ? '— ' + label + (soldOut ? ' (Sold out)' : '') : '';
    if (addBtn) {
      addBtn.setAttribute('data-shade', swatch.getAttribute('data-name') || '');
      addBtn.setAttribute('data-stock', stock);
      addBtn.disabled = soldOut;
      var qtyStepper = B.$('#pdp-qty');
      if (qtyStepper) qtyStepper.style.display = soldOut ? 'none' : '';
      if (soldOut) {
        addBtn.textContent = 'This shade is sold out';
      } else {
        setQty(Math.min(currentQty(), stock) || 1);
      }
    }

    if (images.length) {
      setGallery(images);
    }
  }

  if (shadeSwatches.length) {
    shadeSwatches.forEach(function (swatch) {
      swatch.addEventListener('click', function () { applyShade(swatch); });
    });

    // Deep-link from the shade matcher ("Shop this shade") — e.g.
    // /product/7?shade=shade-08 — pre-selects that exact shade instead of
    // defaulting to the first one.
    var requestedShade = new URLSearchParams(window.location.search).get('shade');
    var requested = requestedShade && shadeSwatches.find(function (s) { return s.getAttribute('data-name') === requestedShade; });
    // Match the server's default (see lib/catalog.js getSelectedShade): prefer
    // the first shade still in stock, so this client-side re-apply on load
    // can't undo that by falling back to shade 0 regardless of its stock.
    var firstInStock = shadeSwatches.find(function (s) { return s.getAttribute('data-sold-out') !== '1'; });
    var initialSwatch = requested || firstInStock || shadeSwatches[0];
    applyShade(initialSwatch);
    if (requested) {
      initialSwatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* Accordion — animated expand/collapse (grid-template-rows transition in CSS) */
  B.$$('.accordion-item').forEach(function (item) {
    var trigger = item.querySelector('.accordion-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', function () {
      var isOpen = item.classList.contains('is-open');
      item.classList.toggle('is-open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  /* Star picker */
  var picker = B.$('#star-picker');
  var ratingInput = B.$('#review-rating');

  function paintStars(value) {
    B.$$('#star-picker span').forEach(function (star) {
      star.classList.toggle('is-lit', Number(star.getAttribute('data-value')) <= value);
    });
  }

  if (picker) {
    paintStars(5);
    picker.addEventListener('click', function (e) {
      var star = e.target.closest('span[data-value]');
      if (!star) return;
      ratingInput.value = star.getAttribute('data-value');
      paintStars(Number(ratingInput.value));
    });
  }

  /* Review form */
  var form = B.$('#review-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = B.$('#review-status');
      B.api('/api/products/' + productId + '/reviews', {
        method: 'POST',
        body: {
          rating: Number(ratingInput.value) || 5,
          comment: B.$('#review-comment').value.trim()
        }
      }).then(function () {
        status.textContent = 'Thank you! Refreshing…';
        status.className = 'form-status is-success';
        B.toast('Review submitted');
        setTimeout(function () { window.location.reload(); }, 900);
      }).catch(function (err) {
        status.textContent = err.message;
        status.className = 'form-status is-error';
      });
    });
  }

  /* Edit / delete one of your own reviews, inline in the list */
  var reviewList = B.$('#review-list');
  if (reviewList) {
    reviewList.addEventListener('click', function (e) {
      var item = e.target.closest('[data-review]');
      if (!item) return;
      var reviewId = item.getAttribute('data-review-id');
      var viewEl = item.querySelector('.review-comment-view');
      var editEl = item.querySelector('.review-comment-edit');

      if (e.target.closest('[data-own-review-edit]')) {
        viewEl.style.display = 'none';
        editEl.style.display = '';
        item.querySelector('[data-own-review-edit]').style.display = 'none';
        item.querySelector('[data-own-review-save]').style.display = '';
        item.querySelector('[data-own-review-cancel]').style.display = '';
        editEl.focus();
        return;
      }

      if (e.target.closest('[data-own-review-cancel]')) {
        editEl.value = viewEl.textContent;
        editEl.style.display = 'none';
        viewEl.style.display = viewEl.textContent ? '' : 'none';
        item.querySelector('[data-own-review-edit]').style.display = '';
        item.querySelector('[data-own-review-save]').style.display = 'none';
        item.querySelector('[data-own-review-cancel]').style.display = 'none';
        return;
      }

      if (e.target.closest('[data-own-review-save]')) {
        var comment = editEl.value.trim();
        B.api('/api/products/' + productId + '/reviews/' + reviewId, {
          method: 'PATCH',
          body: { comment: comment }
        }).then(function () {
          viewEl.textContent = comment;
          viewEl.style.display = comment ? '' : 'none';
          editEl.style.display = 'none';
          item.querySelector('[data-own-review-edit]').style.display = '';
          item.querySelector('[data-own-review-save]').style.display = 'none';
          item.querySelector('[data-own-review-cancel]').style.display = 'none';
          B.toast('Review updated');
        }).catch(function (err) { B.toast(err.message, 'error'); });
        return;
      }

      if (e.target.closest('[data-own-review-delete]')) {
        B.confirmDialog('Delete this review?', 'This removes it from the product page for good.')
          .then(function (confirmed) {
            if (!confirmed) return;
            B.api('/api/products/' + productId + '/reviews/' + reviewId, { method: 'DELETE' })
              .then(function () {
                B.toast('Review deleted.');
                item.remove();
              })
              .catch(function (err) { B.toast(err.message, 'error'); });
          });
      }
    });
  }
})();
