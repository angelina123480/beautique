/* Contact page — message form. */
(function () {
  'use strict';
  var B = window.Beautique;

  var form = B.$('#contact-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var status = B.$('#contact-status');
    B.api('/api/contact', {
      method: 'POST',
      body: {
        name: B.$('#contact-name').value.trim(),
        email: B.$('#contact-email').value.trim(),
        message: B.$('#contact-message').value.trim()
      }
    }).then(function (result) {
      form.reset();
      status.textContent = result.message;
      status.className = 'form-status is-success';
      B.toast('Message sent 💌');
    }).catch(function (err) {
      status.textContent = err.message;
      status.className = 'form-status is-error';
    });
  });
})();
