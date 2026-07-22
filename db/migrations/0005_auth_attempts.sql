-- Backs rate-limiting for signin/OTP/password-reset — nothing throttled
-- these before, so a password or OTP could be brute-forced with unlimited
-- attempts. One row per attempt; old rows are cheap to keep since the
-- lookup is always a small, indexed recent-window scan.
CREATE TABLE auth_attempts (
  id         BIGSERIAL PRIMARY KEY,
  key        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_attempts_key_time ON auth_attempts(key, created_at);
