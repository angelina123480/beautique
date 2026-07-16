/* Home page — newsletter signup. */
(function () {
  'use strict';
  var B = window.Beautique;

  var form = B.$('#newsletter-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = B.$('#newsletter-email').value.trim();
    if (!email) return;

    B.api('/api/contact', {
      method: 'POST',
      body: { name: 'Newsletter subscriber', email: email, message: 'Please add me to the Beautique newsletter. 💌' }
    }).then(function () {
      form.reset();
      B.toast('Welcome to the glow list ✨');
    }).catch(function (err) {
      B.toast(err.message, 'error');
    });
  });
})();
