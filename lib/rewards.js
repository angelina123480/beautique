'use strict';

/* Loyalty points: 1 point per $1 of (post-discount) product subtotal spent.
   Each tier can be redeemed once, ever, for a % discount on the order that
   redeems it. */
const TIERS = [
  { threshold: 100, discount: 5 },
  { threshold: 250, discount: 10 },
  { threshold: 500, discount: 20 }
];

/** Highest tier the user qualifies for that they haven't already redeemed. */
function availableTier(user) {
  const points = Number(user && user.rewardPoints) || 0;
  const redeemed = (user && user.redeemedTiers) || [];
  return TIERS.filter((tier) => points >= tier.threshold && !redeemed.includes(tier.threshold))
    .sort((a, b) => b.threshold - a.threshold)[0] || null;
}

/** Next locked tier the user hasn't reached yet, for progress display. */
function nextTier(user) {
  const points = Number(user && user.rewardPoints) || 0;
  return TIERS.find((tier) => tier.threshold > points) || null;
}

module.exports = { TIERS, availableTier, nextTier };
