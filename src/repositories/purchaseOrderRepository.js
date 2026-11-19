import { exec, generateUniqueNumericId } from "../services/database";
import { eventBus, APP_EVENTS } from "../services/events";

export async function getPurchaseOrders({ search = "", status = "ALL", limit = 20, offset = 0 } = {}) {
  const normalized = (search || "").trim().toLowerCase();
  const statusFilter = status && status !== "ALL" ? status : null;

  const sql = `
    SELECT
      po.id,
      po.supplier_name,
      po.item_name,
      po.quantity,
      po.price,
      po.order_date,
      po.status,
      po.note,
      po.close_po_date,
      po.estimated_ready_date,
      po.orderer_name,
      po.marketer_name,
      po.marketer_fee,
      po.created_at,
      po.completed_at,
      (
        SELECT IFNULL(SUM(items.quantity * items.price), 0)
        FROM purchase_order_items items
        WHERE items.order_id = po.id AND (items.deleted_at IS NULL OR items.deleted_at = '')
      ) as computed_total,
      (
        SELECT IFNULL(SUM(items.quantity), 0)
        FROM purchase_order_items items
        WHERE items.order_id = po.id AND (items.deleted_at IS NULL OR items.deleted_at = '')
      ) as computed_quantity,
      (
        SELECT GROUP_CONCAT(items.name, ', ')
        FROM purchase_order_items items
        WHERE items.order_id = po.id AND (items.deleted_at IS NULL OR items.deleted_at = '')
      ) as item_names
    FROM purchase_orders po
    WHERE (po.deleted_at IS NULL OR po.deleted_at = '')
      AND (? IS NULL OR po.status = ?)
      AND (
        ? = ''
        OR LOWER(po.item_name) LIKE ?
        OR LOWER(IFNULL(po.supplier_name,'')) LIKE ?
        OR LOWER(IFNULL(po.orderer_name,'')) LIKE ?
        OR LOWER(IFNULL(po.marketer_name,'')) LIKE ?
        OR EXISTS (
          SELECT 1 FROM purchase_order_items it
          WHERE it.order_id = po.id
            AND (it.deleted_at IS NULL OR it.deleted_at = '')
            AND LOWER(it.name) LIKE ?
        )
      )
    ORDER BY po.id DESC
    LIMIT ? OFFSET ?
  `;
  const params = [
    statusFilter,
    statusFilter,
    normalized,
    `%${normalized}%`,
    `%${normalized}%`,
    `%${normalized}%`,
    `%${normalized}%`,
    `%${normalized}%`,
    limit,
    offset,
  ];

  const res = await exec(sql, params);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}

export async function getPurchaseOrderById(id) {
  const poSql = `
    SELECT
      po.id,
      po.supplier_name,
      po.item_name,
      po.quantity,
      po.price,
      po.order_date,
      po.status,
      po.note,
      po.close_po_date,
      po.estimated_ready_date,
      po.orderer_name,
      po.marketer_name,
      po.marketer_fee,
      po.created_at,
      po.completed_at
    FROM purchase_orders po
    WHERE po.id = ? AND (po.deleted_at IS NULL OR po.deleted_at = '')
  `;
  const poRes = await exec(poSql, [id]);
  if (poRes.rows.length === 0) return null;
  const po = poRes.rows.item(0);

  const itemsSql = `
    SELECT id, order_id, name, quantity, price, cost_price
    FROM purchase_order_items
    WHERE order_id = ? AND (deleted_at IS NULL OR deleted_at = '')
    ORDER BY id ASC
  `;
  const itemsRes = await exec(itemsSql, [id]);
  const items = [];
  for (let i = 0; i < itemsRes.rows.length; i++) {
    items.push(itemsRes.rows.item(i));
  }

  return { ...po, items };
}

export async function createPurchaseOrder({
  supplierName,
  ordererName,
  marketerName,
  marketerFee = 0,
  orderDate,
  closePoDate,
  estimatedReadyDate,
  status = "PROGRESS",
  note,
  items = [],
}) {
  const poId = generateUniqueNumericId();
  const nowIso = new Date().toISOString();

  // Primary item summary
  const primaryItem = items[0] || {};
  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const totalPrice = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
  const summaryItemName = items.length > 0 ? items.map(i => i.name).filter(Boolean).join(", ") : primaryItem.name || "Pesanan";

  const poSql = `
    INSERT INTO purchase_orders (
      id, supplier_name, item_name, quantity, price, order_date, status,
      note, close_po_date, estimated_ready_date, orderer_name, marketer_name,
      marketer_fee, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
  `;
  await exec(poSql, [
    poId,
    supplierName ? supplierName.trim() : null,
    summaryItemName,
    totalQty,
    totalPrice,
    orderDate,
    status,
    note ? note.trim() : null,
    closePoDate || null,
    estimatedReadyDate || null,
    ordererName ? ordererName.trim() : null,
    marketerName ? marketerName.trim() : null,
    marketerFee || 0,
    nowIso,
  ]);

  // Insert items
  for (const item of items) {
    const itemId = generateUniqueNumericId();
    await exec(
      `INSERT INTO purchase_order_items (id, order_id, name, quantity, price, cost_price, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        poId,
        item.name.trim(),
        Number(item.quantity) || 0,
        Number(item.price) || 0,
        Number(item.costPrice || item.cost_price) || 0,
        nowIso,
      ]
    );
  }

  eventBus.emit(APP_EVENTS.PO_CHANGED, { id: poId, action: "CREATE" });
  return poId;
}

export async function updatePurchaseOrder(id, {
  supplierName,
  ordererName,
  marketerName,
  marketerFee = 0,
  orderDate,
  closePoDate,
  estimatedReadyDate,
  status,
  note,
  items = [],
}) {
  const nowIso = new Date().toISOString();
  const primaryItem = items[0] || {};
  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const totalPrice = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
  const summaryItemName = items.length > 0 ? items.map(i => i.name).filter(Boolean).join(", ") : primaryItem.name || "Pesanan";

  const poSql = `
    UPDATE purchase_orders
    SET
      supplier_name = ?,
      item_name = ?,
      quantity = ?,
      price = ?,
      order_date = ?,
      status = ?,
      note = ?,
      close_po_date = ?,
      estimated_ready_date = ?,
      orderer_name = ?,
      marketer_name = ?,
      marketer_fee = ?,
      updated_at = ?
    WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')
  `;
  await exec(poSql, [
    supplierName ? supplierName.trim() : null,
    summaryItemName,
    totalQty,
    totalPrice,
    orderDate,
    status,
    note ? note.trim() : null,
    closePoDate || null,
    estimatedReadyDate || null,
    ordererName ? ordererName.trim() : null,
    marketerName ? marketerName.trim() : null,
    marketerFee || 0,
    nowIso,
    id,
  ]);

  // Soft delete old items and insert updated items
  await exec(
    `UPDATE purchase_order_items SET deleted_at = ?, updated_at = ? WHERE order_id = ?`,
    [nowIso, nowIso, id]
  );

  for (const item of items) {
    const itemId = generateUniqueNumericId();
    await exec(
      `INSERT INTO purchase_order_items (id, order_id, name, quantity, price, cost_price, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        id,
        item.name.trim(),
        Number(item.quantity) || 0,
        Number(item.price) || 0,
        Number(item.costPrice || item.cost_price) || 0,
        nowIso,
      ]
    );
  }

  eventBus.emit(APP_EVENTS.PO_CHANGED, { id, action: "UPDATE" });
}

export async function updatePOStatus(id, newStatus) {
  const nowIso = new Date().toISOString();
  const completedAt = newStatus === "DONE" ? nowIso : null;
  await exec(
    `UPDATE purchase_orders SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    [newStatus, completedAt, nowIso, id]
  );
  eventBus.emit(APP_EVENTS.PO_CHANGED, { id, action: "STATUS_UPDATE", status: newStatus });
}

export async function softDeletePurchaseOrder(id) {
  const nowIso = new Date().toISOString();
  await exec(
    `UPDATE purchase_orders SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    [nowIso, nowIso, id]
  );
  await exec(
    `UPDATE purchase_order_items SET deleted_at = ?, updated_at = ? WHERE order_id = ?`,
    [nowIso, nowIso, id]
  );
  eventBus.emit(APP_EVENTS.PO_CHANGED, { id, action: "DELETE" });
}

export async function getDistinctSuppliers() {
  const sql = `
    SELECT DISTINCT supplier_name
    FROM purchase_orders
    WHERE supplier_name IS NOT NULL AND TRIM(supplier_name) != '' AND (deleted_at IS NULL OR deleted_at = '')
    ORDER BY supplier_name ASC
  `;
  const res = await exec(sql);
  const suppliers = [];
  for (let i = 0; i < res.rows.length; i++) {
    suppliers.push(res.rows.item(i).supplier_name);
  }
  return suppliers;
}

export async function getPOSummaryMetrics() {
  const countsRes = await exec(`
    SELECT
      COUNT(id) as total_count,
      SUM(CASE WHEN status = 'PROGRESS' THEN 1 ELSE 0 END) as progress_count,
      SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) as done_count,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_count
    FROM purchase_orders
    WHERE (deleted_at IS NULL OR deleted_at = '')
  `);
  const counts = countsRes.rows.item(0) || {};

  const valuesRes = await exec(`
    SELECT
      IFNULL(SUM(items.quantity * items.price), 0) as total_value,
      IFNULL(SUM(CASE WHEN po.status = 'PROGRESS' THEN items.quantity * items.price ELSE 0 END), 0) as progress_value,
      IFNULL(SUM(CASE WHEN po.status = 'DONE' THEN items.quantity * items.price ELSE 0 END), 0) as done_value
    FROM purchase_orders po
    JOIN purchase_order_items items ON items.order_id = po.id
    WHERE (po.deleted_at IS NULL OR po.deleted_at = '')
      AND (items.deleted_at IS NULL OR items.deleted_at = '')
  `);
  const values = valuesRes.rows.item(0) || {};

  const profitDoneRes = await exec(`
    SELECT (
      IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) -
      IFNULL((SELECT SUM(marketer_fee) FROM purchase_orders WHERE status = 'DONE' AND (deleted_at IS NULL OR deleted_at = '')), 0)
    ) as done_profit
    FROM purchase_orders po
    JOIN purchase_order_items items ON items.order_id = po.id
    WHERE po.status = 'DONE'
      AND (po.deleted_at IS NULL OR po.deleted_at = '')
      AND (items.deleted_at IS NULL OR items.deleted_at = '')
  `);
  const doneProfit = profitDoneRes.rows.item(0)?.done_profit ?? 0;

  const profitProgressRes = await exec(`
    SELECT (
      IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) -
      IFNULL((SELECT SUM(marketer_fee) FROM purchase_orders WHERE status = 'PROGRESS' AND (deleted_at IS NULL OR deleted_at = '')), 0)
    ) as progress_profit
    FROM purchase_orders po
    JOIN purchase_order_items items ON items.order_id = po.id
    WHERE po.status = 'PROGRESS'
      AND (po.deleted_at IS NULL OR po.deleted_at = '')
      AND (items.deleted_at IS NULL OR items.deleted_at = '')
  `);
  const progressProfit = profitProgressRes.rows.item(0)?.progress_profit ?? 0;

  const totalMarketerFeeRes = await exec(`
    SELECT IFNULL(SUM(marketer_fee), 0) as total_fee
    FROM purchase_orders
    WHERE (deleted_at IS NULL OR deleted_at = '')
  `);
  const totalMarketerFee = totalMarketerFeeRes.rows.item(0)?.total_fee ?? 0;

  return {
    totalCount: Number(counts.total_count || 0),
    progressCount: Number(counts.progress_count || 0),
    doneCount: Number(counts.done_count || 0),
    cancelledCount: Number(counts.cancelled_count || 0),
    totalValue: Number(values.total_value || 0),
    progressValue: Number(values.progress_value || 0),
    doneValue: Number(values.done_value || 0),
    doneProfit: Number(doneProfit || 0),
    progressProfit: Number(progressProfit || 0),
    totalMarketerFee: Number(totalMarketerFee || 0),
  };
}

export async function getPOReportData(startDate, endDate) {
  const sql = `
    SELECT
      po.id as order_id,
      po.order_date,
      po.status,
      IFNULL(po.orderer_name, '') as orderer_name,
      IFNULL(po.supplier_name, '') as supplier_name,
      IFNULL(po.marketer_name, '') as marketer_name,
      IFNULL(po.marketer_fee, 0) as marketer_fee,
      IFNULL(po.note, '') as order_note,
      po.created_at,
      IFNULL(po.close_po_date, '') as close_po_date,
      IFNULL(po.estimated_ready_date, '') as estimated_ready_date,
      items.id as item_id,
      IFNULL(items.name, '') as item_name,
      IFNULL(items.quantity, 0) as item_quantity,
      IFNULL(items.price, 0) as item_price,
      IFNULL(items.cost_price, 0) as item_cost_price,
      IFNULL(items.quantity * items.price, 0) as item_total,
      (
        SELECT IFNULL(SUM(it.quantity * it.price), 0)
        FROM purchase_order_items it
        WHERE it.order_id = po.id AND (it.deleted_at IS NULL OR it.deleted_at = '')
      ) as order_total
    FROM purchase_orders po
    LEFT JOIN purchase_order_items items ON items.order_id = po.id AND (items.deleted_at IS NULL OR items.deleted_at = '')
    WHERE (po.deleted_at IS NULL OR po.deleted_at = '')
      AND DATE(po.order_date) BETWEEN ? AND ?
    ORDER BY po.id ASC, items.id ASC
  `;
  const res = await exec(sql, [startDate, endDate]);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}
