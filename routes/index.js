'use strict';

const express = require('express');
const store = require('../lib/store');
const catalog = require('../lib/catalog');
const emailService = require('../lib/emailService');

const router = express.Router();

const SORTS = {
  featured: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount || a.id - b.id,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  name: (a, b) => a.name.localeCompare(b.name)
};

router.get('/', (req, res) => {
  const products = catalog.getProducts();
  const featured = products.slice().sort(SORTS.featured).slice(0, 3);
  const arrivals = products.slice().sort((a, b) => b.id - a.id).slice(0, 4);
  const categories = store.CATEGORIES.map((category) => Object.assign({}, category, {
    count: products.filter((product) => product.category === category.id).length
  }));

  res.render('index', {
    page: 'Home',
    menuId: 'home',
    featured,
    arrivals,
    categories
  });
});

router.get('/shop', (req, res) => {
  const searchTerm = String(req.query.search || '').trim();
  const category = ['makeup', 'skincare', 'fragrance'].includes(req.query.category) ? req.query.category : '';
  const sort = SORTS[req.query.sort] ? req.query.sort : 'featured';

  let products = catalog.getProducts();
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
  products.sort(SORTS[sort]);

  res.render('shop', {
    page: 'Shop',
    menuId: 'shop',
    products,
    categories: store.CATEGORIES,
    searchTerm,
    activeCategory: category,
    activeSort: sort
  });
});

router.get('/product/:id', (req, res, next) => {
  const product = catalog.findProduct(req.params.id);
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
    related: catalog.relatedProducts(product, 3)
  });
});

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
  res.render('checkout', { page: 'Checkout', menuId: 'checkout' });
});

router.get('/admin', (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.redirect('/auth');
  }

  const products = catalog.getProducts();
  const orders = store.read('orders').slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const messages = store.read('messages').slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const users = store.read('users');

  const activeOrders = orders.filter((order) => order.status !== 'cancelled');
  const reviews = [];
  products.forEach((product) => {
    (product.reviews || []).forEach((review) => {
      reviews.push(Object.assign({ productName: product.name, productId: product.id }, review));
    });
  });
  reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const stats = {
    revenue: activeOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    orders: orders.length,
    pending: orders.filter((order) => order.status === 'confirmed').length,
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
    stats
  });
});

router.get('/about', (req, res) => {
  res.render('about', { page: 'About us', menuId: 'about' });
});

router.get('/contact', (req, res) => {
  res.render('contact', { page: 'Contact us', menuId: 'contact' });
});

module.exports = router;
