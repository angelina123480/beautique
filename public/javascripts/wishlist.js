/* Wishlist page — renders saved items straight from localStorage. */
(function () {
  'use strict';
  var B = window.Beautique;

  var grid = B.$('#wishlist-grid');
  if (!grid) return;
  var emptyState = B.$('#wishlist-empty');

  function cardHtml(item) {
    var name = B.escapeHtml(item.name);
    var tone = Number(item.tone) || 340;
    var stock = Number(item.stock) || 99;
    var art = item.image
      ? '<img class="art-photo" src="' + B.escapeHtml(item.image) + '" alt="' + name + '" loading="lazy">'
      : '<span class="art-emoji">' + (item.emoji ? B.escapeHtml(item.emoji) : window.BeautiqueIcons.bottle) + '</span>';

    return '' +
      '<article class="product-card reveal is-visible">' +
        '<button type="button" class="wishlist-btn is-active" data-id="' + item.id + '" data-name="' + name + '" data-price="' + item.price + '" data-emoji="' + B.escapeHtml(item.emoji || '') + '" data-tone="' + tone + '" data-image="' + B.escapeHtml(item.image || '') + '" data-stock="' + stock + '" aria-label="Remove ' + name + ' from wishlist" aria-pressed="true">' + window.BeautiqueIcons.heart + '</button>' +
        '<a href="/product/' + item.id + '" class="product-art" style="--tone:' + tone + ';" aria-label="' + name + '">' + art + '</a>' +
        '<div class="product-card-body">' +
          '<h3><a href="/product/' + item.id + '">' + name + '</a></h3>' +
          '<div class="product-card-foot">' +
            '<span class="price">' + B.money(item.price) + '</span>' +
            '<button class="btn btn-primary btn-sm add-to-cart" type="button" data-id="' + item.id + '" data-name="' + name + '" data-price="' + item.price + '" data-emoji="' + B.escapeHtml(item.emoji || '') + '" data-tone="' + tone + '" data-stock="' + stock + '">Add to bag</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function render() {
    var items = B.wishlist.get();
    grid.innerHTML = items.map(cardHtml).join('');
    grid.style.display = items.length ? '' : 'none';
    emptyState.style.display = items.length ? 'none' : '';
  }

  render();
  document.addEventListener('wishlist:change', render);
})();
