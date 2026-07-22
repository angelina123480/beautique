'use strict';

const { sql } = require('./db');

function mapReview(row) {
  return {
    id: Number(row.id),
    userId: row.user_id === null ? null : Number(row.user_id),
    userName: row.user_name,
    rating: row.rating,
    comment: row.comment,
    verified: row.verified,
    moderatedAt: row.moderated_at,
    createdAt: row.created_at
  };
}

function mapShade(row) {
  return {
    name: row.name,
    label: row.label,
    color: row.color,
    images: row.images || [],
    stock: row.stock,
    soldOut: row.stock <= 0
  };
}

/* Reassembles a products-table row (+ its joined shades/reviews) into the
   exact shape the rest of the app (lib/catalog.js's decorate(), and every
   admin/checkout handler) has always worked with.

   For a product that has shades, stock/soldOut are derived from the sum of
   its shades' own stock rather than the products.stock/sold_out columns —
   those columns are left unused (stale) for shaded products, since every
   read of stock/availability goes through this function. */
function mapProduct(row, shades, reviews) {
  if (!row) return null;
  const mappedShades = (shades || []).map(mapShade);
  const hasShades = mappedShades.length > 0;
  const stock = hasShades ? mappedShades.reduce((sum, shade) => sum + shade.stock, 0) : row.stock;
  return {
    id: Number(row.id),
    name: row.name,
    brand: row.brand,
    price: Number(row.price),
    salePrice: row.sale_price === null ? null : Number(row.sale_price),
    badge: row.badge,
    emoji: row.emoji,
    category: row.category,
    tone: row.tone,
    description: row.description,
    stock,
    soldOut: hasShades ? stock <= 0 : row.sold_out,
    images: row.images || [],
    scentFamily: row.scent_family || [],
    skinGoals: row.skin_goals || [],
    winkMap: row.wink_map || {},
    shades: mappedShades,
    reviews: (reviews || []).map(mapReview)
  };
}

async function getShadesFor(productIds) {
  if (!productIds.length) return new Map();
  const rows = await sql`select * from product_shades where product_id = any(${productIds}) order by sort_order`;
  const byProduct = new Map();
  rows.forEach((row) => {
    const list = byProduct.get(Number(row.product_id)) || [];
    list.push(row);
    byProduct.set(Number(row.product_id), list);
  });
  return byProduct;
}

async function getReviewsFor(productIds) {
  if (!productIds.length) return new Map();
  const rows = await sql`select * from product_reviews where product_id = any(${productIds}) order by created_at desc`;
  const byProduct = new Map();
  rows.forEach((row) => {
    const list = byProduct.get(Number(row.product_id)) || [];
    list.push(row);
    byProduct.set(Number(row.product_id), list);
  });
  return byProduct;
}

async function getAllProducts() {
  const rows = await sql`select * from products order by id`;
  const ids = rows.map((row) => Number(row.id));
  const [shadesByProduct, reviewsByProduct] = await Promise.all([getShadesFor(ids), getReviewsFor(ids)]);
  return rows.map((row) => mapProduct(row, shadesByProduct.get(Number(row.id)), reviewsByProduct.get(Number(row.id))));
}

async function getProductById(id) {
  const rows = await sql`select * from products where id = ${id}`;
  if (!rows[0]) return null;
  const [shades, reviews] = await Promise.all([getShadesFor([id]), getReviewsFor([id])]);
  return mapProduct(rows[0], shades.get(Number(id)), reviews.get(Number(id)));
}

async function productExists(id) {
  const rows = await sql`select 1 from products where id = ${id}`;
  return rows.length > 0;
}

async function nextProductId() {
  const [row] = await sql`select coalesce(max(id), 0) + 1 as next from products`;
  return Number(row.next);
}

async function replaceShades(productId, shades) {
  await sql`delete from product_shades where product_id = ${productId}`;
  for (let i = 0; i < (shades || []).length; i++) {
    const s = shades[i];
    await sql`
      insert into product_shades (product_id, name, label, color, images, sort_order, stock)
      values (${productId}, ${s.name}, ${s.label || s.name}, ${s.color || '#d9a08b'}, ${s.images || []}, ${i}, ${Math.max(0, Math.floor(Number(s.stock) || 0))})
    `;
  }
}

async function createProduct(product) {
  await sql`
    insert into products (id, name, brand, price, sale_price, badge, emoji, category, tone,
      description, stock, sold_out, images, scent_family, skin_goals, wink_map)
    values (${product.id}, ${product.name}, ${product.brand}, ${product.price}, ${product.salePrice},
      ${product.badge}, ${product.emoji}, ${product.category}, ${product.tone}, ${product.description},
      ${product.stock}, ${product.soldOut}, ${product.images || []},
      ${product.scentFamily || []}, ${product.skinGoals || []}, ${JSON.stringify(product.winkMap || {})})
  `;
  if (product.shades && product.shades.length) {
    await replaceShades(product.id, product.shades);
  }
  return getProductById(product.id);
}

/* Persists every scalar field on `product` (the fully-computed object after
   applyProductFields has run) and replaces its shade list wholesale — same
   "recompute everything, write it all back" shape applyProductFields has
   always assumed, just scoped to one row instead of the whole table. */
async function saveProduct(product) {
  await sql`
    update products set
      name = ${product.name}, brand = ${product.brand}, price = ${product.price},
      sale_price = ${product.salePrice}, badge = ${product.badge}, emoji = ${product.emoji},
      category = ${product.category}, description = ${product.description}, stock = ${product.stock},
      sold_out = ${product.soldOut}, images = ${product.images || []},
      scent_family = ${product.scentFamily || []}, skin_goals = ${product.skinGoals || []},
      wink_map = ${JSON.stringify(product.winkMap || {})}
    where id = ${product.id}
  `;
  if (product.shades !== undefined) {
    await replaceShades(product.id, product.shades);
  }
  return getProductById(product.id);
}

async function deleteProduct(id) {
  const rows = await sql`delete from products where id = ${id} returning id`;
  return rows.length > 0;
}

/* Atomic stock adjustment (positive to restock, negative to sell) — a
   single UPDATE avoids the read-all/mutate/write-all race the old JSON
   store had when several checkouts happened close together. */
/* Returns the query un-awaited, so callers can either await it directly or
   include it in an sql.transaction([...]) batch alongside other writes. */
function adjustStockQuery(id, delta) {
  return sql`update products set
    stock = greatest(0, stock + ${delta}),
    sold_out = (stock + ${delta}) <= 0
    where id = ${id}`;
}

async function adjustStock(id, delta) {
  await adjustStockQuery(id, delta);
}

/* Same idea, but for one specific shade of a shaded product — the
   products.stock/sold_out columns aren't touched (see mapProduct's
   derivation), only the shade's own row. */
function adjustShadeStockQuery(productId, shadeName, delta) {
  return sql`update product_shades set stock = greatest(0, stock + ${delta})
    where product_id = ${productId} and name = ${shadeName}`;
}

async function adjustShadeStock(productId, shadeName, delta) {
  await adjustShadeStockQuery(productId, shadeName, delta);
}

async function addReview(productId, review) {
  await sql`
    insert into product_reviews (id, product_id, user_id, user_name, rating, comment, verified, created_at)
    values (${review.id}, ${productId}, ${review.userId}, ${review.userName}, ${review.rating},
      ${review.comment}, ${review.verified}, ${review.createdAt})
  `;
  return review;
}

async function getReview(productId, reviewId) {
  const rows = await sql`select * from product_reviews where product_id = ${productId} and id = ${reviewId}`;
  return rows[0] ? mapReview(rows[0]) : null;
}

async function updateReview(reviewId, patch) {
  const rows = await sql`
    update product_reviews set
      comment = coalesce(${patch.comment ?? null}, comment),
      rating = coalesce(${patch.rating ?? null}, rating),
      moderated_at = ${patch.moderatedAt}
    where id = ${reviewId}
    returning *
  `;
  return rows[0] ? mapReview(rows[0]) : null;
}

async function deleteReview(productId, reviewId) {
  const rows = await sql`delete from product_reviews where product_id = ${productId} and id = ${reviewId} returning id`;
  return rows.length > 0;
}

/* Admin "all reviews across every product" list. */
async function getAllReviews() {
  const rows = await sql`
    select r.product_id, p.name as "productName", r.rating, r.comment,
      r.user_name as "userName", r.verified, r.created_at as "createdAt"
    from product_reviews r
    join products p on p.id = r.product_id
    order by r.created_at desc
  `;
  return rows.map(({ product_id, ...rest }) => Object.assign({ productId: Number(product_id) }, rest));
}

/* Used by the admin "sync catalog to database" button — upserts every
   product from the repo's data/products.json (insert or update by id, plus
   its shades). Doesn't touch reviews (real customer content, not part of
   the repo's static catalog data) and doesn't delete products missing from
   the incoming set, since order_items references products and a missing
   product here just means "not redeployed yet," not "should be destroyed." */
async function replaceAllProducts(productList) {
  for (const p of productList) {
    const existing = await sql`select 1 from products where id = ${p.id}`;
    if (existing.length) {
      await sql`
        update products set
          name = ${p.name}, brand = ${p.brand || ''}, price = ${p.price || 0},
          sale_price = ${p.salePrice ?? null}, badge = ${p.badge || ''}, emoji = ${p.emoji || ''},
          category = ${p.category}, tone = ${p.tone || 0}, description = ${p.description || ''},
          stock = ${p.stock || 0}, sold_out = ${Boolean(p.soldOut)}, images = ${p.images || []},
          scent_family = ${p.scentFamily || []},
          skin_goals = ${p.skinGoals || []}, wink_map = ${JSON.stringify(p.winkMap || {})}
        where id = ${p.id}
      `;
    } else {
      await sql`
        insert into products (id, name, brand, price, sale_price, badge, emoji, category, tone,
          description, stock, sold_out, images, scent_family, skin_goals, wink_map)
        values (${p.id}, ${p.name}, ${p.brand || ''}, ${p.price || 0}, ${p.salePrice ?? null},
          ${p.badge || ''}, ${p.emoji || ''}, ${p.category}, ${p.tone || 0}, ${p.description || ''},
          ${p.stock || 0}, ${Boolean(p.soldOut)}, ${p.images || []},
          ${p.scentFamily || []}, ${p.skinGoals || []}, ${JSON.stringify(p.winkMap || {})})
      `;
    }
    if (p.shades !== undefined) {
      /* The repo's data/products.json never carries per-shade stock (real
         inventory, not catalog metadata), so merge in whatever stock each
         shade already has in the database — otherwise a sync would
         silently wipe it out. */
      const existingStock = new Map(
        (await sql`select name, stock from product_shades where product_id = ${p.id}`)
          .map((row) => [row.name, row.stock])
      );
      const shadesWithStock = p.shades.map((s) => Object.assign(
        {}, s, { stock: s.stock !== undefined ? s.stock : (existingStock.get(s.name) || 0) }
      ));
      await replaceShades(p.id, shadesWithStock);
    }
  }
}

module.exports = {
  getAllProducts,
  getProductById,
  productExists,
  nextProductId,
  createProduct,
  saveProduct,
  deleteProduct,
  replaceAllProducts,
  adjustStock,
  adjustStockQuery,
  adjustShadeStock,
  adjustShadeStockQuery,
  addReview,
  getReview,
  updateReview,
  deleteReview,
  getAllReviews
};
