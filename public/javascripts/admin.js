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

  /* Sync this deployment's bundled products+categories into the live
     database — the only way local/repo catalog edits (e.g. added via a
     script or a different environment) reach production, since the admin
     panel here only ever writes to whichever store is active where it's
     running. */
  var syncBtn = B.$('#sync-catalog-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', function () {
      B.confirmDialog(
        'Sync catalog to database?',
        'This overwrites the live products & categories with what\'s bundled in this deployment. Any product changes made directly on the live site since the last deploy will be replaced.'
      ).then(function (confirmed) {
        if (!confirmed) return;
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing…';
        B.api('/api/admin/sync-catalog', { method: 'POST' }).then(function (result) {
          B.toast('Synced ' + result.productsCount + ' products and ' + result.categoriesCount + ' categories.');
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync catalog to database';
          setTimeout(function () { window.location.reload(); }, 900);
        }).catch(function (err) {
          B.toast(err.message, 'error');
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync catalog to database';
        });
      });
    });
  }

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
        B.toast('Inventory updated');
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

    var deleteCategoryBtn = e.target.closest('[data-delete-category]');
    if (deleteCategoryBtn) {
      var categoryId = deleteCategoryBtn.getAttribute('data-delete-category');
      var categoryTitle = deleteCategoryBtn.getAttribute('data-category-title');
      B.confirmDialog('Delete "' + categoryTitle + '"?', 'This removes the category. Move or delete its products first if it has any.')
        .then(function (confirmed) {
          if (!confirmed) return;
          B.api('/api/categories/' + categoryId, { method: 'DELETE' })
            .then(function () {
              B.toast('Category deleted.');
              deleteCategoryBtn.closest('tr').remove();
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
        B.toast('Order updated — customer notified');
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
      return;
    }

    /* Reviews — edit comment text or delete the review outright */
    var reviewEditBtn = e.target.closest('[data-review-edit]');
    if (reviewEditBtn) {
      var reviewItem = reviewEditBtn.closest('[data-review]');
      reviewItem.querySelector('.review-comment-view').style.display = 'none';
      reviewItem.querySelector('.review-comment-edit').style.display = '';
      reviewItem.querySelector('[data-review-edit]').style.display = 'none';
      reviewItem.querySelector('[data-review-save]').style.display = '';
      reviewItem.querySelector('[data-review-cancel]').style.display = '';
      reviewItem.querySelector('.review-comment-edit').focus();
      return;
    }

    var reviewCancelBtn = e.target.closest('[data-review-cancel]');
    if (reviewCancelBtn) {
      var cancelItem = reviewCancelBtn.closest('[data-review]');
      var viewEl = cancelItem.querySelector('.review-comment-view');
      var editEl = cancelItem.querySelector('.review-comment-edit');
      editEl.value = viewEl.textContent;
      editEl.style.display = 'none';
      viewEl.style.display = viewEl.textContent ? '' : 'none';
      cancelItem.querySelector('[data-review-edit]').style.display = '';
      cancelItem.querySelector('[data-review-save]').style.display = 'none';
      cancelItem.querySelector('[data-review-cancel]').style.display = 'none';
      return;
    }

    var reviewSaveBtn = e.target.closest('[data-review-save]');
    if (reviewSaveBtn) {
      var saveItem = reviewSaveBtn.closest('[data-review]');
      var productId = saveItem.getAttribute('data-product-id');
      var reviewId = saveItem.getAttribute('data-review-id');
      var comment = saveItem.querySelector('.review-comment-edit').value.trim();

      B.api('/api/products/' + productId + '/reviews/' + reviewId, {
        method: 'PATCH',
        body: { comment: comment }
      }).then(function () {
        var viewEl2 = saveItem.querySelector('.review-comment-view');
        viewEl2.textContent = comment;
        viewEl2.style.display = comment ? '' : 'none';
        saveItem.querySelector('.review-comment-edit').style.display = 'none';
        saveItem.querySelector('[data-review-edit]').style.display = '';
        saveItem.querySelector('[data-review-save]').style.display = 'none';
        saveItem.querySelector('[data-review-cancel]').style.display = 'none';
        B.toast('Review updated');
      }).catch(function (err) { B.toast(err.message, 'error'); });
      return;
    }

    var reviewDeleteBtn = e.target.closest('[data-review-delete]');
    if (reviewDeleteBtn) {
      var deleteItem = reviewDeleteBtn.closest('[data-review]');
      var delProductId = deleteItem.getAttribute('data-product-id');
      var delReviewId = deleteItem.getAttribute('data-review-id');

      B.confirmDialog('Delete this review?', 'This permanently removes the review from the product page.')
        .then(function (confirmed) {
          if (!confirmed) return;
          B.api('/api/products/' + delProductId + '/reviews/' + delReviewId, { method: 'DELETE' })
            .then(function () {
              B.toast('Review deleted.');
              deleteItem.remove();
            })
            .catch(function (err) { B.toast(err.message, 'error'); });
        });
    }
  });

  /* Add / edit product */
  var addForm = B.$('#add-product-form');
  if (addForm) {
    var status = B.$('#add-product-status');
    var modalTitle = B.$('#product-modal-title');
    var submitBtn = B.$('#product-submit-btn');
    var imagesGrid = B.$('#product-images-grid');
    var modelImagePreview = B.$('#product-model-image-preview');
    var imageInput = B.$('#product-image-input');
    var modelImageInput = B.$('#product-model-image-input');

    var currentImages = [];
    var currentModelImage = '';
    var editingProductId = null;

    function setStatus(message, kind) {
      status.textContent = message || '';
      status.className = 'form-status' + (kind ? ' is-' + kind : '');
    }

    function renderImagesGrid() {
      imagesGrid.innerHTML = currentImages.map(function (url, index) {
        return '<div class="image-thumb"><img src="' + B.escapeHtml(url) + '">' +
          '<button type="button" class="image-thumb-remove" data-remove-image="' + index + '" aria-label="Remove photo">' + window.BeautiqueIcons.close + '</button></div>';
      }).join('');
    }

    function renderModelImagePreview() {
      modelImagePreview.innerHTML = currentModelImage
        ? '<div class="image-thumb"><img src="' + B.escapeHtml(currentModelImage) + '">' +
          '<button type="button" class="image-thumb-remove" id="remove-model-image" aria-label="Remove photo">' + window.BeautiqueIcons.close + '</button></div>'
        : '';
    }

    function uploadFile(file) {
      var fd = new FormData();
      fd.append('image', file);
      return B.api('/api/uploads', { method: 'POST', body: fd }).then(function (result) {
        return result.url;
      });
    }

    imageInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(imageInput.files || []);
      imageInput.value = '';
      if (!files.length) return;
      setStatus('Uploading…', 'info');
      Promise.all(files.map(uploadFile)).then(function (urls) {
        currentImages = currentImages.concat(urls).slice(0, 8);
        renderImagesGrid();
        setStatus('');
      }).catch(function (err) {
        setStatus(err.message, 'error');
      });
    });

    modelImageInput.addEventListener('change', function () {
      var file = modelImageInput.files && modelImageInput.files[0];
      modelImageInput.value = '';
      if (!file) return;
      setStatus('Uploading…', 'info');
      uploadFile(file).then(function (url) {
        currentModelImage = url;
        renderModelImagePreview();
        setStatus('');
      }).catch(function (err) {
        setStatus(err.message, 'error');
      });
    });

    B.$('#product-image-add').addEventListener('click', function () { imageInput.click(); });
    B.$('#product-model-image-add').addEventListener('click', function () { modelImageInput.click(); });

    imagesGrid.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove-image]');
      if (!btn) return;
      currentImages.splice(Number(btn.getAttribute('data-remove-image')), 1);
      renderImagesGrid();
    });

    modelImagePreview.addEventListener('click', function (e) {
      if (e.target.id === 'remove-model-image') {
        currentModelImage = '';
        renderModelImagePreview();
      }
    });

    function resetForm() {
      editingProductId = null;
      currentImages = [];
      currentModelImage = '';
      addForm.reset();
      modalTitle.textContent = 'Add new product';
      submitBtn.textContent = 'Add product';
      renderImagesGrid();
      renderModelImagePreview();
      setStatus('');
    }

    var openBtn = B.$('#add-product-open');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        resetForm();
        B.openModal('add-product-modal');
      });
    }

    document.addEventListener('click', function (e) {
      var editBtn = e.target.closest('[data-edit-product]');
      if (!editBtn) return;
      var product = JSON.parse(editBtn.getAttribute('data-edit-product'));

      editingProductId = product.id;
      currentImages = (product.images || []).slice();
      currentModelImage = product.modelImage || '';
      addForm.elements.name.value = product.name || '';
      addForm.elements.brand.value = product.brand || '';
      addForm.elements.price.value = product.price || 0;
      addForm.elements.salePrice.value = product.salePrice || '';
      addForm.elements.stock.value = product.stock || 0;
      addForm.elements.category.value = product.category || 'makeup';
      addForm.elements.badge.value = product.badge || '';
      addForm.elements.emoji.value = product.emoji || '';
      var productScentFamily = product.scentFamily || [];
      B.$$('input[name="scentFamily"]', addForm).forEach(function (box) {
        box.checked = productScentFamily.indexOf(box.value) !== -1;
      });
      var productSkinGoals = product.skinGoals || [];
      B.$$('input[name="skinGoals"]', addForm).forEach(function (box) {
        box.checked = productSkinGoals.indexOf(box.value) !== -1;
      });
      addForm.elements.description.value = product.description || '';
      modalTitle.textContent = 'Edit ' + product.name;
      submitBtn.textContent = 'Save changes';
      renderImagesGrid();
      renderModelImagePreview();
      setStatus('');
      B.openModal('add-product-modal');
    });

    addForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = addForm;
      var payload = {
        name: f.elements.name.value.trim(),
        brand: f.elements.brand.value.trim(),
        price: Number(f.elements.price.value) || 0,
        salePrice: f.elements.salePrice.value.trim() ? Number(f.elements.salePrice.value) : null,
        stock: Number(f.elements.stock.value) || 0,
        category: f.elements.category.value,
        badge: f.elements.badge.value.trim(),
        emoji: f.elements.emoji.value.trim(),
        scentFamily: B.$$('input[name="scentFamily"]:checked', f).map(function (box) { return box.value; }),
        skinGoals: B.$$('input[name="skinGoals"]:checked', f).map(function (box) { return box.value; }),
        description: f.elements.description.value.trim(),
        images: currentImages,
        modelImage: currentModelImage
      };

      var isEdit = editingProductId !== null;
      var url = isEdit ? '/api/products/' + editingProductId : '/api/products';
      var method = isEdit ? 'PATCH' : 'POST';

      B.api(url, { method: method, body: payload }).then(function () {
        B.toast(isEdit ? 'Product updated' : 'Product added');
        setTimeout(function () { window.location.reload(); }, 700);
      }).catch(function (err) {
        setStatus(err.message, 'error');
      });
    });
  }

  /* Add category */
  var categoryForm = B.$('#add-category-form');
  if (categoryForm) {
    var categoryStatus = B.$('#add-category-status');
    var toneInput = B.$('#category-tone-input');
    var tonePreview = B.$('#category-tone-preview');

    function paintTonePreview() {
      var tone = Math.min(360, Math.max(0, Number(toneInput.value) || 0));
      tonePreview.style.background = 'hsl(' + tone + ' 72% 88%)';
    }
    toneInput.addEventListener('input', paintTonePreview);

    var categoryOpenBtn = B.$('#add-category-open');
    if (categoryOpenBtn) {
      categoryOpenBtn.addEventListener('click', function () {
        categoryForm.reset();
        toneInput.value = 200;
        paintTonePreview();
        categoryStatus.textContent = '';
        categoryStatus.className = 'form-status';
        B.openModal('add-category-modal');
      });
    }

    categoryForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = categoryForm;
      var payload = {
        title: f.elements.title.value.trim(),
        emoji: f.elements.emoji.value.trim() || '🌸',
        tone: Number(f.elements.tone.value) || 0,
        text: f.elements.text.value.trim()
      };

      B.api('/api/categories', { method: 'POST', body: payload }).then(function () {
        B.toast('Category added');
        setTimeout(function () { window.location.reload(); }, 700);
      }).catch(function (err) {
        categoryStatus.textContent = err.message;
        categoryStatus.className = 'form-status is-error';
      });
    });
  }
})();
