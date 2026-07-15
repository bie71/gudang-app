import { openDatabaseAsync } from "expo-sqlite";

const dbPromise = openDatabaseAsync("gudang.db");
let initPromise;

export async function ensureDbReady() {
  const db = await dbPromise;
  try {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  } catch (error) {
    // ignore pragma errors
  }
  if (!initPromise) {
    initPromise = (async () => {
      const createItemsSql =
        "CREATE TABLE IF NOT EXISTS items (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "name TEXT NOT NULL," +
        "category TEXT," +
        "price INTEGER NOT NULL DEFAULT 0," +
        "stock INTEGER NOT NULL DEFAULT 0" +
        ");";
      const createHistorySql =
        "CREATE TABLE IF NOT EXISTS stock_history (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "item_id INTEGER NOT NULL," +
        "type TEXT NOT NULL," +
        "qty INTEGER NOT NULL," +
        "note TEXT," +
        "created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))," +
        "FOREIGN KEY(item_id) REFERENCES items(id)" +
        ");";
      const createPurchaseOrderSql =
        "CREATE TABLE IF NOT EXISTS purchase_orders (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "supplier_name TEXT," +
        "item_name TEXT NOT NULL," +
        "quantity INTEGER NOT NULL DEFAULT 0," +
        "price INTEGER NOT NULL DEFAULT 0," +
        "order_date TEXT NOT NULL," +
        "status TEXT NOT NULL DEFAULT 'PROGRESS'," +
        "note TEXT," +
        "close_po_date TEXT," +
        "estimated_ready_date TEXT," +
        "created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))" +
        ");";
      const createPurchaseOrderItemsSql =
        "CREATE TABLE IF NOT EXISTS purchase_order_items (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "order_id INTEGER NOT NULL," +
        "name TEXT NOT NULL," +
        "quantity INTEGER NOT NULL DEFAULT 0," +
        "price INTEGER NOT NULL DEFAULT 0," +
        "FOREIGN KEY(order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE" +
        ");";
      const createBookkeepingSql =
        "CREATE TABLE IF NOT EXISTS bookkeeping_entries (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "name TEXT NOT NULL," +
        "amount INTEGER NOT NULL DEFAULT 0," +
        "entry_date TEXT NOT NULL," +
        "note TEXT," +
        "created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))" +
        ");";
      const createBookkeepingHistorySql =
        "CREATE TABLE IF NOT EXISTS bookkeeping_entry_history (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "entry_id INTEGER NOT NULL," +
        "change_amount INTEGER NOT NULL," +
        "type TEXT NOT NULL," +
        "note TEXT," +
        "previous_amount INTEGER," +
        "new_amount INTEGER," +
        "created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))," +
        "FOREIGN KEY(entry_id) REFERENCES bookkeeping_entries(id) ON DELETE CASCADE" +
        ");";
      const createCalculatorSql =
        "CREATE TABLE IF NOT EXISTS calculator_entries (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "item_name TEXT NOT NULL," +
        "base_price INTEGER NOT NULL DEFAULT 0," +
        "shipping_fee INTEGER NOT NULL DEFAULT 0," +
        "tax_fee INTEGER NOT NULL DEFAULT 0," +
        "other_fee INTEGER NOT NULL DEFAULT 0," +
        "total_price INTEGER NOT NULL DEFAULT 0," +
        "note TEXT," +
        "created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))" +
        ");";
      const createNotificationsSql =
        "CREATE TABLE IF NOT EXISTS notifications (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
        "title TEXT NOT NULL," +
        "message TEXT NOT NULL," +
        "category TEXT NOT NULL," +
        "is_read INTEGER NOT NULL DEFAULT 0," +
        "created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))" +
        ");";

      await db.execAsync(createItemsSql);
      await db.execAsync(createHistorySql);
      await db.execAsync(createPurchaseOrderSql);
      await db.execAsync(createPurchaseOrderItemsSql);
      await db.execAsync(createBookkeepingSql);
      await db.execAsync(createBookkeepingHistorySql);
      await db.execAsync(createCalculatorSql);
      await db.execAsync(createNotificationsSql);

      try {
        await db.execAsync("ALTER TABLE purchase_orders ADD COLUMN orderer_name TEXT");
      } catch (error) {
        // ignore if column already exists
      }
      try {
        await db.execAsync("ALTER TABLE purchase_orders ADD COLUMN close_po_date TEXT");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE purchase_orders ADD COLUMN estimated_ready_date TEXT");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE items ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE calculator_entries ADD COLUMN items_json TEXT");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE stock_history ADD COLUMN unit_price INTEGER");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE stock_history ADD COLUMN unit_cost INTEGER");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE stock_history ADD COLUMN profit_amount INTEGER NOT NULL DEFAULT 0");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE purchase_order_items ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("ALTER TABLE purchase_orders ADD COLUMN completed_at TEXT");
      } catch (error) {
        // column already exists
      }
      try {
        await db.execAsync("UPDATE purchase_orders SET status = 'PROGRESS' WHERE status = 'PENDING'");
        await db.execAsync("UPDATE purchase_orders SET status = 'DONE' WHERE status = 'RECEIVED'");
      } catch (error) {
        // ignore migration issues
      }
      try {
        await db.execAsync(
          "INSERT INTO purchase_order_items (order_id, name, quantity, price) " +
            "SELECT po.id, po.item_name, po.quantity, po.price " +
            "FROM purchase_orders po " +
            "WHERE po.id NOT IN (SELECT order_id FROM purchase_order_items)",
        );
      } catch (error) {
        // ignore migration issues
      }
      return db;
    })().catch(error => {
      initPromise = undefined;
      throw error;
    });
  }
  await initPromise;
  return db;
}

export async function initDb() {
  await ensureDbReady();
}

export async function exec(sql, params = []) {
  try {
    const db = await ensureDbReady();
    const query = typeof sql === "string" ? sql.trim() : "";
    if (!query) throw new Error("SQL query is empty");
    const statement = await db.prepareAsync(query);
    try {
      const execution = await statement.executeAsync(params);
      const rowsArray = await execution.getAllAsync();
      const result = {
        rows: {
          length: rowsArray.length,
          item: index => rowsArray[index],
          _array: rowsArray,
        },
        rowsAffected: execution.changes,
        insertId: execution.lastInsertRowId ?? null,
      };

      // Jalankan sinkronisasi Google Sheets di background (async)
      handleDatabaseChangeHook(query, params, result).catch(err => {
        console.log("GOOGLE SHEETS SYNC HOOK ERROR:", err);
      });

      return result;
    } finally {
      await statement.finalizeAsync();
    }
  } catch (error) {
    console.log("SQL ERROR:", error);
    throw error;
  }
}

// Hook untuk mendeteksi perubahan SQLite lokal dan mengirimkannya ke Google Sheets
async function handleDatabaseChangeHook(query, params, result) {
  const trimmed = query.trim().toUpperCase();
  // Hanya proses jika query melakukan modifikasi data (INSERT/UPDATE/DELETE)
  if (!trimmed.startsWith("INSERT") && !trimmed.startsWith("UPDATE") && !trimmed.startsWith("DELETE")) {
    return;
  }

  // Import dinamis untuk menghindari circular dependency
  const { syncLocalToGoogleSheets } = require("./googleSheets");

  // Query data baris SQLite secara aman tanpa memicu hook (menggunakan prepareAsync langsung)
  const queryRow = async (tableName, id) => {
    try {
      const db = await ensureDbReady();
      const statement = await db.prepareAsync(`SELECT * FROM ${tableName} WHERE id = ?`);
      try {
        const execResult = await statement.executeAsync([id]);
        const rows = await execResult.getAllAsync();
        return rows[0] || null;
      } finally {
        await statement.finalizeAsync();
      }
    } catch (e) {
      console.log(`Error querying row for sync: ${tableName} ID ${id}`, e);
      return null;
    }
  };

  // 1. DATA BARANG (ITEMS)
  if (trimmed.includes("INSERT INTO ITEMS")) {
    const id = result.insertId;
    if (id) {
      const row = await queryRow("items", id);
      if (row) await syncLocalToGoogleSheets("barang", "create", row);
    }
  } else if (trimmed.includes("UPDATE ITEMS")) {
    const id = params[params.length - 1];
    if (id) {
      const row = await queryRow("items", id);
      if (row) await syncLocalToGoogleSheets("barang", "update", row);
    }
  } else if (trimmed.includes("DELETE FROM ITEMS")) {
    const id = params[0];
    if (id) await syncLocalToGoogleSheets("barang", "delete", { id });
  }

  // 2. PURCHASE ORDERS (PO)
  else if (trimmed.includes("INSERT INTO PURCHASE_ORDERS")) {
    const id = result.insertId;
    if (id) {
      const row = await queryRow("purchase_orders", id);
      if (row) await syncLocalToGoogleSheets("po", "create", row);
    }
  } else if (trimmed.includes("UPDATE PURCHASE_ORDERS")) {
    const id = params[params.length - 1];
    if (id) {
      const row = await queryRow("purchase_orders", id);
      if (row) await syncLocalToGoogleSheets("po", "update", row);
    }
  } else if (trimmed.includes("DELETE FROM PURCHASE_ORDERS")) {
    const id = params[0];
    if (id) await syncLocalToGoogleSheets("po", "delete", { id });
  }

  // 3. KEUANGAN (BOOKKEEPING)
  else if (trimmed.includes("INSERT INTO BOOKKEEPING_ENTRIES")) {
    const id = result.insertId;
    if (id) {
      const row = await queryRow("bookkeeping_entries", id);
      if (row) await syncLocalToGoogleSheets("keuangan", "create", row);
    }
  } else if (trimmed.includes("UPDATE BOOKKEEPING_ENTRIES")) {
    const id = params[params.length - 1];
    if (id) {
      const row = await queryRow("bookkeeping_entries", id);
      if (row) await syncLocalToGoogleSheets("keuangan", "update", row);
    }
  } else if (trimmed.includes("DELETE FROM BOOKKEEPING_ENTRIES")) {
    const id = params[0];
    if (id) await syncLocalToGoogleSheets("keuangan", "delete", { id });
  }

  // 4. KALKULATOR BIAYA (CALCULATOR)
  else if (trimmed.includes("INSERT INTO CALCULATOR_ENTRIES")) {
    const id = result.insertId;
    if (id) {
      const row = await queryRow("calculator_entries", id);
      if (row) await syncLocalToGoogleSheets("kalkulator", "create", row);
    }
  } else if (trimmed.includes("UPDATE CALCULATOR_ENTRIES")) {
    const id = params[params.length - 1];
    if (id) {
      const row = await queryRow("calculator_entries", id);
      if (row) await syncLocalToGoogleSheets("kalkulator", "update", row);
    }
  } else if (trimmed.includes("DELETE FROM CALCULATOR_ENTRIES")) {
    const id = params[0];
    if (id) await syncLocalToGoogleSheets("kalkulator", "delete", { id });
  }
}
