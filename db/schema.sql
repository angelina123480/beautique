-- Beautique — Postgres schema (Neon), as a full current-state snapshot for
-- reference/reading. NOT applied directly anymore — db/migrations/ is the
-- source of truth going forward (run `node db/migrate.js` to apply). This
-- file mirrors db/migrations/0001_initial_schema.sql; if you add a new
-- migration, update this snapshot to match the resulting end state too.
--
-- IDs use BIGINT throughout: existing users/orders/products use Date.now()-style
-- timestamps as ids, which overflow a 32-bit INT/SERIAL.

CREATE TABLE categories (
  id    TEXT PRIMARY KEY,        -- 'makeup', 'skincare', 'fragrance'
  title TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  tone  INTEGER NOT NULL DEFAULT 0,
  text  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE users (
  id               BIGINT PRIMARY KEY,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  password         TEXT,                 -- scrypt hash, null for Google-only accounts
  role             TEXT NOT NULL DEFAULT 'client',
  phone            TEXT NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  otp              TEXT NOT NULL DEFAULT '',
  otp_expires      TIMESTAMPTZ,
  otp_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  reset_otp        TEXT NOT NULL DEFAULT '',
  reset_otp_expires TIMESTAMPTZ,
  google_id        TEXT,
  reward_points    INTEGER NOT NULL DEFAULT 0,
  lifetime_points  INTEGER NOT NULL DEFAULT 0,
  redeemed_tiers   INTEGER[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per discount code a user has ever redeemed from a reward tier.
CREATE TABLE user_discount_codes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  discount   INTEGER NOT NULL,      -- percent off
  tier       INTEGER NOT NULL,      -- which reward tier threshold earned this code
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_discount_codes_user ON user_discount_codes(user_id);

CREATE TABLE products (
  id               BIGINT PRIMARY KEY,
  name             TEXT NOT NULL,
  brand            TEXT NOT NULL DEFAULT '',
  price            NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price       NUMERIC(10,2),
  badge            TEXT NOT NULL DEFAULT '',
  emoji            TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL REFERENCES categories(id),
  tone             INTEGER NOT NULL DEFAULT 0,
  description      TEXT NOT NULL DEFAULT '',
  stock            INTEGER NOT NULL DEFAULT 0,
  sold_out         BOOLEAN NOT NULL DEFAULT FALSE,
  images           TEXT[] NOT NULL DEFAULT '{}',
  model_image      TEXT NOT NULL DEFAULT '',
  scent_family     TEXT[] NOT NULL DEFAULT '{}',
  skin_goals       TEXT[] NOT NULL DEFAULT '{}',
  wink_map         JSONB NOT NULL DEFAULT '{}'  -- photo-url -> "eyes closed" photo-url lookup
);

CREATE TABLE product_shades (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  label        TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#d9a08b',
  images       TEXT[] NOT NULL DEFAULT '{}',
  tint_photos  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  stock        INTEGER NOT NULL DEFAULT 0  -- for shaded products, products.stock is derived from this (see lib/products.js)
);
CREATE INDEX idx_product_shades_product ON product_shades(product_id);

CREATE TABLE product_reviews (
  id           BIGINT PRIMARY KEY,  -- app-supplied (Date.now()), referenced directly by edit/delete routes
  product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name    TEXT NOT NULL DEFAULT '',
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT NOT NULL DEFAULT '',
  verified     BOOLEAN NOT NULL DEFAULT FALSE,
  moderated_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_reviews_product ON product_reviews(product_id);

CREATE TABLE orders (
  id               BIGINT PRIMARY KEY,
  user_id          BIGINT REFERENCES users(id),  -- nullable: a few early dev orders predate user tracking
  user_email       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'confirmed',
  subtotal         NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_code    TEXT,
  shipping         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(10,2) NOT NULL DEFAULT 0,
  points_earned    INTEGER NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'online',
  address          TEXT NOT NULL DEFAULT '',
  hidden_from_user BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON orders(user_id);

CREATE TABLE order_items (
  id         BIGSERIAL PRIMARY KEY,
  order_id   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,        -- snapshot at purchase time, survives product edits/deletes
  quantity   INTEGER NOT NULL DEFAULT 1,
  price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  shade      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE messages (
  id         BIGINT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_log (
  id         BIGINT PRIMARY KEY,
  type       TEXT NOT NULL,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  variant    TEXT NOT NULL DEFAULT '',
  delivered  BOOLEAN NOT NULL DEFAULT FALSE,  -- whether Resend was configured at send time
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
