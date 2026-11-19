import { exec } from "../services/database";

export async function getAnalyticsData(days = 7) {
  const dayCount = Number(days) || 7;

  // 1. Arus Kas (Cash Flow)
  const cashFlowSql = `
    SELECT
      date(sh.created_at) as date,
      IFNULL(SUM(CASE WHEN sh.type = 'OUT' THEN sh.qty * sh.unit_price ELSE 0 END), 0) as income,
      IFNULL(SUM(CASE WHEN sh.type = 'IN' THEN sh.qty * sh.unit_cost ELSE 0 END), 0) as expense
    FROM stock_history sh
    JOIN items i ON i.id = sh.item_id
    WHERE (sh.deleted_at IS NULL OR sh.deleted_at = '')
      AND (i.deleted_at IS NULL OR i.deleted_at = '')
      AND date(sh.created_at) >= date('now', 'localtime', '-${dayCount} days')
    GROUP BY date(sh.created_at)
    ORDER BY date(sh.created_at) ASC
  `;
  const cashFlowRes = await exec(cashFlowSql);
  const cashFlow = [];
  for (let i = 0; i < cashFlowRes.rows.length; i++) {
    cashFlow.push(cashFlowRes.rows.item(i));
  }

  // 2. Kategori Barang (Category Distribution)
  const categorySql = `
    SELECT
      CASE WHEN category IS NULL OR TRIM(category) = '' THEN 'Lainnya' ELSE category END as label,
      COUNT(*) as count,
      IFNULL(SUM(stock), 0) as totalStock,
      IFNULL(SUM(stock * price), 0) as totalValue
    FROM items
    WHERE (deleted_at IS NULL OR deleted_at = '')
    GROUP BY label
    ORDER BY totalValue DESC
    LIMIT 6
  `;
  const categoryRes = await exec(categorySql);
  const categoryData = [];
  for (let i = 0; i < categoryRes.rows.length; i++) {
    categoryData.push(categoryRes.rows.item(i));
  }

  // 3. Fast Moving Items
  const fastMovingSql = `
    SELECT
      i.id,
      i.name,
      i.stock,
      IFNULL(SUM(sh.qty), 0) as totalSold,
      IFNULL(SUM(sh.qty * sh.unit_price), 0) as totalRevenue,
      IFNULL(SUM(sh.profit_amount), 0) as totalProfit
    FROM stock_history sh
    JOIN items i ON i.id = sh.item_id
    WHERE sh.type = 'OUT'
      AND (sh.deleted_at IS NULL OR sh.deleted_at = '')
      AND (i.deleted_at IS NULL OR i.deleted_at = '')
      AND date(sh.created_at) >= date('now', 'localtime', '-${dayCount} days')
    GROUP BY i.id, i.name, i.stock
    ORDER BY totalSold DESC
    LIMIT 10
  `;
  const fastMovingRes = await exec(fastMovingSql);
  const fastMovingItems = [];
  for (let i = 0; i < fastMovingRes.rows.length; i++) {
    fastMovingItems.push(fastMovingRes.rows.item(i));
  }

  // 4. Ringkasan Keuntungan & Pendapatan
  const profitSql = `
    SELECT
      IFNULL(SUM(CASE WHEN sh.type = 'OUT' THEN sh.profit_amount ELSE 0 END), 0) as itemProfit,
      IFNULL(SUM(CASE WHEN sh.type = 'OUT' THEN sh.qty * sh.unit_price ELSE 0 END), 0) as totalRevenue
    FROM stock_history sh
    JOIN items i ON i.id = sh.item_id
    WHERE (sh.deleted_at IS NULL OR sh.deleted_at = '')
      AND (i.deleted_at IS NULL OR i.deleted_at = '')
  `;
  const profitRes = await exec(profitSql);
  const profitRow = profitRes.rows.length > 0 ? profitRes.rows.item(0) : {};

  // PO Profit
  const poProfitSql = `
    SELECT
      IFNULL(SUM(CASE WHEN po.status = 'DONE' THEN (poi.price - poi.cost_price) * poi.quantity - IFNULL(po.marketer_fee, 0) ELSE 0 END), 0) as poDoneProfit,
      IFNULL(SUM(CASE WHEN po.status = 'PROGRESS' THEN (poi.price - poi.cost_price) * poi.quantity - IFNULL(po.marketer_fee, 0) ELSE 0 END), 0) as poProgressProfit
    FROM purchase_orders po
    JOIN purchase_order_items poi ON poi.order_id = po.id
    WHERE (po.deleted_at IS NULL OR po.deleted_at = '')
      AND (poi.deleted_at IS NULL OR poi.deleted_at = '')
  `;
  const poProfitRes = await exec(poProfitSql);
  const poProfitRow = poProfitRes.rows.length > 0 ? poProfitRes.rows.item(0) : {};

  // 5. Statistik PO
  const poStatsSql = `
    SELECT
      COUNT(*) as totalOrders,
      IFNULL(SUM(CASE WHEN status = 'PROGRESS' THEN 1 ELSE 0 END), 0) as progressOrders,
      IFNULL(SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END), 0) as doneOrders,
      IFNULL(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) as cancelledOrders,
      IFNULL(SUM(CASE WHEN status != 'CANCELLED' THEN (
        SELECT IFNULL(SUM(poi.quantity * poi.price), 0)
        FROM purchase_order_items poi
        WHERE poi.order_id = po.id AND (poi.deleted_at IS NULL OR poi.deleted_at = '')
      ) ELSE 0 END), 0) as totalValue
    FROM purchase_orders po
    WHERE (po.deleted_at IS NULL OR po.deleted_at = '')
  `;
  const poStatsRes = await exec(poStatsSql);
  const poStats = poStatsRes.rows.length > 0 ? poStatsRes.rows.item(0) : {};

  return {
    cashFlow,
    categoryData,
    fastMovingItems,
    profitSummary: {
      itemProfit: Number(profitRow.itemProfit) || 0,
      totalRevenue: Number(profitRow.totalRevenue) || 0,
      poProfit: Number(poProfitRow.poDoneProfit) || 0,
      poProgressProfit: Number(poProfitRow.poProgressProfit) || 0,
    },
    poStats: {
      totalOrders: Number(poStats.totalOrders) || 0,
      progressOrders: Number(poStats.progressOrders) || 0,
      doneOrders: Number(poStats.doneOrders) || 0,
      cancelledOrders: Number(poStats.cancelledOrders) || 0,
      totalValue: Number(poStats.totalValue) || 0,
    },
  };
}
