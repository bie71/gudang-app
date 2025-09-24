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
      await db.execAsync(createItemsSql);
      await db.execAsync(createHistorySql);
      await db.execAsync(createPurchaseOrderSql);
      await db.execAsync(createPurchaseOrderItemsSql);
      await db.execAsync(createBookkeepingSql);
      try {
        await db.execAsync("ALTER TABLE purchase_orders ADD COLUMN orderer_name TEXT");
      } catch (error) {
        // ignore if column already exists
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
      return {
        rows: {
          length: rowsArray.length,
          item: index => rowsArray[index],
          _array: rowsArray,
        },
        rowsAffected: execution.changes,
        insertId: execution.lastInsertRowId ?? null,
      };
    } finally {
      await statement.finalizeAsync();
    }
  } catch (error) {
    console.log("SQL ERROR:", error);
    throw error;
  }
}
