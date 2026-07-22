/* Shop page — auto-submit the sort selector. */
(function () {
  'use strict';
  var B = window.Beautique;

  var sort = B.$('#shop-sort');
  if (sort) {
    sort.addEventListener('change', function () {
      B.$('#shop-sort-form').submit();
    });
  }

  var filtersForm = B.$('#shop-filters-form');
  if (filtersForm) {
    ['shop-filter-price', 'shop-filter-rating', 'shop-filter-brand', 'shop-filter-scent', 'shop-filter-skin', 'shop-filter-instock', 'shop-filter-onsale'].forEach(function (id) {
      var field = B.$('#' + id);
      if (field) field.addEventListener('change', function () { filtersForm.submit(); });
    });
  }
})();
