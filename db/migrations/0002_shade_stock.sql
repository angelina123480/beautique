-- Per-shade stock. For a product with shades, the product's overall stock/
-- sold_out becomes derived (sum/aggregate of its shades) rather than tracked
-- on the products row directly — see lib/products.js's mapProduct.
ALTER TABLE product_shades ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;

-- Backfill: distribute each shaded product's existing total stock evenly
-- across its shades (by sort_order), so the total is preserved exactly and
-- no shade starts out looking incorrectly sold out.
DO $$
DECLARE
  p RECORD;
  s RECORD;
  shade_count INTEGER;
  base_share INTEGER;
  remainder INTEGER;
  i INTEGER;
BEGIN
  FOR p IN SELECT id, stock FROM products WHERE id IN (SELECT DISTINCT product_id FROM product_shades) LOOP
    SELECT count(*) INTO shade_count FROM product_shades WHERE product_id = p.id;
    IF shade_count > 0 THEN
      base_share := p.stock / shade_count;
      remainder := p.stock % shade_count;
      i := 0;
      FOR s IN SELECT id FROM product_shades WHERE product_id = p.id ORDER BY sort_order LOOP
        UPDATE product_shades
        SET stock = base_share + (CASE WHEN i < remainder THEN 1 ELSE 0 END)
        WHERE id = s.id;
        i := i + 1;
      END LOOP;
    END IF;
  END LOOP;
END $$;
