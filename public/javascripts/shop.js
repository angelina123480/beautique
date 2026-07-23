/* Shop page — auto-submit the sort selector. */
(function () {
  'use strict';
  var B = window.Beautique;

  /* Records to search history however the visitor got here — the header
     search panel, this page's own search box, or a direct/shared link —
     since every completed search lands here with ?search=... regardless
     of entry point. */
  var searchInput = B.$('#shop-search-input');
  if (searchInput && searchInput.value.trim()) {
    B.searchHistory.record(searchInput.value);
  }

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
