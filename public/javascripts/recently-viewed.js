/* Recently viewed — renders straight from localStorage (see product.js,
   which records the snapshot, and app.js's B.recentlyViewed). Included on
   the shop and home pages; renders nothing if the visitor hasn't viewed a
   product yet. */
(function () {
  'use strict';
  var B = window.Beautique;

  var section = B.$('#recently-viewed');
  if (!section) return;
  var grid = B.$('#recently-viewed-grid', section);

  function cardHtml(item) {
    var name = B.escapeHtml(item.name);
    var tone = Number(item.tone) || 340;
    var stock = Number(item.stock) || 0;
    var art = item.image
      ? '<img class="art-photo" src="' + B.escapeHtml(item.image) + '" alt="' + name + '" loading="lazy">'
      : '<span class="art-emoji">' + (item.emoji ? B.escapeHtml(item.emoji) : window.BeautiqueIcons.bottle) + '</span>';

    return '' +
      '<article class="product-card reveal is-visible">' +
        '<a href="/product/' + item.id + '" class="product-art" style="--tone:' + tone + ';" aria-label="' + name + '">' + art + '</a>' +
        '<div class="product-card-body">' +
          '<h3><a href="/product/' + item.id + '">' + name + '</a></h3>' +
          '<div class="product-card-foot">' +
            '<span class="price">' + B.money(item.price) + '</span>' +
            (stock <= 0
              ? '<span class="stock-pill stock-out">Sold out</span>'
              : item.hasShades
                ? '<a class="btn btn-soft btn-sm" href="/product/' + item.id + '">Choose a shade</a>'
                : '<button class="btn btn-primary btn-sm add-to-cart" type="button" data-id="' + item.id + '" data-name="' + name + '" data-price="' + item.price + '" data-emoji="' + B.escapeHtml(item.emoji || '') + '" data-tone="' + tone + '" data-stock="' + stock + '">Add to bag</button>') +
          '</div>' +
        '</div>' +
      '</article>';
  }

  var items = B.recentlyViewed.get().filter(function (item) {
    return Number(item.id) !== Number(section.getAttribute('data-exclude-id'));
  });

  if (!items.length) return;
  grid.innerHTML = items.slice(0, 4).map(cardHtml).join('');
  section.style.display = '';
})();
