'use strict';

const express = require('express');
const store = require('../lib/store');
const catalog = require('../lib/catalog');
const emailService = require('../lib/emailService');
const rewards = require('../lib/rewards');

const router = express.Router();

function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const SORTS = {
  featured: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount || a.id - b.id,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  name: (a, b) => a.name.localeCompare(b.name)
};

router.get('/', ah(async (req, res) => {
  const products = await catalog.getProducts();
  const featured = products.slice().sort(SORTS.featured).slice(0, 3);
  const arrivals = products.slice().sort((a, b) => b.id - a.id).slice(0, 4);
  const bestsellers = products.slice()
    .filter((product) => product.available)
    .sort((a, b) => b.reviewCount - a.reviewCount || b.rating - a.rating)
    .slice(0, 8);
  const sale = products.slice()
    .filter((product) => product.onSale && product.available)
    .sort((a, b) => b.discountPercent - a.discountPercent)
    .slice(0, 8);
  const categories = (await store.read('categories')).map((category) => Object.assign({}, category, {
    count: products.filter((product) => product.category === category.id).length
  }));

  const testimonials = [];
  products.forEach((product) => {
    (product.reviews || []).forEach((review) => {
      if (review.rating >= 4 && review.comment) {
        testimonials.push(Object.assign({ productName: product.name }, review));
      }
    });
  });
  testimonials.sort((a, b) => b.rating - a.rating || new Date(b.createdAt) - new Date(a.createdAt));

  let recommended = [];
  if (req.user) {
    const myOrders = (await store.read('orders')).filter((order) => order.userId === req.user.id && order.status !== 'cancelled');
    const purchasedIds = new Set();
    const purchasedCategories = new Set();
    myOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        purchasedIds.add(item.productId);
        const product = products.find((entry) => entry.id === item.productId);
        if (product) purchasedCategories.add(product.category);
      });
    });
    recommended = products
      .filter((product) => product.available && !purchasedIds.has(product.id) && purchasedCategories.has(product.category))
      .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  }
  if (recommended.length < 4) {
    const usedIds = new Set(recommended.map((product) => product.id));
    const fallback = products
      .filter((product) => product.available && !usedIds.has(product.id))
      .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    recommended = recommended.concat(fallback).slice(0, 4);
  } else {
    recommended = recommended.slice(0, 4);
  }

  res.render('index', {
    page: 'Home',
    menuId: 'home',
    featured,
    arrivals,
    bestsellers,
    sale,
    recommended,
    categories,
    testimonials: testimonials.slice(0, 3)
  });
}));

const PRICE_RANGES = {
  'under25': (product) => product.price < 25,
  '25-50': (product) => product.price >= 25 && product.price <= 50,
  '50-100': (product) => product.price > 50 && product.price <= 100,
  'over100': (product) => product.price > 100
};

router.get('/shop', ah(async (req, res) => {
  const allCategories = await store.read('categories');
  const searchTerm = String(req.query.search || '').trim();
  const category = allCategories.some((entry) => entry.id === req.query.category) ? req.query.category : '';
  const sort = SORTS[req.query.sort] ? req.query.sort : 'featured';
  const price = PRICE_RANGES[req.query.price] ? req.query.price : '';
  const rating = ['3', '4'].includes(req.query.rating) ? req.query.rating : '';
  const inStock = req.query.inStock === '1';
  const onSaleOnly = req.query.onSale === '1';

  let products = await catalog.getProducts();
  if (category) {
    products = products.filter((product) => product.category === category);
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    products = products.filter((product) =>
      product.name.toLowerCase().includes(term) ||
      product.brand.toLowerCase().includes(term) ||
      product.description.toLowerCase().includes(term));
  }
  if (price) {
    products = products.filter(PRICE_RANGES[price]);
  }
  if (rating) {
    products = products.filter((product) => product.rating >= Number(rating));
  }
  if (inStock) {
    products = products.filter((product) => product.available);
  }
  if (onSaleOnly) {
    products = products.filter((product) => product.onSale);
  }
  products.sort(SORTS[sort]);

  res.render('shop', {
    page: 'Shop',
    menuId: 'shop',
    products,
    categories: allCategories,
    searchTerm,
    activeCategory: category,
    activeSort: sort,
    activePrice: price,
    activeRating: rating,
    activeInStock: inStock,
    activeOnSale: onSaleOnly
  });
}));

router.get('/wishlist', ah(async (req, res) => {
  res.render('wishlist', {
    page: 'Wishlist',
    menuId: ''
  });
}));

/* Shade catalog for the client-side shade matcher (see public/javascripts/shade-matcher.js).
   Built from real shade data already on your products — every "Shop this
   shade" link goes to a real, working product page. NOTE: shade-matching
   against skin tone conventionally means foundation/concealer; this catalog
   currently only has lipstick/blush/mascara shades because that's what's in
   the seed data, so treat results as a technical demo until you add a
   foundation-type product with real shades (see the note in the view). */
router.get('/shade-matcher', ah(async (req, res) => {
  const products = await catalog.getProducts();
  const shadeCatalog = [];
  products.forEach((product) => {
    (product.shades || []).forEach((shade) => {
      shadeCatalog.push({
        productId: product.id,
        productName: product.name,
        shadeName: shade.label,
        hex: shade.color
      });
    });
  });
  res.render('shade-matcher', { page: 'Shade Matcher', menuId: 'shade-matcher', shadeCatalog });
}));

router.get('/product/:id', ah(async (req, res, next) => {
  const product = await catalog.findProduct(req.params.id);
  if (!product) {
    const err = new Error('We could not find that product.');
    err.status = 404;
    return next(err);
  }

  const reviews = (product.reviews || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('product', {
    page: product.name,
    menuId: 'shop',
    product,
    reviews,
    related: await catalog.relatedProducts(product, 3),
    frequentlyBought: await catalog.frequentlyBoughtWith(product, 4)
  });
}));

router.get('/auth', (req, res) => {
  if (req.user) {
    return res.redirect(req.user.role === 'admin' ? '/admin' : '/profile');
  }
  res.render('auth', {
    page: 'Account',
    menuId: 'auth',
    devMail: !emailService.isConfigured()
  });
});

router.get('/profile', (req, res) => {
  if (!req.user) {
    return res.redirect('/auth');
  }
  res.render('profile', { page: 'My account', menuId: 'profile' });
});

router.get('/checkout', (req, res) => {
  const reward = req.user ? rewards.availableTier(req.user) : null;
  res.render('checkout', { page: 'Checkout', menuId: 'checkout', reward });
});

router.get('/admin', ah(async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.redirect('/auth');
  }

  const products = await catalog.getProducts();
  const orders = (await store.read('orders')).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const messages = (await store.read('messages')).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const users = await store.read('users');
  const categories = (await store.read('categories')).map((category) => Object.assign({}, category, {
    productCount: products.filter((product) => product.category === category.id).length
  }));

  const adminIds = new Set(users.filter((user) => user.role === 'admin').map((user) => user.id));
  /* Admins can shop too, but their own test/personal orders shouldn't
     skew the store's real revenue/order stats. */
  const customerOrders = orders.filter((order) => !adminIds.has(order.userId));
  const activeCustomerOrders = customerOrders.filter((order) => order.status !== 'cancelled');
  const reviews = [];
  products.forEach((product) => {
    (product.reviews || []).forEach((review) => {
      reviews.push(Object.assign({ productName: product.name, productId: product.id }, review));
    });
  });
  reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const stats = {
    revenue: activeCustomerOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    orders: customerOrders.length,
    pending: customerOrders.filter((order) => order.status === 'confirmed').length,
    products: products.length,
    lowStock: products.filter((product) => !product.soldOut && product.stock > 0 && product.stock <= 5).length,
    customers: users.filter((user) => user.role !== 'admin').length,
    reviews: reviews.length
  };

  res.render('admin', {
    page: 'Admin dashboard',
    menuId: 'admin',
    products,
    orders,
    reviews,
    messages,
    categories,
    stats
  });
}));

router.get('/about', ah(async (req, res) => {
  const products = await catalog.getProducts();
  const showcase = [1, 5].map((id) => products.find((product) => product.id === id)).filter(Boolean);
  res.render('about', { page: 'About us', menuId: 'about', showcase });
}));

router.get('/contact', (req, res) => {
  res.render('contact', { page: 'Contact us', menuId: 'contact' });
});

module.exports = router;
