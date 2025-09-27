import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { exec } from "./database";
import { saveFileToStorage, resolveShareableUri } from "./files";
import { serializeToCsv, buildTimestampedFileBase } from "../utils/csv";

async function fetchRows(sql, params = [], mapRow) {
  const res = await exec(sql, params);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    const raw = res.rows.item(i);
    rows.push(mapRow ? mapRow(raw) : raw);
  }
  return rows;
}

async function writeCsvToStorage({ fileBase, columns, rows }) {
  const csvContent = serializeToCsv(columns, rows);
  const tempDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!tempDir) throw new Error("CACHE_DIRECTORY_UNAVAILABLE");
  const tempPath = `${tempDir}tmp-${fileBase}.csv`;
  await FileSystem.writeAsStringAsync(tempPath, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const fileName = `${fileBase}.csv`;
  const saved = await saveFileToStorage(tempPath, fileName, "text/csv");
  let shareUri = null;
  if (await Sharing.isAvailableAsync()) {
    shareUri = await resolveShareableUri(fileName, saved.uri, tempPath);
  }
  try {
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
  } catch (error) {
    // ignore temp delete errors
  }
  return {
    ...saved,
    fileName,
    shareUri,
  };
}

export async function exportItemsCsv() {
  const rows = await fetchRows(
    `
      SELECT id, name, category, price, cost_price, stock
      FROM items
      ORDER BY name COLLATE NOCASE ASC
    `,
  );
  const columns = [
    { key: "id", header: "ID" },
    { key: "name", header: "Nama" },
    { key: "category", header: "Kategori" },
    { key: "stock", header: "Stok" },
    { key: "price", header: "Harga Jual" },
    { key: "cost_price", header: "Harga Modal" },
  ];
  const fileBase = buildTimestampedFileBase("barang");
  return writeCsvToStorage({ fileBase, columns, rows });
}

export async function exportPurchaseOrdersCsv() {
  const rows = await fetchRows(
    `
      SELECT
        po.id as order_id,
        po.order_date,
        po.status,
        IFNULL(po.orderer_name, '') as orderer_name,
        IFNULL(po.supplier_name, '') as supplier_name,
        IFNULL(po.note, '') as order_note,
        po.created_at,
        items.id as item_id,
        IFNULL(items.name, '') as item_name,
        IFNULL(items.quantity, 0) as item_quantity,
        IFNULL(items.price, 0) as item_price,
        IFNULL(items.cost_price, 0) as item_cost_price,
        IFNULL(items.quantity * items.price, 0) as item_total,
        (
          SELECT IFNULL(SUM(it.quantity * it.price), 0)
          FROM purchase_order_items it
          WHERE it.order_id = po.id
        ) as order_total
      FROM purchase_orders po
      LEFT JOIN purchase_order_items items ON items.order_id = po.id
      ORDER BY po.order_date DESC, po.id DESC, items.id ASC
    `,
  );
  const columns = [
    { key: "order_id", header: "Order ID" },
    { key: "order_date", header: "Tanggal Order" },
    { key: "status", header: "Status" },
    { key: "orderer_name", header: "Pemesan" },
    { key: "supplier_name", header: "Supplier" },
    { key: "order_note", header: "Catatan Order" },
    { key: "created_at", header: "Dibuat" },
    { key: "order_total", header: "Total Order" },
    { key: "item_id", header: "Item ID" },
    { key: "item_name", header: "Nama Item" },
    { key: "item_quantity", header: "Qty" },
    { key: "item_price", header: "Harga Item" },
    { key: "item_cost_price", header: "Harga Modal Item" },
    { key: "item_total", header: "Total Item" },
  ];
  const fileBase = buildTimestampedFileBase("purchase-orders");
  return writeCsvToStorage({ fileBase, columns, rows });
}

export async function exportBookkeepingCsv() {
  const rows = await fetchRows(
    `
      SELECT
        e.id as entry_id,
        e.name,
        e.amount,
        e.entry_date,
        IFNULL(e.note, '') as entry_note,
        e.created_at as entry_created_at,
        h.id as history_id,
        IFNULL(h.change_amount, 0) as change_amount,
        IFNULL(h.type, '') as change_type,
        IFNULL(h.note, '') as change_note,
        IFNULL(h.previous_amount, 0) as previous_amount,
        IFNULL(h.new_amount, 0) as new_amount,
        h.created_at as change_created_at
      FROM bookkeeping_entries e
      LEFT JOIN bookkeeping_entry_history h ON h.entry_id = e.id
      ORDER BY e.entry_date DESC, e.id DESC, h.id ASC
    `,
  );
  const columns = [
    { key: "entry_id", header: "Entry ID" },
    { key: "name", header: "Nama" },
    { key: "amount", header: "Nominal" },
    { key: "entry_date", header: "Tanggal" },
    { key: "entry_note", header: "Catatan Entry" },
    { key: "entry_created_at", header: "Entry Dibuat" },
    { key: "history_id", header: "Riwayat ID" },
    { key: "change_amount", header: "Perubahan" },
    { key: "change_type", header: "Jenis" },
    { key: "change_note", header: "Catatan Riwayat" },
    { key: "previous_amount", header: "Saldo Sebelum" },
    { key: "new_amount", header: "Saldo Sesudah" },
    { key: "change_created_at", header: "Riwayat Dibuat" },
  ];
  const fileBase = buildTimestampedFileBase("pembukuan");
  return writeCsvToStorage({ fileBase, columns, rows });
}

export async function exportStockHistoryCsv() {
  const rows = await fetchRows(
    `
      SELECT
        h.id,
        h.item_id,
        i.name as item_name,
        h.type,
        h.qty,
        IFNULL(h.note, '') as note,
        h.created_at,
        IFNULL(h.unit_price, 0) as unit_price,
        IFNULL(h.unit_cost, 0) as unit_cost,
        IFNULL(h.profit_amount, 0) as profit_amount
      FROM stock_history h
      LEFT JOIN items i ON i.id = h.item_id
      ORDER BY h.created_at DESC, h.id DESC
    `,
  );
  const columns = [
    { key: "id", header: "Riwayat ID" },
    { key: "item_id", header: "Item ID" },
    { key: "item_name", header: "Nama Item" },
    { key: "type", header: "Jenis" },
    { key: "qty", header: "Qty" },
    { key: "unit_price", header: "Harga Jual" },
    { key: "unit_cost", header: "Harga Modal" },
    { key: "profit_amount", header: "Profit" },
    { key: "note", header: "Catatan" },
    { key: "created_at", header: "Dibuat" },
  ];
  const fileBase = buildTimestampedFileBase("riwayat-stok");
  return writeCsvToStorage({ fileBase, columns, rows });
}

export async function exportAllDataCsv() {
  const datasets = [
    { label: "Barang", exporter: exportItemsCsv },
    { label: "Riwayat Stok", exporter: exportStockHistoryCsv },
    { label: "Purchase Order", exporter: exportPurchaseOrdersCsv },
    { label: "Pembukuan", exporter: exportBookkeepingCsv },
  ];
  const results = [];
  for (const dataset of datasets) {
    try {
      const result = await dataset.exporter();
      results.push({ label: dataset.label, ...result, success: true });
    } catch (error) {
      console.log("EXPORT DATASET ERROR:", dataset.label, error);
      results.push({ label: dataset.label, success: false, error });
    }
  }
  return results;
}
