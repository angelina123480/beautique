'use strict';

let _stripe = null;
function getStripe() {
  if (!_stripe) {
    _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function isConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/* orderItems: [{ name, shade, quantity, price }], subtotal/shipping/discount
   in dollars. Metadata carries everything /checkout/success needs to
   recreate the order after payment — Stripe is the source of truth for
   what was actually charged, so item prices are locked in here rather than
   re-read from the database when the order is finally written. */
async function createCheckoutSession({ orderItems, shipping, discount, discountCode, successUrl, cancelUrl, userId, address }) {
  const stripe = getStripe();

  const lineItems = orderItems.map((item) => ({
    price_data: {
      currency: 'usd',
      product_data: { name: item.name + (item.shade ? ' — ' + item.shade : '') },
      unit_amount: Math.round(item.price * 100)
    },
    quantity: item.quantity
  }));

  if (shipping > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Shipping' },
        unit_amount: Math.round(shipping * 100)
      },
      quantity: 1
    });
  }

  let discounts;
  if (discount > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: Math.round(discount * 100),
      currency: 'usd',
      duration: 'once',
      name: discountCode || 'Discount'
    });
    discounts = [{ coupon: coupon.id }];
  }

  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    discounts,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(userId),
    metadata: {
      userId: String(userId),
      address,
      discountCode: discountCode || '',
      shipping: String(shipping),
      discount: String(discount),
      items: JSON.stringify(orderItems)
    }
  });
}

function retrieveSession(sessionId) {
  return getStripe().checkout.sessions.retrieve(sessionId);
}

module.exports = { isConfigured, createCheckoutSession, retrieveSession };
