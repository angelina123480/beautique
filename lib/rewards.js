'use strict';

const crypto = require('crypto');

/* Loyalty points: 1 point per $1 of (post-discount) product subtotal spent.
   Each tier can be redeemed once, ever — redeeming turns it into a
   discount code (see POST /api/rewards/redeem) that can be typed in at
   checkout whenever the customer likes, not just in the moment they
   qualify. */
const TIERS = [
  { threshold: 100, discount: 5 },
  { threshold: 250, discount: 10 },
  { threshold: 500, discount: 20 }
];

/** Highest tier the user qualifies for that they haven't already redeemed.
    Uses lifetime points earned (falling back to the current balance for
    accounts predating that field) rather than the current spendable
    balance, so redeeming a lower tier can't re-lock a higher one. */
function availableTier(user) {
  const points = Number(user && user.lifetimePoints) || Number(user && user.rewardPoints) || 0;
  const redeemed = (user && user.redeemedTiers) || [];
  return TIERS.filter((tier) => points >= tier.threshold && !redeemed.includes(tier.threshold))
    .sort((a, b) => b.threshold - a.threshold)[0] || null;
}

/** Next locked tier the user hasn't reached yet, for progress display. */
function nextTier(user) {
  const points = Number(user && user.lifetimePoints) || Number(user && user.rewardPoints) || 0;
  return TIERS.find((tier) => tier.threshold > points) || null;
}

/** Short, human-typeable discount code — collision odds are negligible for
    a demo store, so no uniqueness check against existing codes. */
function generateCode() {
  return 'GLOW-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

module.exports = { TIERS, availableTier, nextTier, generateCode };
