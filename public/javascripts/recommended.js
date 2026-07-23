/* Shop page — "Recommended for you", based on the most recently viewed
   product. Only renders once there's an actual signal (a real recently
   viewed product) to personalize from — a first-time visitor with no
   history simply doesn't see this section, rather than it silently
   showing a generic list mislabeled as personalized. */
(function () {
  'use strict';
  var B = window.Beautique;

  var section = B.$('#recommended-for-you');
  if (!section) return;

  var recent = B.recentlyViewed.get();
  if (!recent.length) return;
  var anchorId = recent[0].id;

  var onScreenIds = B.$$('.product-card [data-id]').map(function (el) { return Number(el.getAttribute('data-id')); });

  function cardHtml(item) {
    var name = B.escapeHtml(item.name);
    var tone = Number(item.tone) || 340;
    var art = (item.images && item.images[0])
      ? '<img class="art-photo" src="' + B.escapeHtml(item.images[0]) + '" alt="' + name + '" loading="lazy">'
      : '<span class="art-emoji">' + (item.emoji ? B.escapeHtml(item.emoji) : window.BeautiqueIcons.bottle) + '</span>';

    return '' +
      '<article class="product-card reveal is-visible">' +
        '<a href="/product/' + item.id + '" class="product-art' + ((item.images && item.images[0]) ? ' has-photo' : '') + '" style="--tone:' + tone + ';" aria-label="' + name + '">' + art + '</a>' +
        '<div class="product-card-body">' +
          '<span class="product-brand">' + B.escapeHtml(item.brand || '') + '</span>' +
          '<h3><a href="/product/' + item.id + '">' + name + '</a></h3>' +
          '<div class="product-card-foot">' +
            '<span class="price">' + B.money(item.effectivePrice) + '</span>' +
            (!item.available
              ? '<span class="stock-pill stock-out">Sold out</span>'
              : (item.shades && item.shades.length)
                ? '<a class="btn btn-soft btn-sm" href="/product/' + item.id + '">Choose a shade</a>'
                : '<button class="btn btn-primary btn-sm add-to-cart" type="button" data-id="' + item.id + '" data-name="' + name + '" data-price="' + item.effectivePrice + '" data-emoji="' + B.escapeHtml(item.emoji || '') + '" data-tone="' + tone + '" data-stock="' + item.stock + '">Add to bag</button>') +
          '</div>' +
        '</div>' +
      '</article>';
  }

  B.api('/api/products/' + anchorId + '/related?limit=4').then(function (result) {
    var suggestions = (result.products || []).filter(function (p) { return onScreenIds.indexOf(p.id) === -1; });
    if (!suggestions.length) return;
    B.$('#recommended-for-you-grid', section).innerHTML = suggestions.map(cardHtml).join('');
    section.style.display = '';
  }).catch(function () {});
})();
