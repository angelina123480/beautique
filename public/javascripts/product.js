/* Product page — gallery, quantity stepper, star picker, review form. */
(function () {
  'use strict';
  var B = window.Beautique;

  var page = B.$('#product-page');
  if (!page) return;
  var productId = Number(page.getAttribute('data-product-id'));

  /* Gallery thumbnails */
  B.$$('.gallery-thumbs .thumb').forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      B.$('#gallery-main-img').src = thumb.getAttribute('data-src');
      B.$$('.gallery-thumbs .thumb').forEach(function (t) { t.classList.remove('is-active'); });
      thumb.classList.add('is-active');
    });
  });

  /* Quantity stepper feeds the add-to-cart button's data-qty */
  var qtyVal = B.$('#pdp-qty-val');
  var addBtn = B.$('#pdp-add');
  var shadeSelect = B.$('#shade-select');

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

  if (shadeSelect && addBtn) {
    shadeSelect.addEventListener('change', function () {
      addBtn.setAttribute('data-shade', shadeSelect.value || '');
    });
  }

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
        B.toast('Review submitted 💕');
        setTimeout(function () { window.location.reload(); }, 900);
      }).catch(function (err) {
        status.textContent = err.message;
        status.className = 'form-status is-error';
      });
    });
  }
})();
