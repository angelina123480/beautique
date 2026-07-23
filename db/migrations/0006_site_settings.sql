-- Site-wide settings the admin can change without a redeploy: the logo
-- shown in the header/footer, and the homepage hero video (plus which
-- product it's meant to showcase). A single-row table, enforced by the
-- id = 1 check, rather than a generic key/value store — there are only
-- ever these few site-wide values, not an open-ended list.
CREATE TABLE site_settings (
  id                     INTEGER PRIMARY KEY DEFAULT 1,
  logo_url               TEXT NOT NULL DEFAULT '/img/logo.png',
  hero_video_url         TEXT,
  hero_video_product_id  BIGINT REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT site_settings_singleton CHECK (id = 1)
);

INSERT INTO site_settings (id) VALUES (1);
