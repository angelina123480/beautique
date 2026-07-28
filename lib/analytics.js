'use strict';

/* Read-only aggregation queries for the admin store assistant (lib/assistant.js).
   Each function maps 1:1 to a tool Claude can call — kept here, separate from
   lib/orders.js / lib/products.js, since these answer "how is the store
   doing" questions rather than powering any customer-facing page. */

const { sql } = require('./db');
const catalog = require('./catalog');

function sinceDate(days) {
  return days ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString() : null;
}

/** Products ranked by units sold (order_items.quantity), cancelled orders excluded. */
async function getBestSellingProducts({ limit = 5, days = null } = {}) {
  const since = sinceDate(days);
  const rows = await sql`
    select oi.product_id, oi.name, sum(oi.quantity)::int as units_sold, sum(oi.quantity * oi.price) as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.status != 'cancelled'
      and (${since}::timestamptz is null or o.created_at > ${since}::timestamptz)
    group by oi.product_id, oi.name
    order by units_sold desc
    limit ${limit}
  `;
  return rows.map((row) => ({
    productId: row.product_id === null ? null : Number(row.product_id),
    name: row.name,
    unitsSold: Number(row.units_sold),
    revenue: Math.round(Number(row.revenue) * 100) / 100
  }));
}

/** Products ranked by average review rating ("most liked") — reuses the same
    rating/reviewCount already derived for the storefront, rather than
    re-deriving it with a second aggregation query. */
async function getTopRatedProducts({ limit = 5, minReviews = 1 } = {}) {
  const products = await catalog.getProducts();
  return products
    .filter((product) => product.reviewCount >= minReviews)
    .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
    .slice(0, limit)
    .map((product) => ({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      averageRating: product.rating,
      reviewCount: product.reviewCount
    }));
}

/** Revenue / order totals, optionally scoped to the last N days. Cancelled orders excluded. */
async function getRevenueSummary({ days = null } = {}) {
  const since = sinceDate(days);
  const [row] = await sql`
    select count(*)::int as order_count,
      coalesce(sum(total), 0) as revenue,
      coalesce(avg(total), 0) as avg_order_value
    from orders
    where status != 'cancelled'
      and (${since}::timestamptz is null or created_at > ${since}::timestamptz)
  `;
  return {
    orderCount: Number(row.order_count),
    revenue: Math.round(Number(row.revenue) * 100) / 100,
    averageOrderValue: Math.round(Number(row.avg_order_value) * 100) / 100,
    periodDays: days || null
  };
}

/** Products at or below a stock threshold (fully sold-out ones included). */
async function getLowStockProducts({ threshold = 5 } = {}) {
  const products = await catalog.getProducts();
  return products
    .filter((product) => product.stock <= threshold)
    .sort((a, b) => a.stock - b.stock)
    .map((product) => ({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      stock: product.stock,
      soldOut: product.soldOut
    }));
}

module.exports = {
  getBestSellingProducts,
  getTopRatedProducts,
  getRevenueSummary,
  getLowStockProducts
};
