/* Checkout page — bag review, payment selection, order placement. */
(function () {
  'use strict';
  var B = window.Beautique;

  var itemsBox = B.$('#checkout-items');
  if (!itemsBox) return;

  var summaryBox = B.$('#checkout-summary');
  var placeBtn = B.$('#place-order');
  var statusBox = B.$('#checkout-status');
  var signedIn = document.body.getAttribute('data-signed-in') === '1';

  function render() {
    var cart = B.cart.get();

    if (!cart.length) {
      itemsBox.innerHTML = '<div class="empty-state" style="padding: 40px 10px;"><span class="empty-emoji">' + window.BeautiqueIcons.bag + '</span><h3>Your bag is empty</h3><p>Add something lovely before checking out.</p><a class="btn btn-primary btn-sm" href="/shop">Browse the shop</a></div>';
      B.$('#checkout-form-area').style.display = 'none';
      summaryBox.innerHTML = '';
      placeBtn.disabled = true;
      return;
    }

    B.$('#checkout-form-area').style.display = '';
    placeBtn.disabled = !signedIn;

    itemsBox.innerHTML = cart.map(function (item) {
      return '' +
        '<div class="cart-line">' +
          '<span class="product-art" style="--tone:' + (Number(item.tone) || 340) + ';"><span class="art-emoji" style="font-size:26px;">' + (item.emoji ? B.escapeHtml(item.emoji) : window.BeautiqueIcons.bottle) + '</span></span>' +
          '<div class="cart-line-info">' +
            '<strong>' + B.escapeHtml(item.name) + '</strong>' +
            (item.shade ? '<span class="cart-line-price">Shade: ' + B.escapeHtml(item.shade) + '</span><br>' : '') +
            '<span class="cart-line-price">' + B.money(item.price) + ' each</span><br>' +
            '<span class="qty-stepper">' +
              '<button type="button" data-cart-minus="' + item.id + '">−</button>' +
              '<span class="qty-val">' + item.quantity + '</span>' +
              '<button type="button" data-cart-plus="' + item.id + '">+</button>' +
            '</span> ' +
            '<button class="cart-line-remove" type="button" data-cart-remove="' + item.id + '">Remove</button>' +
          '</div>' +
          '<span class="cart-line-total">' + B.money(item.price * item.quantity) + '</span>' +
        '</div>';
    }).join('');

    var subtotal = B.cart.subtotal(cart);
    var shipping = subtotal >= B.cart.FREE_SHIPPING ? 0 : B.cart.SHIPPING_FLAT;
    var rewardBox = B.$('#apply-reward');
    var discount = (rewardBox && rewardBox.checked) ? Math.round(subtotal * (Number(rewardBox.getAttribute('data-discount')) / 100) * 100) / 100 : 0;

    summaryBox.innerHTML = '' +
      '<div class="cart-totals-row"><span>Subtotal (' + B.cart.count(cart) + ' items)</span><span>' + B.money(subtotal) + '</span></div>' +
      (discount > 0 ? '<div class="cart-totals-row" style="color: var(--success);"><span>Reward discount</span><span>−' + B.money(discount) + '</span></div>' : '') +
      '<div class="cart-totals-row"><span>Shipping</span><span>' + (shipping === 0 ? 'Free' : B.money(shipping)) + '</span></div>' +
      '<div class="cart-totals-row grand"><span>Total</span><span>' + B.money(subtotal - discount + shipping) + '</span></div>';
  }

  var rewardToggle = B.$('#apply-reward');
  if (rewardToggle) rewardToggle.addEventListener('change', render);

  /* Re-render after any cart mutation triggered by the shared steppers. */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-cart-minus], [data-cart-plus], [data-cart-remove]')) {
      setTimeout(render, 0);
    }
  });

  /* Payment method selection highlight */
  B.$$('.pay-option input').forEach(function (radio) {
    radio.addEventListener('change', function () {
      B.$$('.pay-option').forEach(function (option) {
        option.classList.toggle('is-selected', option.contains(radio) && radio.checked);
      });
    });
  });

  placeBtn.addEventListener('click', function () {
    var cart = B.cart.get();
    if (!cart.length) return;

    var address = B.$('#checkout-address').value.trim();
    if (!address) {
      statusBox.textContent = 'Please enter a delivery address.';
      statusBox.className = 'form-status is-error';
      return;
    }

    var paymentMethod = (B.$('.pay-option input:checked') || {}).value || 'online';
    var rewardBox = B.$('#apply-reward');
    var redeemTier = (rewardBox && rewardBox.checked) ? Number(rewardBox.getAttribute('data-tier')) : null;

    placeBtn.disabled = true;
    placeBtn.textContent = 'Placing order…';
    statusBox.textContent = '';
    statusBox.className = 'form-status';

    B.api('/api/orders', {
      method: 'POST',
      body: {
        items: cart.map(function (item) { return { id: item.id, quantity: item.quantity, shade: item.shade || '' }; }),
        paymentMethod: paymentMethod,
        address: address,
        redeemTier: redeemTier
      }
    }).then(function (result) {
      B.cart.clear();
      var order = result.order;
      B.$('#checkout-layout').innerHTML = '' +
        '<div class="card order-success" style="grid-column: 1 / -1;">' +
          '<span class="success-emoji">' + window.BeautiqueIcons.check + '</span>' +
          '<h2>Thank you — order placed!</h2>' +
          '<p class="lead" style="margin: 0 auto 8px;">Order <strong>#' + order.id + '</strong> is confirmed. Total charged: <strong>' + B.money(order.total) + '</strong>.</p>' +
          '<p class="text-muted">You earned <strong>' + (order.pointsEarned || 0) + ' reward points</strong> on this order.</p>' +
          '<p class="text-muted">A confirmation email is on its way to your inbox.</p>' +
          '<div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:16px;">' +
            '<a class="btn btn-primary" href="/profile">Track my order</a>' +
            '<a class="btn btn-ghost" href="/shop">Keep shopping</a>' +
          '</div>' +
        '</div>';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (err) {
      placeBtn.disabled = false;
      placeBtn.textContent = 'Place order';
      statusBox.textContent = err.message;
      statusBox.className = 'form-status is-error';
      B.toast(err.message, 'error');
    });
  });

  render();
})();
