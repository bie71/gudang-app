import { exec } from "../services/database";

export async function getDashboardMetrics() {
  // 1. Items & Valuation
  const itemRes = await exec(`
    SELECT
      COUNT(*) as totalItems,
      IFNULL(SUM(stock), 0) as totalStock,
      IFNULL(SUM(stock * price), 0) as totalValue,
      COUNT(DISTINCT category) as totalCategories
    FROM items
    WHERE (deleted_at IS NULL OR deleted_at = '')
  `);
  const itemMetrics = itemRes.rows.length > 0 ? itemRes.rows.item(0) : {};

  // 2. Stock Moves Today
  const movesRes = await exec(`
    SELECT
      IFNULL(SUM(CASE WHEN type = 'IN' THEN qty ELSE 0 END), 0) as inQtyToday,
      IFNULL(SUM(CASE WHEN type = 'OUT' THEN qty ELSE 0 END), 0) as outQtyToday
    FROM stock_history
    WHERE (deleted_at IS NULL OR deleted_at = '')
      AND date(created_at) = date('now', 'localtime')
  `);
  const moveMetrics = movesRes.rows.length > 0 ? movesRes.rows.item(0) : {};

  // 3. Purchase Orders
  const poRes = await exec(`
    SELECT
      COUNT(*) as poCount,
      IFNULL(SUM(CASE WHEN status = 'PROGRESS' THEN 1 ELSE 0 END), 0) as poProgress,
      IFNULL(SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END), 0) as poDone,
      IFNULL(SUM(CASE WHEN status != 'CANCELLED' THEN (
        SELECT IFNULL(SUM(poi.quantity * poi.price), 0)
        FROM purchase_order_items poi
        WHERE poi.order_id = po.id AND (poi.deleted_at IS NULL OR poi.deleted_at = '')
      ) ELSE 0 END), 0) as poTotalValue,
      IFNULL(SUM(CASE WHEN status = 'PROGRESS' THEN (
        SELECT IFNULL(SUM(poi.quantity * (poi.price - IFNULL(poi.cost_price, 0))), 0)
        FROM purchase_order_items poi
        WHERE poi.order_id = po.id AND (poi.deleted_at IS NULL OR poi.deleted_at = '')
      ) - IFNULL(po.marketer_fee, 0) ELSE 0 END), 0) as poProgressProfit,
      IFNULL(SUM(CASE WHEN status = 'DONE' THEN (
        SELECT IFNULL(SUM(poi.quantity * (poi.price - IFNULL(poi.cost_price, 0))), 0)
        FROM purchase_order_items poi
        WHERE poi.order_id = po.id AND (poi.deleted_at IS NULL OR poi.deleted_at = '')
      ) - IFNULL(po.marketer_fee, 0) ELSE 0 END), 0) as poDoneProfit,
      IFNULL(SUM(po.marketer_fee), 0) as totalMarketerFee
    FROM purchase_orders po
    WHERE (po.deleted_at IS NULL OR po.deleted_at = '')
  `);
  const poMetrics = poRes.rows.length > 0 ? poRes.rows.item(0) : {};

  // 4. Bookkeeping
  const bookRes = await exec(`
    SELECT
      COUNT(*) as bookkeepingCount,
      IFNULL(SUM(amount), 0) as bookkeepingTotal
    FROM bookkeeping_entries
    WHERE (deleted_at IS NULL OR deleted_at = '')
  `);
  const bookMetrics = bookRes.rows.length > 0 ? bookRes.rows.item(0) : {};

  return {
    totalItems: Number(itemMetrics.totalItems) || 0,
    totalStock: Number(itemMetrics.totalStock) || 0,
    totalValue: Number(itemMetrics.totalValue) || 0,
    totalCategories: Number(itemMetrics.totalCategories) || 0,
    inQtyToday: Number(moveMetrics.inQtyToday) || 0,
    outQtyToday: Number(moveMetrics.outQtyToday) || 0,
    poCount: Number(poMetrics.poCount) || 0,
    poProgress: Number(poMetrics.poProgress) || 0,
    poDone: Number(poMetrics.poDone) || 0,
    poTotalValue: Number(poMetrics.poTotalValue) || 0,
    poProgressProfit: Number(poMetrics.poProgressProfit) || 0,
    poDoneProfit: Number(poMetrics.poDoneProfit) || 0,
    totalMarketerFee: Number(poMetrics.totalMarketerFee) || 0,
    bookkeepingCount: Number(bookMetrics.bookkeepingCount) || 0,
    bookkeepingTotal: Number(bookMetrics.bookkeepingTotal) || 0,
  };
}

export async function getDashboardPriorityAlerts() {
  // Low stock items (stock <= 5)
  const lowStockRes = await exec(`
    SELECT id, name, category, stock, price
    FROM items
    WHERE (deleted_at IS NULL OR deleted_at = '') AND stock <= 5
    ORDER BY stock ASC
    LIMIT 10
  `);
  const lowStockItems = [];
  for (let i = 0; i < lowStockRes.rows.length; i++) {
    lowStockItems.push(lowStockRes.rows.item(i));
  }

  // Urgent POs in progress
  const urgentPoRes = await exec(`
    SELECT
      id, supplier_name, item_name, quantity, price, order_date, status,
      close_po_date, estimated_ready_date, orderer_name, marketer_name
    FROM purchase_orders
    WHERE (deleted_at IS NULL OR deleted_at = '') AND status = 'PROGRESS'
    ORDER BY close_po_date ASC, id DESC
    LIMIT 10
  `);
  const urgentPOs = [];
  for (let i = 0; i < urgentPoRes.rows.length; i++) {
    urgentPOs.push(urgentPoRes.rows.item(i));
  }

  return { lowStockItems, urgentPOs };
}

export async function getDashboardRecentPOs(limit = 5) {
  const sql = `
    SELECT
      po.id,
      po.supplier_name,
      po.item_name,
      po.quantity,
      po.price,
      po.order_date,
      po.status,
      po.close_po_date,
      po.estimated_ready_date,
      po.orderer_name,
      po.marketer_name,
      (
        SELECT IFNULL(SUM(poi.quantity * poi.price), 0)
        FROM purchase_order_items poi
        WHERE poi.order_id = po.id AND (poi.deleted_at IS NULL OR poi.deleted_at = '')
      ) as computed_total
    FROM purchase_orders po
    WHERE (po.deleted_at IS NULL OR po.deleted_at = '')
    ORDER BY po.id DESC
    LIMIT ?
  `;
  const res = await exec(sql, [limit]);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}

export async function getDashboardCategoryStats(limit = 6) {
  const sql = `
    SELECT
      CASE WHEN category IS NULL OR TRIM(category) = '' THEN 'Tanpa Kategori' ELSE category END as label,
      COUNT(*) as totalItems,
      IFNULL(SUM(stock), 0) as totalStock,
      IFNULL(SUM(price * stock), 0) as totalValue
    FROM items
    WHERE (deleted_at IS NULL OR deleted_at = '')
    GROUP BY label
    ORDER BY totalStock DESC
    LIMIT ?
  `;
  const res = await exec(sql, [limit]);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}
