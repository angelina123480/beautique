/* Admin dashboard — tabs, inventory edits, order management. */
(function () {
  'use strict';
  var B = window.Beautique;

  var tabRow = B.$('.tab-row');
  if (!tabRow) return;

  /* Tabs */
  tabRow.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    B.$$('.tab-row button').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
    B.$$('.tab-panel').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.id === 'tab-' + btn.getAttribute('data-tab'));
    });
  });

  /* Save product (price / stock / sold out) */
  document.addEventListener('click', function (e) {
    var saveBtn = e.target.closest('[data-save-product]');
    if (saveBtn) {
      var row = saveBtn.closest('tr');
      var id = saveBtn.getAttribute('data-save-product');
      B.api('/api/products/' + id, {
        method: 'PATCH',
        body: {
          price: Number(row.querySelector('input[name="price"]').value) || 0,
          stock: Number(row.querySelector('input[name="stock"]').value) || 0,
          soldOut: row.querySelector('input[name="soldOut"]').checked
        }
      }).then(function () {
        B.toast('Inventory updated ✔');
      }).catch(function (err) {
        B.toast(err.message, 'error');
      });
      return;
    }

    var deleteBtn = e.target.closest('[data-delete-product]');
    if (deleteBtn) {
      var productId = deleteBtn.getAttribute('data-delete-product');
      var name = deleteBtn.getAttribute('data-product-name');
      B.confirmDialog('Delete "' + name + '"?', 'This removes the product from the shop permanently. Existing orders keep their history.')
        .then(function (confirmed) {
          if (!confirmed) return;
          B.api('/api/products/' + productId, { method: 'DELETE' })
            .then(function () {
              B.toast('Product deleted.');
              deleteBtn.closest('tr').remove();
            })
            .catch(function (err) { B.toast(err.message, 'error'); });
        });
      return;
    }

    var statusBtn = e.target.closest('[data-order-status]');
    if (statusBtn) {
      B.api('/api/orders/' + statusBtn.getAttribute('data-order-status') + '/status', {
        method: 'POST',
        body: { status: statusBtn.getAttribute('data-status') }
      }).then(function () {
        B.toast('Order updated — customer notified 📬');
        setTimeout(function () { window.location.reload(); }, 700);
      }).catch(function (err) { B.toast(err.message, 'error'); });
      return;
    }

    var cancelBtn = e.target.closest('[data-order-cancel]');
    if (cancelBtn) {
      var orderId = cancelBtn.getAttribute('data-order-cancel');
      B.confirmDialog('Cancel order #' + orderId + '?', 'The customer will be emailed and the items restocked.')
        .then(function (confirmed) {
          if (!confirmed) return;
          B.api('/api/orders/' + orderId + '/cancel', { method: 'POST' })
            .then(function () {
              B.toast('Order cancelled.');
              setTimeout(function () { window.location.reload(); }, 700);
            })
            .catch(function (err) { B.toast(err.message, 'error'); });
        });
    }
  });

  /* Add product */
  var openBtn = B.$('#add-product-open');
  if (openBtn) {
    openBtn.addEventListener('click', function () { B.openModal('add-product-modal'); });
  }

  var addForm = B.$('#add-product-form');
  if (addForm) {
    addForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = addForm;
      var status = B.$('#add-product-status');
      var image = f.elements.image.value.trim();

      B.api('/api/products', {
        method: 'POST',
        body: {
          name: f.elements.name.value.trim(),
          brand: f.elements.brand.value.trim(),
          price: Number(f.elements.price.value) || 0,
          stock: Number(f.elements.stock.value) || 0,
          category: f.elements.category.value,
          badge: f.elements.badge.value.trim(),
          emoji: f.elements.emoji.value.trim() || '🌸',
          description: f.elements.description.value.trim(),
          images: image ? [image] : []
        }
      }).then(function () {
        B.toast('Product added 🎀');
        setTimeout(function () { window.location.reload(); }, 700);
      }).catch(function (err) {
        status.textContent = err.message;
        status.className = 'form-status is-error';
      });
    });
  }
})();
