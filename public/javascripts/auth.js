/* Auth page — sign in / sign up tabs and OTP verification. */
(function () {
  'use strict';
  var B = window.Beautique;

  var form = B.$('#auth-form');
  if (!form) return;

  var mode = 'signin';
  var pendingEmail = '';
  var status = B.$('#auth-status');
  var otpBoxes = B.$$('#otp-inputs input');

  function setStatus(message, kind) {
    status.textContent = message || '';
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function setMode(next) {
    mode = next;
    B.$$('.auth-toggle').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-mode') === mode);
    });
    var isSignup = mode === 'signup';
    B.$('#field-name').style.display = isSignup ? '' : 'none';
    B.$('#field-role').style.display = isSignup ? '' : 'none';
    B.$('#field-invite').style.display = isSignup && B.$('#auth-role').value === 'admin' ? '' : 'none';
    B.$('#auth-submit').textContent = isSignup ? 'Create account' : 'Sign in';
    B.$('#auth-password').setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
    setStatus('');
  }

  B.$$('.auth-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
  });

  B.$('#auth-role').addEventListener('change', function () {
    B.$('#field-invite').style.display = this.value === 'admin' ? '' : 'none';
  });

  function showOtpStep(email, devOtp) {
    pendingEmail = email;
    B.$('#auth-step').style.display = 'none';
    B.$('#otp-step').style.display = '';
    B.$('#otp-email-label').textContent = email;
    var devNote = B.$('#dev-otp-note');
    if (devOtp) {
      devNote.textContent = '🛠️ Dev mode — your verification code is: ' + devOtp;
      devNote.style.display = '';
    } else {
      devNote.style.display = 'none';
    }
    otpBoxes.forEach(function (box) { box.value = ''; });
    otpBoxes[0].focus();
    setStatus('');
  }

  function hideOtpStep() {
    B.$('#auth-step').style.display = '';
    B.$('#otp-step').style.display = 'none';
    pendingEmail = '';
    setStatus('');
  }

  /* Segmented OTP input behavior */
  otpBoxes.forEach(function (box, index) {
    box.addEventListener('input', function () {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      if (box.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus();
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !box.value && index > 0) otpBoxes[index - 1].focus();
      if (e.key === 'Enter') { e.preventDefault(); B.$('#otp-submit').click(); }
    });
    box.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (text.length >= 2) {
        e.preventDefault();
        text.split('').slice(0, 6).forEach(function (char, i) { if (otpBoxes[i]) otpBoxes[i].value = char; });
        otpBoxes[Math.min(text.length, 6) - 1].focus();
      }
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = B.$('#auth-email').value.trim();
    var password = B.$('#auth-password').value;

    if (!email || !password) {
      setStatus('Please fill in your email and password.', 'error');
      return;
    }

    var endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin';
    var payload = { email: email, password: password };
    if (mode === 'signup') {
      payload.name = B.$('#auth-name').value.trim();
      payload.role = B.$('#auth-role').value;
      payload.inviteCode = B.$('#auth-invite').value.trim();
    }

    setStatus('One moment…', 'info');
    B.api(endpoint, { method: 'POST', body: payload }).then(function (response) {
      if (response.requiresOtp) {
        showOtpStep(response.email, response.devOtp);
      } else {
        setStatus('Welcome back! Redirecting…', 'success');
        window.location.href = response.user && response.user.role === 'admin' ? '/admin' : '/profile';
      }
    }).catch(function (err) {
      setStatus(err.message, 'error');
    });
  });

  B.$('#otp-submit').addEventListener('click', function () {
    var code = otpBoxes.map(function (box) { return box.value; }).join('');
    if (code.length < 6) {
      setStatus('Please enter the 6-digit code.', 'error');
      return;
    }
    setStatus('Verifying…', 'info');
    B.api('/api/auth/verify-otp', { method: 'POST', body: { email: pendingEmail, otp: code } })
      .then(function (response) {
        setStatus('Verified! Redirecting…', 'success');
        window.location.href = response.user && response.user.role === 'admin' ? '/admin' : '/profile';
      })
      .catch(function (err) {
        setStatus(err.message, 'error');
      });
  });

  B.$('#otp-resend').addEventListener('click', function (e) {
    e.preventDefault();
    B.api('/api/auth/resend-otp', { method: 'POST', body: { email: pendingEmail } })
      .then(function (response) {
        var devNote = B.$('#dev-otp-note');
        if (response.devOtp) {
          devNote.textContent = '🛠️ Dev mode — your verification code is: ' + response.devOtp;
          devNote.style.display = '';
        }
        setStatus('A new code has been sent.', 'success');
      })
      .catch(function (err) { setStatus(err.message, 'error'); });
  });

  B.$('#otp-back').addEventListener('click', function (e) {
    e.preventDefault();
    hideOtpStep();
  });
})();
