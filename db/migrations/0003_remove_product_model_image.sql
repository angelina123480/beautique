-- Removed: the standalone "model photo" field. Photos (including model
-- shots) now just go in the regular gallery — the first gallery photo is
-- what's used as the product's cover image.
ALTER TABLE products DROP COLUMN IF EXISTS model_image;
