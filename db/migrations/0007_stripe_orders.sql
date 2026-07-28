-- Tracks which order a Stripe Checkout Session finalized into, so the
-- /checkout/success redirect can be hit twice (page refresh, back button)
-- without creating a duplicate order or double-decrementing stock.
ALTER TABLE orders ADD COLUMN stripe_session_id TEXT UNIQUE;
