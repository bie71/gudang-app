import * as FileSystem from "expo-file-system/legacy";

import { exec } from "./database";
import { saveFileToStorage } from "./files";
import { buildTimestampedFileBase } from "../utils/csv";

const BACKUP_VERSION = 1;

const TABLE_SCHEMAS = {
  items: ["id", "name", "category", "price", "cost_price", "stock"],
  purchase_orders: [
    "id",
    "supplier_name",
    "item_name",
    "quantity",
    "price",
    "order_date",
    "status",
    "note",
    "created_at",
    "orderer_name",
    "completed_at",
  ],
  purchase_order_items: ["id", "order_id", "name", "quantity", "price", "cost_price"],
  bookkeeping_entries: ["id", "name", "amount", "entry_date", "note", "created_at"],
  bookkeeping_entry_history: [
    "id",
    "entry_id",
    "change_amount",
    "type",
    "note",
    "previous_amount",
    "new_amount",
    "created_at",
  ],
  stock_history: [
    "id",
    "item_id",
    "type",
    "qty",
    "note",
    "created_at",
    "unit_price",
    "unit_cost",
    "profit_amount",
  ],
};

const EXPORT_QUERIES = {
  items: `SELECT id, name, category, price, cost_price, stock FROM items ORDER BY id ASC`,
  purchase_orders: `
    SELECT
      id,
      supplier_name,
      item_name,
      quantity,
      price,
      order_date,
      status,
      note,
      created_at,
      orderer_name,
      completed_at
    FROM purchase_orders
    ORDER BY id ASC
  `,
  purchase_order_items: `
    SELECT id, order_id, name, quantity, price, cost_price
    FROM purchase_order_items
    ORDER BY id ASC
  `,
  bookkeeping_entries: `
    SELECT id, name, amount, entry_date, note, created_at
    FROM bookkeeping_entries
    ORDER BY id ASC
  `,
  bookkeeping_entry_history: `
    SELECT id, entry_id, change_amount, type, note, previous_amount, new_amount, created_at
    FROM bookkeeping_entry_history
    ORDER BY id ASC
  `,
  stock_history: `
    SELECT id, item_id, type, qty, note, created_at, unit_price, unit_cost, profit_amount
    FROM stock_history
    ORDER BY id ASC
  `,
};

const INSERT_ORDER = [
  "items",
  "purchase_orders",
  "purchase_order_items",
  "bookkeeping_entries",
  "bookkeeping_entry_history",
  "stock_history",
];

const CLEAR_ORDER = [...INSERT_ORDER].reverse();

async function fetchAllRows(query) {
  const res = await exec(query);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}

function sanitizeRow(row, columns) {
  const output = {};
  columns.forEach(column => {
    if (Object.prototype.hasOwnProperty.call(row, column)) {
      output[column] = row[column];
    } else {
      output[column] = null;
    }
  });
  return output;
}

export async function exportDatabaseBackup() {
  const tables = {};
  for (const table of INSERT_ORDER) {
    const query = EXPORT_QUERIES[table];
    const columns = TABLE_SCHEMAS[table];
    if (!query || !columns) continue;
    const rows = await fetchAllRows(query);
    tables[table] = rows.map(row => sanitizeRow(row, columns));
  }

  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };

  const fileBase = buildTimestampedFileBase("gudang-backup");
  const json = JSON.stringify(payload, null, 2);
  const tempDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!tempDir) throw new Error("CACHE_DIRECTORY_UNAVAILABLE");
  const tempPath = `${tempDir}${fileBase}.json`;
  await FileSystem.writeAsStringAsync(tempPath, json, { encoding: FileSystem.EncodingType.UTF8 });
  const saved = await saveFileToStorage(tempPath, `${fileBase}.json`, "application/json");
  try {
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
  } catch (error) {
    // ignore temp delete errors
  }
  return {
    ...saved,
    fileName: `${fileBase}.json`,
  };
}

async function insertRows(table, rows) {
  const columns = TABLE_SCHEMAS[table];
  if (!columns || !Array.isArray(rows) || !rows.length) return;
  const columnSql = columns.map(col => `"${col}"`).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${table} (${columnSql}) VALUES (${placeholders})`;
  for (const row of rows) {
    const sanitized = sanitizeRow(row || {}, columns);
    const values = columns.map(col => sanitized[col]);
    await exec(sql, values);
  }
}

export async function importDatabaseBackup(fileUri) {
  if (!fileUri) throw new Error("Backup file tidak ditemukan.");
  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  let payload;
  try {
    payload = JSON.parse(content);
  } catch (error) {
    throw new Error("File backup tidak valid. Pastikan memilih file yang benar.");
  }
  if (!payload || typeof payload !== "object" || !payload.tables) {
    throw new Error("Struktur file backup tidak sesuai.");
  }
  if (payload.version > BACKUP_VERSION) {
    throw new Error("Versi backup lebih baru dari aplikasi. Perbarui aplikasi terlebih dahulu.");
  }
  const tables = payload.tables;

  let transactionActive = false;
  try {
    await exec("BEGIN TRANSACTION");
    transactionActive = true;

    for (const table of CLEAR_ORDER) {
      await exec(`DELETE FROM ${table}`);
    }

    for (const table of INSERT_ORDER) {
      const rows = Array.isArray(tables[table]) ? tables[table] : [];
      await insertRows(table, rows);
    }

    await exec("COMMIT");
    transactionActive = false;
  } catch (error) {
    console.log("IMPORT BACKUP ERROR:", error);
    if (transactionActive) {
      try {
        await exec("ROLLBACK");
      } catch (rollbackError) {
        console.log("IMPORT BACKUP ROLLBACK ERROR:", rollbackError);
      }
    }
    throw error;
  }
}
