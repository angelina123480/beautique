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
})();
