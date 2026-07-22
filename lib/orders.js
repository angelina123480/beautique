'use strict';

const { sql } = require('./db');

function mapItem(row) {
  return {
    productId: row.product_id === null ? null : Number(row.product_id),
    name: row.name,
    quantity: row.quantity,
    price: Number(row.price),
    shade: row.shade
  };
}

function mapOrder(row, items) {
  return {
    id: Number(row.id),
    userId: row.user_id === null ? null : Number(row.user_id),
    userEmail: row.user_email,
    status: row.status,
    items: (items || []).map(mapItem),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    discountCode: row.discount_code,
    shipping: Number(row.shipping),
    total: Number(row.total),
    pointsEarned: row.points_earned,
    paymentMethod: row.payment_method,
    address: row.address,
    hiddenFromUser: row.hidden_from_user,
    cancelledAt: row.cancelled_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

async function getItemsFor(orderIds) {
  if (!orderIds.length) return new Map();
  const rows = await sql`select * from order_items where order_id = any(${orderIds})`;
  const byOrder = new Map();
  rows.forEach((row) => {
    const list = byOrder.get(Number(row.order_id)) || [];
    list.push(row);
    byOrder.set(Number(row.order_id), list);
  });
  return byOrder;
}

async function hydrate(rows) {
  const ids = rows.map((row) => Number(row.id));
  const itemsByOrder = await getItemsFor(ids);
  return rows.map((row) => mapOrder(row, itemsByOrder.get(Number(row.id))));
}

async function getOrdersForUser(userId) {
  const rows = await sql`select * from orders where user_id = ${userId} and not hidden_from_user
    order by created_at desc`;
  return hydrate(rows);
}

/* Purchase history for the recommendation engine — deliberately ignores
   hidden_from_user, since hiding an order is just a display preference on
   the customer's own history page, not a real deletion of the purchase. */
async function getActiveOrdersForUser(userId) {
  const rows = await sql`select * from orders where user_id = ${userId} and status != 'cancelled'
    order by created_at desc`;
  return hydrate(rows);
}

async function getAllOrders() {
  const rows = await sql`select * from orders order by created_at desc`;
  return hydrate(rows);
}

async function getOrderById(id) {
  const rows = await sql`select * from orders where id = ${id}`;
  if (!rows[0]) return null;
  const items = await sql`select * from order_items where order_id = ${id}`;
  return mapOrder(rows[0], items);
}

/** Used by the review form to mark a review "verified purchase". */
async function hasVerifiedPurchase(userId, productId) {
  const rows = await sql`
    select 1 from orders o
    join order_items i on i.order_id = o.id
    where o.user_id = ${userId} and o.status != 'cancelled' and i.product_id = ${productId}
    limit 1
  `;
  return rows.length > 0;
}

/** All non-cancelled orders (used for co-purchase / "frequently bought with" ranking). */
async function getActiveOrders() {
  const rows = await sql`select * from orders where status != 'cancelled' order by created_at desc`;
  return hydrate(rows);
}

/* Un-awaited query builders — for including in an sql.transaction([...])
   batch alongside stock/user writes so checkout commits atomically. */
function createOrderQueries(order) {
  const queries = [sql`
    insert into orders (id, user_id, user_email, status, subtotal, discount, discount_code,
      shipping, total, points_earned, payment_method, address, created_at)
    values (${order.id}, ${order.userId}, ${order.userEmail}, ${order.status}, ${order.subtotal},
      ${order.discount}, ${order.discountCode}, ${order.shipping}, ${order.total}, ${order.pointsEarned},
      ${order.paymentMethod}, ${order.address}, ${order.createdAt})
  `];
  order.items.forEach((item) => {
    queries.push(sql`
      insert into order_items (order_id, product_id, name, quantity, price, shade)
      values (${order.id}, ${item.productId}, ${item.name}, ${item.quantity}, ${item.price}, ${item.shade})
    `);
  });
  return queries;
}

async function createOrder(order) {
  await sql.transaction(createOrderQueries(order));
  return getOrderById(order.id);
}

async function setStatus(id, status) {
  const rows = await sql`update orders set status = ${status}, updated_at = now() where id = ${id} returning *`;
  return rows[0] ? getOrderById(id) : null;
}

function cancelOrderQuery(id) {
  return sql`update orders set status = 'cancelled', cancelled_at = now() where id = ${id}`;
}

async function cancelOrder(id) {
  await cancelOrderQuery(id);
  return getOrderById(id);
}

async function hideOrder(id) {
  await sql`update orders set hidden_from_user = true where id = ${id}`;
}

async function hideAllOrdersForUser(userId) {
  await sql`update orders set hidden_from_user = true where user_id = ${userId}`;
}

module.exports = {
  getOrdersForUser,
  getActiveOrdersForUser,
  getAllOrders,
  getOrderById,
  hasVerifiedPurchase,
  getActiveOrders,
  createOrder,
  createOrderQueries,
  setStatus,
  cancelOrder,
  cancelOrderQuery,
  hideOrder,
  hideAllOrdersForUser
};
