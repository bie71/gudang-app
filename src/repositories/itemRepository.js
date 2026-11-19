import { exec, generateUniqueNumericId } from "../services/database";

export async function getItems({ search = "", limit = 20, offset = 0 } = {}) {
  const normalized = (search || "").trim().toLowerCase();
  const sql = `
    SELECT id, name, category, price, cost_price, stock, size
    FROM items
    WHERE (deleted_at IS NULL OR deleted_at = '')
      AND (? = '' OR LOWER(name) LIKE ? OR LOWER(IFNULL(category,'')) LIKE ?)
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  const params = [normalized, `%${normalized}%`, `%${normalized}%`, limit, offset];
  const res = await exec(sql, params);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}

export async function getItemById(id) {
  const sql = `
    SELECT id, name, category, price, cost_price, stock, size, updated_at
    FROM items
    WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')
  `;
  const res = await exec(sql, [id]);
  return res.rows.length > 0 ? res.rows.item(0) : null;
}

export async function createItem({ name, category, price, costPrice = 0, stock, size = "" }) {
  const id = generateUniqueNumericId();
  const nowIso = new Date().toISOString();
  const sql = `
    INSERT INTO items (id, name, category, price, cost_price, stock, size, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await exec(sql, [
    id,
    name.trim(),
    category ? category.trim() : null,
    price,
    costPrice,
    stock,
    size ? size.trim() : null,
    nowIso,
  ]);
  return id;
}

export async function updateItem(id, { name, category, price, costPrice = 0, stock, size = "" }) {
  const nowIso = new Date().toISOString();
  const sql = `
    UPDATE items
    SET name = ?, category = ?, price = ?, cost_price = ?, stock = ?, size = ?, updated_at = ?
    WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')
  `;
  await exec(sql, [
    name.trim(),
    category ? category.trim() : null,
    price,
    costPrice,
    stock,
    size ? size.trim() : null,
    nowIso,
    id,
  ]);
}

export async function softDeleteItem(id) {
  const nowIso = new Date().toISOString();
  // Soft delete item
  await exec(
    `UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    [nowIso, nowIso, id]
  );
  // Soft delete associated stock history
  await exec(
    `UPDATE stock_history SET deleted_at = ?, updated_at = ? WHERE item_id = ?`,
    [nowIso, nowIso, id]
  );
}

export async function getStockHistory(itemId, limit = 50) {
  const sql = `
    SELECT id, type, qty, note, created_at, unit_price, unit_cost, profit_amount
    FROM stock_history
    WHERE item_id = ? AND (deleted_at IS NULL OR deleted_at = '')
    ORDER BY id DESC
    LIMIT ?
  `;
  const res = await exec(sql, [itemId, limit]);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}

export async function addStockMovement({
  itemId,
  type, // "IN" | "OUT"
  qty,
  note = "",
  unitPrice = 0,
  unitCost = 0,
  profitAmount = 0,
}) {
  const movementId = generateUniqueNumericId();
  const nowIso = new Date().toISOString();

  // 1. Catat ke stock_history
  const insertHistorySql = `
    INSERT INTO stock_history (id, item_id, type, qty, note, unit_price, unit_cost, profit_amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
  `;
  await exec(insertHistorySql, [
    movementId,
    itemId,
    type,
    qty,
    note || null,
    unitPrice,
    unitCost,
    profitAmount,
    nowIso,
  ]);

  // 2. Perbarui jumlah stok di items
  const delta = type === "IN" ? qty : -qty;
  const updateItemSql = `
    UPDATE items
    SET stock = MAX(0, stock + ?), updated_at = ?
    WHERE id = ?
  `;
  await exec(updateItemSql, [delta, nowIso, itemId]);

  return movementId;
}

export async function getItemReportData(startDate, endDate) {
  const sql = `
    SELECT
      i.id as item_id,
      i.name as item_name,
      IFNULL(i.category, '') as category,
      IFNULL(i.size, '') as size,
      i.stock as current_stock,
      i.price as unit_price,
      i.cost_price as unit_cost,
      sh.id as history_id,
      sh.type,
      sh.qty,
      IFNULL(sh.note, '') as note,
      sh.created_at,
      IFNULL(sh.profit_amount, 0) as profit_amount
    FROM stock_history sh
    JOIN items i ON i.id = sh.item_id
    WHERE (i.deleted_at IS NULL OR i.deleted_at = '')
      AND (sh.deleted_at IS NULL OR sh.deleted_at = '')
      AND DATE(sh.created_at) BETWEEN ? AND ?
    ORDER BY sh.id DESC
  `;
  const res = await exec(sql, [startDate, endDate]);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}
