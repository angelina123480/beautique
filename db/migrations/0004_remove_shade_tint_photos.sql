-- Removed: shade photos are no longer tinted with the shade's color as a
-- stand-in for a dedicated photo. Every shade either has its own real
-- photos or falls back to just the swatch color, with no overlay effect.
ALTER TABLE product_shades DROP COLUMN IF EXISTS tint_photos;
