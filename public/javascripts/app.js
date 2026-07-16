/* Beautique core — helpers, toasts, modals, cart drawer, delivery address.
   Loaded on every page; page-specific scripts build on window.Beautique. */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var money = function (n) { return '$' + (Number(n) || 0).toFixed(2); };

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function api(url, options) {
    options = options || {};
    return fetch(url, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.message || 'Something went wrong. Please try again.');
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  /* ---------------- Toasts ---------------- */

  function toast(message, type) {
    var stack = $('#toast-stack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'success');
    el.innerHTML = '<span class="toast-icon">' + (type === 'error' ? '✖' : '✔') + '</span><span></span>';
    el.lastChild.textContent = message;
    stack.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 300);
    }, 3400);
  }

  /* ---------------- Modals ---------------- */

  function openModal(id) {
    var modal = typeof id === 'string' ? $('#' + id) : id;
    if (modal) modal.classList.add('is-open');
  }

  function closeModal(el) {
    var backdrop = el.closest ? el.closest('.modal-backdrop') : null;
    (backdrop || el).classList.remove('is-open');
  }

  document.addEventListener('click', function (e) {
    var closer = e.target.closest('[data-close-modal]');
    if (closer) {
      closeModal(closer);
      return;
    }
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('is-open');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $$('.modal-backdrop.is-open').forEach(function (m) { m.classList.remove('is-open'); });
      closeCartDrawer();
    }
  });

  /* Confirm dialog (promise-based replacement for window.confirm) */
  var confirmResolve = null;

  function confirmDialog(title, text) {
    var modal = $('#confirm-modal');
    if (!modal) return Promise.resolve(window.confirm(text));
    $('#confirm-title').textContent = title || 'Are you sure?';
    $('#confirm-text').textContent = text || '';
    openModal(modal);
    return new Promise(function (resolve) {
      confirmResolve = resolve;
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.id === 'confirm-yes') {
      closeModal(e.target);
      if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
    } else if (confirmResolve && (e.target.closest('#confirm-modal [data-close-modal]') || e.target.id === 'confirm-modal')) {
      confirmResolve(false);
      confirmResolve = null;
    }
  });

  /* ---------------- Mobile nav ---------------- */

  var navToggle = $('#nav-toggle');
  if (navToggle) {
    navToggle.addEventListener('click', function () {
      $('#mobile-nav').classList.toggle('is-open');
    });
  }

  /* ---------------- Cart ---------------- */

  var CART_KEY = 'beautiqueCart';
  var FREE_SHIPPING = 50;
  var SHIPPING_FLAT = 5.95;

  localStorage.removeItem('lunaCart'); // legacy key from the old site

  function getCart() {
    try {
      var cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(cart) ? cart : [];
    } catch (err) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart();
  }

  function cartCount(cart) {
    return (cart || getCart()).reduce(function (sum, item) { return sum + (item.quantity || 0); }, 0);
  }

  function cartSubtotal(cart) {
    return (cart || getCart()).reduce(function (sum, item) { return sum + item.price * item.quantity; }, 0);
  }

  function addToCart(item, quantity) {
    var cart = getCart();
    var existing = cart.find(function (line) { return line.id === item.id && line.shade === item.shade; });
    var stock = Number(item.stock) || 99;
    var wanted = (existing ? existing.quantity : 0) + (quantity || 1);

    if (wanted > stock) {
      wanted = stock;
      toast('Only ' + stock + ' in stock — bag adjusted.', 'error');
    }
    if (existing) {
      existing.quantity = wanted;
      existing.stock = stock;
    } else {
      cart.push({ id: item.id, name: item.name, price: item.price, emoji: item.emoji, tone: item.tone, stock: stock, quantity: wanted, shade: item.shade || '' });
    }
    saveCart(cart);
  }

  function setQuantity(id, quantity) {
    var cart = getCart();
    var line = cart.find(function (item) { return item.id === id; });
    if (!line) return;
    var stock = Number(line.stock) || 99;
    if (quantity > stock) {
      quantity = stock;
      toast('Only ' + stock + ' in stock.', 'error');
    }
    if (quantity <= 0) {
      cart = cart.filter(function (item) { return item.id !== id; });
    } else {
      line.quantity = quantity;
    }
    saveCart(cart);
  }

  function removeFromCart(id) {
    saveCart(getCart().filter(function (item) { return item.id !== id; }));
  }

  function clearCart() {
    saveCart([]);
  }

  function cartLineHtml(item) {
    return '' +
      '<div class="cart-line" data-id="' + item.id + '">' +
        '<span class="product-art" style="--tone:' + (Number(item.tone) || 340) + ';"><span class="art-emoji" style="font-size:26px;">' + escapeHtml(item.emoji || '🌸') + '</span></span>' +
        '<div class="cart-line-info">' +
          '<strong>' + escapeHtml(item.name) + '</strong>' +
          (item.shade ? '<span class="cart-line-price">Shade: ' + escapeHtml(item.shade) + '</span><br>' : '') +
          '<span class="cart-line-price">' + money(item.price) + ' each</span><br>' +
          '<span class="qty-stepper">' +
            '<button type="button" data-cart-minus="' + item.id + '" aria-label="Decrease">−</button>' +
            '<span class="qty-val">' + item.quantity + '</span>' +
            '<button type="button" data-cart-plus="' + item.id + '" aria-label="Increase">+</button>' +
          '</span> ' +
          '<button class="cart-line-remove" type="button" data-cart-remove="' + item.id + '">Remove</button>' +
        '</div>' +
        '<span class="cart-line-total">' + money(item.price * item.quantity) + '</span>' +
      '</div>';
  }

  function renderCart() {
    var cart = getCart();
    var badge = $('#cart-count-badge');
    if (badge) {
      var count = cartCount(cart);
      badge.textContent = count;
      badge.classList.toggle('is-visible', count > 0);
    }

    var body = $('#cart-body');
    var foot = $('#cart-foot');
    if (!body || !foot) return;

    if (!cart.length) {
      body.innerHTML = '<div class="cart-empty-state"><span class="cart-empty-emoji">🛍️</span><strong>Your bag is empty</strong><p style="margin-top:6px;">Fill it with something lovely.</p><a class="btn btn-primary btn-sm" href="/shop">Start shopping</a></div>';
      foot.innerHTML = '';
      return;
    }

    body.innerHTML = cart.map(cartLineHtml).join('');

    var subtotal = cartSubtotal(cart);
    var shipping = subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FLAT;
    var remaining = FREE_SHIPPING - subtotal;
    var progress = Math.min(100, Math.round((subtotal / FREE_SHIPPING) * 100));

    foot.innerHTML = '' +
      (remaining > 0
        ? '<div class="free-ship-note" style="color: var(--gold);">Add ' + money(remaining) + ' more for free shipping ✨</div>'
        : '<div class="free-ship-note">🎉 You unlocked free shipping!</div>') +
      '<div class="free-ship-progress"><i style="width:' + progress + '%"></i></div>' +
      '<div class="cart-totals-row"><span>Subtotal</span><span>' + money(subtotal) + '</span></div>' +
      '<div class="cart-totals-row"><span>Shipping</span><span>' + (shipping === 0 ? 'Free' : money(shipping)) + '</span></div>' +
      '<div class="cart-totals-row grand"><span>Total</span><span>' + money(subtotal + shipping) + '</span></div>' +
      '<a class="btn btn-primary btn-block" href="/checkout">Checkout</a>';
  }

  /* Drawer open/close */
  function openCartDrawer() {
    var drawer = $('#cart-drawer');
    if (!drawer) return;
    renderCart();
    drawer.classList.add('is-open');
    $('#drawer-overlay').classList.add('is-open');
  }

  function closeCartDrawer() {
    var drawer = $('#cart-drawer');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    $('#drawer-overlay').classList.remove('is-open');
  }

  var cartOpen = $('#cart-open');
  if (cartOpen) cartOpen.addEventListener('click', openCartDrawer);
  var cartClose = $('#cart-close');
  if (cartClose) cartClose.addEventListener('click', closeCartDrawer);
  var overlay = $('#drawer-overlay');
  if (overlay) overlay.addEventListener('click', closeCartDrawer);

  /* Cart interactions (delegated) */
  document.addEventListener('click', function (e) {
    var add = e.target.closest('.add-to-cart');
    if (add) {
      var qty = Number(add.getAttribute('data-qty')) || 1;
      addToCart({
        id: Number(add.getAttribute('data-id')),
        name: add.getAttribute('data-name'),
        price: Number(add.getAttribute('data-price')),
        emoji: add.getAttribute('data-emoji'),
        tone: Number(add.getAttribute('data-tone')),
        stock: Number(add.getAttribute('data-stock')),
        shade: add.getAttribute('data-shade') || ''
      }, qty);
      toast('Added to your bag 🛍️');
      openCartDrawer();
      return;
    }

    var minus = e.target.closest('[data-cart-minus]');
    if (minus) {
      var id1 = Number(minus.getAttribute('data-cart-minus'));
      var line1 = getCart().find(function (item) { return item.id === id1; });
      if (line1) setQuantity(id1, line1.quantity - 1);
      return;
    }

    var plus = e.target.closest('[data-cart-plus]');
    if (plus) {
      var id2 = Number(plus.getAttribute('data-cart-plus'));
      var line2 = getCart().find(function (item) { return item.id === id2; });
      if (line2) setQuantity(id2, line2.quantity + 1);
      return;
    }

    var remove = e.target.closest('[data-cart-remove]');
    if (remove) {
      removeFromCart(Number(remove.getAttribute('data-cart-remove')));
    }
  });

  /* ---------------- Delivery address + lazy map ---------------- */

  var ADDRESS_KEY = 'beautiqueAddress';
  var deliverPill = $('#deliver-pill');
  var signedIn = deliverPill && deliverPill.getAttribute('data-signed-in') === '1';
  var map = null;
  var marker = null;
  var leafletLoading = null;

  function setPillText(address) {
    var label = $('#deliver-pill-text');
    if (label) label.textContent = address || 'Set delivery address';
  }

  if (deliverPill) {
    if (!signedIn) {
      var savedAddress = localStorage.getItem(ADDRESS_KEY);
      if (savedAddress) {
        setPillText(savedAddress);
        var input = $('#deliver-input');
        if (input && !input.value) input.value = savedAddress;
      }
    }
    deliverPill.addEventListener('click', function () { openModal('deliver-modal'); });
  }

  var deliverSave = $('#deliver-save');
  if (deliverSave) {
    deliverSave.addEventListener('click', function () {
      var address = ($('#deliver-input').value || '').trim();
      var status = $('#deliver-status');
      if (!address) {
        status.textContent = 'Please enter or pick an address first.';
        status.className = 'form-status is-error';
        return;
      }
      if (signedIn) {
        api('/api/profile/update', { method: 'POST', body: { address: address } })
          .then(function () {
            setPillText(address);
            closeModal(deliverSave);
            toast('Delivery address saved 📍');
          })
          .catch(function (err) {
            status.textContent = err.message;
            status.className = 'form-status is-error';
          });
      } else {
        localStorage.setItem(ADDRESS_KEY, address);
        setPillText(address);
        closeModal(deliverSave);
        toast('Delivery address saved 📍');
      }
    });
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      var script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Could not load the map library.')); };
      document.head.appendChild(script);
    });
    return leafletLoading;
  }

  function placeMarker(latlng) {
    if (marker) {
      marker.setLatLng(latlng);
    } else {
      marker = window.L.marker(latlng).addTo(map);
    }
  }

  function reverseGeocode(lat, lon) {
    var status = $('#map-status');
    status.textContent = 'Looking up the address…';
    fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + lat + '&lon=' + lon)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var address = data.display_name || (lat.toFixed(5) + ', ' + lon.toFixed(5));
        $('#deliver-input').value = address;
        status.textContent = address;
      })
      .catch(function () {
        var fallback = lat.toFixed(5) + ', ' + lon.toFixed(5);
        $('#deliver-input').value = fallback;
        status.textContent = fallback;
      });
  }

  function initMap() {
    return loadLeaflet().then(function () {
      if (map) { map.invalidateSize(); return; }
      map = window.L.map('map-canvas').setView([48.8566, 2.3522], 12);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
      map.on('click', function (e) {
        placeMarker(e.latlng);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      });
      setTimeout(function () { map.invalidateSize(); }, 150);
    });
  }

  var mapLoad = $('#map-load');
  if (mapLoad) {
    mapLoad.addEventListener('click', function () {
      mapLoad.disabled = true;
      mapLoad.textContent = 'Loading map…';
      initMap().then(function () {
        mapLoad.style.display = 'none';
        $('#map-status').textContent = 'Click anywhere on the map to drop a pin.';
      }).catch(function (err) {
        mapLoad.disabled = false;
        mapLoad.textContent = '🗺️ Load map';
        $('#map-status').textContent = err.message;
      });
    });
  }

  var mapLocate = $('#map-locate');
  if (mapLocate) {
    mapLocate.addEventListener('click', function () {
      if (!navigator.geolocation) {
        $('#map-status').textContent = 'Geolocation is not available in this browser.';
        return;
      }
      $('#map-status').textContent = 'Finding your location…';
      initMap().then(function () {
        navigator.geolocation.getCurrentPosition(function (position) {
          var lat = position.coords.latitude;
          var lon = position.coords.longitude;
          map.setView([lat, lon], 16);
          placeMarker([lat, lon]);
          if (mapLoad) mapLoad.style.display = 'none';
          reverseGeocode(lat, lon);
        }, function (error) {
          $('#map-status').textContent = 'Could not get your location: ' + (error.message || 'permission denied');
        }, { enableHighAccuracy: true, timeout: 10000 });
      });
    });
  }

  /* ---------------- Reveal on scroll ---------------- */

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    $$('.reveal').forEach(function (el) { observer.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
  }

  renderCart();

  window.Beautique = {
    $: $,
    $$: $$,
    money: money,
    api: api,
    toast: toast,
    escapeHtml: escapeHtml,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    cart: {
      get: getCart,
      add: addToCart,
      setQuantity: setQuantity,
      remove: removeFromCart,
      clear: clearCart,
      count: cartCount,
      subtotal: cartSubtotal,
      FREE_SHIPPING: FREE_SHIPPING,
      SHIPPING_FLAT: SHIPPING_FLAT
    },
    renderCart: renderCart,
    openCartDrawer: openCartDrawer,
    closeCartDrawer: closeCartDrawer
  };
})();
