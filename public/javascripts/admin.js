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
          stock: Number(row.querySelector('input[name="stock"]').value) || 0
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
    var imageInput = B.$('#product-image-input');

    var currentImages = [];
    var editingProductId = null;

    var fieldScentFamily = B.$('#field-scent-family');
    var fieldSkinGoals = B.$('#field-skin-goals');

    /* Only fragrances have a scent family / only skincare has skin goals —
       the quiz questions for a category are meaningless (and shouldn't be
       collected) for products outside it. */
    function updateCategoryFieldVisibility() {
      var category = addForm.elements.category.value;
      var showScent = category === 'fragrance';
      var showSkin = category === 'skincare';
      fieldScentFamily.style.display = showScent ? '' : 'none';
      fieldSkinGoals.style.display = showSkin ? '' : 'none';
      if (!showScent) {
        B.$$('input[name="scentFamily"]', addForm).forEach(function (box) { box.checked = false; });
      }
      if (!showSkin) {
        B.$$('input[name="skinGoals"]', addForm).forEach(function (box) { box.checked = false; });
      }
    }
    addForm.elements.category.addEventListener('change', updateCategoryFieldVisibility);

    var shadeCountInput = B.$('#product-shade-count');
    var shadesContainer = B.$('#product-shades-rows');
    var stockInput = B.$('#product-stock');
    var stockComputedNote = B.$('#stock-computed-note');

    function currentShadeValues() {
      return B.$$('.shade-card', shadesContainer).map(function (row) {
        return {
          label: row.querySelector('[name="shadeLabel"]').value,
          color: row.querySelector('[name="shadeColor"]').value,
          stock: row.querySelector('[name="shadeStock"]').value,
          images: JSON.parse(row.getAttribute('data-images') || '[]')
        };
      });
    }

    /* When a product has shades, its overall stock is the sum of its
       shades' stock (server-computed) — reflect that live here too, so the
       top-level field isn't left showing a stale, editable number. */
    function updateComputedStock() {
      var hasShades = B.$$('.shade-card', shadesContainer).length > 0;
      stockComputedNote.style.display = hasShades ? '' : 'none';
      stockInput.disabled = hasShades;
      if (hasShades) {
        var total = B.$$('.shade-card', shadesContainer).reduce(function (sum, row) {
          return sum + (Number(row.querySelector('[name="shadeStock"]').value) || 0);
        }, 0);
        stockInput.value = total;
      }
    }

    function renderShadeImagesGrid(row) {
      var images = JSON.parse(row.getAttribute('data-images') || '[]');
      row.querySelector('.shade-images-grid').innerHTML = images.map(function (url, idx) {
        return '<div class="image-thumb"><img src="' + B.escapeHtml(url) + '">' +
          '<button type="button" class="image-thumb-edit" data-shade-edit-photo="' + idx + '">Edit</button>' +
          '<button type="button" class="image-thumb-remove" data-shade-remove-photo="' + idx + '" aria-label="Remove photo">' + window.BeautiqueIcons.close + '</button></div>';
      }).join('');
    }

    /* Renders exactly `count` shade rows. Not mandatory — count defaults to
       0 and a product saves fine with no shades at all; any row left with
       a blank name is dropped on submit rather than blocking saving. Each
       row can carry its own photos (data-images), so clicking that shade on
       the product page swaps in real photos instead of just tinting the
       shared ones. */
    function renderShadeRows(count, prefill) {
      var existing = prefill || currentShadeValues();
      var rows = [];
      for (var i = 0; i < count; i++) {
        var val = existing[i] || { label: '', color: '#d9a08b', stock: 0, images: [] };
        rows.push(
          '<div class="shade-card" data-shade-index="' + i + '" data-images=\'' + JSON.stringify(val.images || []) + '\'>' +
            '<div class="field-row">' +
              '<div class="field"><input type="text" name="shadeLabel" placeholder="Shade name (e.g. Rose Nude)" value="' + B.escapeHtml(val.label || '') + '"></div>' +
              '<div class="field"><input type="color" name="shadeColor" value="' + (val.color || '#d9a08b') + '"></div>' +
              '<div class="field"><input type="number" name="shadeStock" min="0" placeholder="Stock" value="' + (val.stock || 0) + '"></div>' +
            '</div>' +
            '<div class="shade-photo-row">' +
              '<div class="shade-photo-group">' +
                '<label>Shade photos</label>' +
                '<div class="image-manager shade-images-grid"></div>' +
                '<button type="button" class="btn btn-ghost btn-sm shade-add-photos-btn">+ Photos</button>' +
                '<input type="file" class="shade-photos-input" accept="image/jpeg,image/png,image/webp,image/gif" multiple style="display:none;">' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }
      shadesContainer.innerHTML = rows.join('');
      B.$$('.shade-card', shadesContainer).forEach(function (row) {
        renderShadeImagesGrid(row);
      });
      updateComputedStock();
    }

    function collectShadeRows() {
      return B.$$('.shade-card', shadesContainer).map(function (row) {
        var label = row.querySelector('[name="shadeLabel"]').value.trim();
        var color = row.querySelector('[name="shadeColor"]').value;
        var stock = Math.max(0, Number(row.querySelector('[name="shadeStock"]').value) || 0);
        var images = JSON.parse(row.getAttribute('data-images') || '[]');
        return label ? { name: label, label: label, color: color, stock: stock, images: images } : null;
      }).filter(Boolean);
    }

    shadeCountInput.addEventListener('input', function () {
      var count = Math.max(0, Math.min(24, Number(shadeCountInput.value) || 0));
      renderShadeRows(count);
    });

    shadesContainer.addEventListener('click', function (e) {
      var addPhotosBtn = e.target.closest('.shade-add-photos-btn');
      if (addPhotosBtn) {
        addPhotosBtn.closest('.shade-card').querySelector('.shade-photos-input').click();
        return;
      }
      var editPhotoBtn = e.target.closest('[data-shade-edit-photo]');
      if (editPhotoBtn) {
        var editPhotoRow = editPhotoBtn.closest('.shade-card');
        var editIndex = Number(editPhotoBtn.getAttribute('data-shade-edit-photo'));
        var editImages = JSON.parse(editPhotoRow.getAttribute('data-images') || '[]');
        editAndUpload(editImages[editIndex]).then(function (url) {
          if (url) {
            editImages[editIndex] = url;
            editPhotoRow.setAttribute('data-images', JSON.stringify(editImages));
            renderShadeImagesGrid(editPhotoRow);
          }
          setStatus('');
        }).catch(function (err) { setStatus(err.message, 'error'); });
        return;
      }
      var removePhotoBtn = e.target.closest('[data-shade-remove-photo]');
      if (removePhotoBtn) {
        var photoRow = removePhotoBtn.closest('.shade-card');
        var images = JSON.parse(photoRow.getAttribute('data-images') || '[]');
        images.splice(Number(removePhotoBtn.getAttribute('data-shade-remove-photo')), 1);
        photoRow.setAttribute('data-images', JSON.stringify(images));
        renderShadeImagesGrid(photoRow);
      }
    });

    shadesContainer.addEventListener('change', function (e) {
      if (e.target.classList.contains('shade-photos-input')) {
        var photoRow = e.target.closest('.shade-card');
        var files = Array.prototype.slice.call(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        files.reduce(function (chain, file) {
          return chain.then(function () {
            return editAndUpload(file).then(function (url) {
              if (url) {
                var images = JSON.parse(photoRow.getAttribute('data-images') || '[]').concat([url]).slice(0, 6);
                photoRow.setAttribute('data-images', JSON.stringify(images));
                renderShadeImagesGrid(photoRow);
              }
            });
          });
        }, Promise.resolve()).then(function () {
          setStatus('');
        }).catch(function (err) { setStatus(err.message, 'error'); });
      }
    });

    shadesContainer.addEventListener('input', function (e) {
      if (e.target.name === 'shadeStock') updateComputedStock();
    });

    function setStatus(message, kind) {
      status.textContent = message || '';
      status.className = 'form-status' + (kind ? ' is-' + kind : '');
    }

    function renderImagesGrid() {
      imagesGrid.innerHTML = currentImages.map(function (url, index) {
        return '<div class="image-thumb"><img src="' + B.escapeHtml(url) + '">' +
          '<button type="button" class="image-thumb-edit" data-edit-image="' + index + '">Edit</button>' +
          '<button type="button" class="image-thumb-remove" data-remove-image="' + index + '" aria-label="Remove photo">' + window.BeautiqueIcons.close + '</button></div>';
      }).join('');
    }

    function uploadFile(file) {
      var fd = new FormData();
      fd.append('image', file);
      return B.api('/api/uploads', { method: 'POST', body: fd }).then(function (result) {
        return result.url;
      });
    }

    /* ---------------- Photo editor (crop / rotate / zoom) ----------------
       Shared by every photo picker on this page. Works on a freshly-picked
       File (before it's ever uploaded) or an existing URL (to re-edit a
       photo already on the product) — openImageEditor() always resolves to
       either a Blob ready to upload, or null if the admin cancelled. */
    var imageEditorModal = B.$('#image-editor-modal');
    var imageEditorImg = B.$('#image-editor-img');
    var imageEditorStatus = B.$('#image-editor-status');
    var imageEditorZoomInput = B.$('#image-editor-zoom');
    var cropperInstance = null;
    var imageEditorResolve = null;
    var imageEditorObjectUrl = null;
    var imageEditorLastZoom = 0;

    function cleanupImageEditor() {
      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }
      if (imageEditorObjectUrl) {
        URL.revokeObjectURL(imageEditorObjectUrl);
        imageEditorObjectUrl = null;
      }
      imageEditorImg.onload = null;
      imageEditorStatus.textContent = '';
      imageEditorStatus.className = 'form-status';
    }

    function finishImageEditor(result) {
      cleanupImageEditor();
      B.closeModal(imageEditorModal);
      if (imageEditorResolve) {
        var resolve = imageEditorResolve;
        imageEditorResolve = null;
        resolve(result);
      }
    }

    /* `source` is either a File/Blob (fresh pick, not uploaded yet) or a
       URL string (an already-uploaded photo being re-edited). */
    function openImageEditor(source) {
      return new Promise(function (resolve) {
        imageEditorResolve = resolve;
        imageEditorLastZoom = 0;
        imageEditorZoomInput.value = 0;

        if (source instanceof Blob) {
          imageEditorImg.removeAttribute('crossorigin');
          imageEditorObjectUrl = URL.createObjectURL(source);
          imageEditorImg.src = imageEditorObjectUrl;
        } else {
          // crossorigin must be set before assigning src, and the URL needs
          // a cache-busting param so the browser can't reuse an earlier,
          // non-CORS-mode fetch of the same image from its cache — either
          // would silently taint the canvas and break exporting later.
          imageEditorImg.crossOrigin = 'anonymous';
          imageEditorImg.src = source + (source.indexOf('?') === -1 ? '?' : '&') + '_edit=' + Date.now();
        }

        B.openModal(imageEditorModal);
        imageEditorImg.onload = function () {
          cropperInstance = new Cropper(imageEditorImg, {
            viewMode: 1,
            autoCropArea: 1,
            background: false,
            responsive: true,
            zoomOnWheel: true
          });
        };
      });
    }

    B.$('#image-editor-rotate-left').addEventListener('click', function () {
      if (cropperInstance) cropperInstance.rotate(-90);
    });
    B.$('#image-editor-rotate-right').addEventListener('click', function () {
      if (cropperInstance) cropperInstance.rotate(90);
    });
    B.$('#image-editor-flip').addEventListener('click', function () {
      if (!cropperInstance) return;
      cropperInstance.scaleX(-(cropperInstance.getData().scaleX || 1));
    });
    B.$('#image-editor-reset').addEventListener('click', function () {
      if (!cropperInstance) return;
      cropperInstance.reset();
      imageEditorLastZoom = 0;
      imageEditorZoomInput.value = 0;
    });
    imageEditorZoomInput.addEventListener('input', function () {
      var value = Number(imageEditorZoomInput.value);
      if (cropperInstance) cropperInstance.zoom(value - imageEditorLastZoom);
      imageEditorLastZoom = value;
    });

    imageEditorModal.addEventListener('click', function (e) {
      if (e.target === imageEditorModal || e.target.closest('[data-close-modal]')) {
        finishImageEditor(null);
      }
    });

    B.$('#image-editor-save').addEventListener('click', function () {
      if (!cropperInstance) return finishImageEditor(null);
      var canvas = cropperInstance.getCroppedCanvas({ maxWidth: 1600, maxHeight: 1600, imageSmoothingQuality: 'high' });
      if (!canvas) {
        imageEditorStatus.textContent = 'Could not read this photo — it may be blocked by the browser. Try re-uploading it fresh.';
        imageEditorStatus.className = 'form-status is-error';
        return;
      }
      canvas.toBlob(function (blob) {
        finishImageEditor(blob);
      }, 'image/jpeg', 0.9);
    });

    /* Runs a freshly-picked file through the editor, then uploads whatever
       the admin saves (or does nothing if they cancel). */
    function editAndUpload(file) {
      return openImageEditor(file).then(function (blob) {
        if (!blob) return null;
        setStatus('Uploading…', 'info');
        return uploadFile(new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' }));
      });
    }

    imageInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(imageInput.files || []);
      imageInput.value = '';
      if (!files.length) return;
      /* One editor session per photo, sequentially — Promise.all would try
         to open the (single, shared) editor modal for every file at once. */
      files.reduce(function (chain, file) {
        return chain.then(function () {
          return editAndUpload(file).then(function (url) {
            if (url) {
              currentImages = currentImages.concat([url]).slice(0, 8);
              renderImagesGrid();
            }
          });
        });
      }, Promise.resolve()).then(function () {
        setStatus('');
      }).catch(function (err) {
        setStatus(err.message, 'error');
      });
    });

    B.$('#product-image-add').addEventListener('click', function () { imageInput.click(); });

    imagesGrid.addEventListener('click', function (e) {
      var editBtn = e.target.closest('[data-edit-image]');
      if (editBtn) {
        var index = Number(editBtn.getAttribute('data-edit-image'));
        editAndUpload(currentImages[index]).then(function (url) {
          if (url) {
            currentImages[index] = url;
            renderImagesGrid();
          }
          setStatus('');
        }).catch(function (err) { setStatus(err.message, 'error'); });
        return;
      }
      var btn = e.target.closest('[data-remove-image]');
      if (!btn) return;
      currentImages.splice(Number(btn.getAttribute('data-remove-image')), 1);
      renderImagesGrid();
    });

    function resetForm() {
      editingProductId = null;
      currentImages = [];
      addForm.reset();
      updateCategoryFieldVisibility();
      shadeCountInput.value = 0;
      renderShadeRows(0);
      modalTitle.textContent = 'Add new product';
      submitBtn.textContent = 'Add product';
      renderImagesGrid();
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
      addForm.elements.name.value = product.name || '';
      addForm.elements.brand.value = product.brand || '';
      addForm.elements.price.value = product.price || 0;
      addForm.elements.salePrice.value = product.salePrice || '';
      addForm.elements.stock.value = product.stock || 0;
      addForm.elements.category.value = product.category || 'makeup';
      updateCategoryFieldVisibility();
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
      var productShades = (product.shades || []).filter(function (s) { return s && typeof s === 'object'; });
      shadeCountInput.value = productShades.length;
      renderShadeRows(productShades.length, productShades.map(function (s) {
        return { label: s.label || s.name || '', color: s.color || '#d9a08b', stock: s.stock || 0, images: s.images || [] };
      }));
      addForm.elements.description.value = product.description || '';
      modalTitle.textContent = 'Edit ' + product.name;
      submitBtn.textContent = 'Save changes';
      renderImagesGrid();
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
        shades: collectShadeRows(),
        description: f.elements.description.value.trim(),
        images: currentImages
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
