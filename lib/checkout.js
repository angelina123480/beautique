'use strict';

const db = require('./db');
const products = require('./products');
const users = require('./users');
const orders = require('./orders');
const emailService = require('./emailService');

/* Validates a cart against current stock/price, without touching the
   database. Shared by cash-on-delivery (validates then commits immediately)
   and card payments (validates before creating a Checkout Session, then
   validates again in /checkout/success before committing). Throws an Error
   with a `.status` so callers can turn it straight into an API response. */
async function validateCartItems(items) {
  const orderItems = [];
  let subtotal = 0;

  /* Validate every item before committing any stock changes — otherwise a
     later item failing validation would leave earlier items' stock already
     decremented with no order actually created. */
  for (const item of items) {
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const product = await products.getProductById(Number(item.id));
    const shade = String(item.shade || '').trim();

    if (!product) {
      throw Object.assign(new Error('One of the items is no longer available.'), { status: 400 });
    }
    /* Without this, an item added via a shortcut that skips the shade
       picker (shop-grid "Add to bag", wishlist quick-add) would check out
       with no shade specified, leaving fulfillment with no way to know
       which one to send. */
    if (Array.isArray(product.shades) && product.shades.length && !shade) {
      throw Object.assign(new Error('Please choose a shade for ' + product.name + ' before checking out.'), { status: 400 });
    }

    /* For a shaded product, availability is the specific shade's own stock
       (product.stock/soldOut are just the sum across all shades — a shade
       with 0 left shouldn't be buyable just because a different shade of
       the same product still has stock). */
    let availableStock = product.stock;
    let itemSoldOut = product.soldOut;
    if (shade) {
      const shadeEntry = (product.shades || []).find((entry) => entry.name === shade);
      if (!shadeEntry) {
        throw Object.assign(new Error('That shade of ' + product.name + ' is no longer available.'), { status: 400 });
      }
      availableStock = shadeEntry.stock;
      itemSoldOut = shadeEntry.soldOut;
    }

    if (itemSoldOut || availableStock < quantity) {
      const label = product.name + (shade ? ' (' + shade + ')' : '');
      throw Object.assign(new Error(availableStock > 0
        ? 'Only ' + availableStock + ' of ' + label + ' left in stock.'
        : label + ' is sold out.'), { status: 400 });
    }

    const unitPrice = (typeof product.salePrice === 'number' && product.salePrice > 0 && product.salePrice < product.price)
      ? product.salePrice
      : product.price;
    subtotal += unitPrice * quantity;
    orderItems.push({ productId: product.id, name: product.name, quantity, price: unitPrice, shade });
  }

  return { orderItems, subtotal: Math.round(subtotal * 100) / 100 };
}

function priceDiscount(user, subtotal, requestedCode) {
  let discount = 0;
  let usedDiscountCode = null;
  const code = requestedCode ? String(requestedCode).trim().toUpperCase() : '';
  if (code) {
    const codeEntry = ((user && user.discountCodes) || []).find((entry) => entry.code === code && !entry.usedAt);
    if (codeEntry) {
      discount = Math.round(subtotal * (codeEntry.discount / 100) * 100) / 100;
      usedDiscountCode = codeEntry.code;
    }
  }
  return { discount, usedDiscountCode };
}

/* Commits an order + stock decrement + reward points in one transaction,
   then sends the confirmation emails — used both for cash-on-delivery
   (commits immediately) and card payments (commits once /checkout/success
   confirms the Stripe session actually paid).

   Everything in the transaction must commit together — otherwise a crash
   partway through could decrement stock or award points without the order
   that justified it (or vice versa). */
async function commitOrder({ user, orderItems, subtotal, shipping, discount, discountCode, paymentMethod, address, stripeSessionId, id }) {
  const total = Math.round((subtotal - discount + shipping) * 100) / 100;
  const pointsEarned = Math.max(0, Math.floor(subtotal - discount));

  const order = {
    id: id || Date.now(),
    userId: user.id,
    userEmail: user.email,
    status: 'confirmed',
    items: orderItems,
    subtotal,
    discount,
    discountCode,
    shipping,
    total,
    pointsEarned,
    paymentMethod,
    address,
    stripeSessionId,
    createdAt: new Date().toISOString()
  };

  const txQueries = [
    ...orders.createOrderQueries(order),
    ...orderItems.map((item) => item.shade
      ? products.adjustShadeStockQuery(item.productId, item.shade, -item.quantity)
      : products.adjustStockQuery(item.productId, -item.quantity))
  ];

  /* Lifetime total never decreases (even when points are later spent on a
     reward), so a redeemed tier can't retroactively re-lock a higher tier
     the customer already qualified for. Seed it from the current balance
     the first time this field is written for an older account. */
  const priorLifetime = Number(user.lifetimePoints) || Number(user.rewardPoints) || 0;
  /* Whatever address they just delivered to becomes their saved address, so
     checkout stays pre-filled with wherever they actually asked us to ship
     last time, not just whatever they set once in their profile. */
  txQueries.push(users.updateUserQuery(user.id, {
    rewardPoints: (Number(user.rewardPoints) || 0) + pointsEarned,
    lifetimePoints: priorLifetime + pointsEarned,
    address
  }));
  if (discountCode) {
    txQueries.push(users.setDiscountCodeUsedQuery(user.id, discountCode, new Date().toISOString()));
  }

  await db.sql.transaction(txQueries.filter(Boolean));

  const itemsSummary = orderItems
    .map((item) => '  • ' + item.quantity + ' × ' + item.name + (item.shade ? ' (' + item.shade + ')' : '') + ' ($' + item.price.toFixed(2) + ')')
    .join('\n');
  await emailService.sendEmail('order_confirmation', user.email, {
    firstName: user.name,
    orderNumber: order.id,
    total: total.toFixed(2),
    itemsSummary
  }).catch(console.error);
  await emailService.sendEmail('follow_up', user.email, { firstName: user.name }).catch(console.error);

  return orders.getOrderById(order.id);
}

module.exports = { validateCartItems, priceDiscount, commitOrder };
