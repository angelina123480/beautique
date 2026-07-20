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
      B.toast('Profile updated ✔');
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
          (canCancel ? '<button class="btn btn-danger btn-sm" data-cancel-order="' + order.id + '" type="button">Cancel order</button>' : '') +
        '</div>' +
      '</div>';
  }

  function loadOrders() {
    B.api('/api/orders').then(function (result) {
      if (!result.orders || !result.orders.length) {
        ordersList.innerHTML = '<div class="empty-state" style="padding: 40px 10px;"><span class="empty-emoji">🛍️</span><h3>No orders yet</h3><p>Treat yourself — you deserve it.</p><a class="btn btn-primary btn-sm" href="/shop">Start shopping</a></div>';
        return;
      }
      ordersList.innerHTML = result.orders.map(orderHtml).join('');
    }).catch(function (err) {
      ordersList.innerHTML = '<p class="text-muted">' + B.escapeHtml(err.message) + '</p>';
    });
  }

  ordersList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cancel-order]');
    if (!btn) return;
    var orderId = btn.getAttribute('data-cancel-order');
    B.confirmDialog('Cancel this order?', 'Order #' + orderId + ' will be cancelled and refunded. Items go back in stock.')
      .then(function (confirmed) {
        if (!confirmed) return;
        B.api('/api/orders/' + orderId + '/cancel', { method: 'POST' })
          .then(function () {
            B.toast('Order cancelled — confirmation email sent.');
            loadOrders();
          })
          .catch(function (err) { B.toast(err.message, 'error'); });
      });
  });

  loadOrders();
})();
