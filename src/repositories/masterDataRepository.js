import { exec, generateUniqueNumericId } from "../services/database";

// ORDERERS
export async function getMasterOrderers(search = "") {
  const normalized = (search || "").trim().toLowerCase();
  const sql = normalized
    ? `SELECT * FROM master_orderers WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(IFNULL(phone,'')) LIKE ?) ORDER BY name ASC`
    : `SELECT * FROM master_orderers WHERE deleted_at IS NULL ORDER BY name ASC`;
  const params = normalized ? [`%${normalized}%`, `%${normalized}%`] : [];
  const res = await exec(sql, params);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
  return rows;
}

export async function createMasterOrderer({ name, phone = "", address = "", note = "" }) {
  const id = generateUniqueNumericId();
  const nowIso = new Date().toISOString();
  await exec(
    `INSERT INTO master_orderers (id, name, phone, address, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, name.trim(), phone?.trim() || null, address?.trim() || null, note?.trim() || null, nowIso, nowIso]
  );
  return id;
}

export async function updateMasterOrderer(id, { name, phone = "", address = "", note = "" }) {
  const nowIso = new Date().toISOString();
  await exec(
    `UPDATE master_orderers SET name = ?, phone = ?, address = ?, note = ?, updated_at = ? WHERE id = ?`,
    [name.trim(), phone?.trim() || null, address?.trim() || null, note?.trim() || null, nowIso, id]
  );
}

export async function softDeleteMasterOrderer(id) {
  const nowIso = new Date().toISOString();
  await exec(`UPDATE master_orderers SET deleted_at = ?, updated_at = ? WHERE id = ?`, [nowIso, nowIso, id]);
}

// PO ITEMS
export async function getMasterPoItems(search = "") {
  const normalized = (search || "").trim().toLowerCase();
  const sql = normalized
    ? `SELECT * FROM master_po_items WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(IFNULL(category,'')) LIKE ?) ORDER BY name ASC`
    : `SELECT * FROM master_po_items WHERE deleted_at IS NULL ORDER BY name ASC`;
  const params = normalized ? [`%${normalized}%`, `%${normalized}%`] : [];
  const res = await exec(sql, params);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
  return rows;
}

export async function createMasterPoItem({ name, category = "", defaultPrice = 0, defaultCostPrice = 0, note = "" }) {
  const id = generateUniqueNumericId();
  const nowIso = new Date().toISOString();
  await exec(
    `INSERT INTO master_po_items (id, name, category, default_price, default_cost_price, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name.trim(), category?.trim() || null, defaultPrice || 0, defaultCostPrice || 0, note?.trim() || null, nowIso, nowIso]
  );
  return id;
}

export async function updateMasterPoItem(id, { name, category = "", defaultPrice = 0, defaultCostPrice = 0, note = "" }) {
  const nowIso = new Date().toISOString();
  await exec(
    `UPDATE master_po_items SET name = ?, category = ?, default_price = ?, default_cost_price = ?, note = ?, updated_at = ? WHERE id = ?`,
    [name.trim(), category?.trim() || null, defaultPrice || 0, defaultCostPrice || 0, note?.trim() || null, nowIso, id]
  );
}

export async function softDeleteMasterPoItem(id) {
  const nowIso = new Date().toISOString();
  await exec(`UPDATE master_po_items SET deleted_at = ?, updated_at = ? WHERE id = ?`, [nowIso, nowIso, id]);
}

// MARKETERS
export async function getMasterMarketers(search = "") {
  const normalized = (search || "").trim().toLowerCase();
  const sql = normalized
    ? `SELECT * FROM master_marketers WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(IFNULL(phone,'')) LIKE ?) ORDER BY name ASC`
    : `SELECT * FROM master_marketers WHERE deleted_at IS NULL ORDER BY name ASC`;
  const params = normalized ? [`%${normalized}%`, `%${normalized}%`] : [];
  const res = await exec(sql, params);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
  return rows;
}

export async function createMasterMarketer({ name, phone = "", address = "", defaultFee = 0, note = "" }) {
  const id = generateUniqueNumericId();
  const nowIso = new Date().toISOString();
  await exec(
    `INSERT INTO master_marketers (id, name, phone, address, default_fee, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name.trim(), phone?.trim() || null, address?.trim() || null, defaultFee || 0, note?.trim() || null, nowIso, nowIso]
  );
  return id;
}

export async function updateMasterMarketer(id, { name, phone = "", address = "", defaultFee = 0, note = "" }) {
  const nowIso = new Date().toISOString();
  await exec(
    `UPDATE master_marketers SET name = ?, phone = ?, address = ?, default_fee = ?, note = ?, updated_at = ? WHERE id = ?`,
    [name.trim(), phone?.trim() || null, address?.trim() || null, defaultFee || 0, note?.trim() || null, nowIso, id]
  );
}

export async function softDeleteMasterMarketer(id) {
  const nowIso = new Date().toISOString();
  await exec(`UPDATE master_marketers SET deleted_at = ?, updated_at = ? WHERE id = ?`, [nowIso, nowIso, id]);
}

// AUTOCOMPLETE & AUTO-RECORDING HELPERS (With resurrection fix)
export async function ensureMasterOrdererExists(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  try {
    const res = await exec("SELECT id, deleted_at FROM master_orderers WHERE LOWER(name) = LOWER(?)", [trimmed]);
    const nowIso = new Date().toISOString();
    if (res.rows.length === 0) {
      const newId = generateUniqueNumericId();
      await exec(
        "INSERT INTO master_orderers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [newId, trimmed, nowIso, nowIso]
      );
    } else if (res.rows.item(0).deleted_at) {
      // Restore if was deleted
      await exec("UPDATE master_orderers SET deleted_at = NULL, updated_at = ? WHERE id = ?", [nowIso, res.rows.item(0).id]);
    }
  } catch (e) {
    console.log("ENSURE MASTER ORDERER ERROR:", e);
  }
}

export async function ensureMasterPoItemExists(name, price = 0, costPrice = 0) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  try {
    const res = await exec("SELECT id, deleted_at FROM master_po_items WHERE LOWER(name) = LOWER(?)", [trimmed]);
    const nowIso = new Date().toISOString();
    if (res.rows.length === 0) {
      const newId = generateUniqueNumericId();
      await exec(
        "INSERT INTO master_po_items (id, name, default_price, default_cost_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [newId, trimmed, price || 0, costPrice || 0, nowIso, nowIso]
      );
    } else if (res.rows.item(0).deleted_at) {
      // Restore if was deleted
      await exec("UPDATE master_po_items SET deleted_at = NULL, default_price = ?, default_cost_price = ?, updated_at = ? WHERE id = ?", [price || 0, costPrice || 0, nowIso, res.rows.item(0).id]);
    }
  } catch (e) {
    console.log("ENSURE MASTER PO ITEM ERROR:", e);
  }
}

export async function ensureMasterMarketerExists(name, defaultFee = 0) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  try {
    const res = await exec("SELECT id, deleted_at FROM master_marketers WHERE LOWER(name) = LOWER(?)", [trimmed]);
    const nowIso = new Date().toISOString();
    if (res.rows.length === 0) {
      const newId = generateUniqueNumericId();
      await exec(
        "INSERT INTO master_marketers (id, name, default_fee, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [newId, trimmed, defaultFee || 0, nowIso, nowIso]
      );
    } else if (res.rows.item(0).deleted_at) {
      // Restore if was deleted
      await exec("UPDATE master_marketers SET deleted_at = NULL, default_fee = ?, updated_at = ? WHERE id = ?", [defaultFee || 0, nowIso, res.rows.item(0).id]);
    }
  } catch (e) {
    console.log("ENSURE MASTER MARKETER ERROR:", e);
  }
}

export async function getMasterSuggestions() {
  try {
    const orderersRes = await exec("SELECT name FROM master_orderers WHERE deleted_at IS NULL ORDER BY name ASC");
    const itemsRes = await exec("SELECT name, default_price, default_cost_price FROM master_po_items WHERE deleted_at IS NULL ORDER BY name ASC");
    const marketersRes = await exec("SELECT name, default_fee FROM master_marketers WHERE deleted_at IS NULL ORDER BY name ASC");

    const orderers = [];
    for (let i = 0; i < orderersRes.rows.length; i++) {
      orderers.push(orderersRes.rows.item(i).name);
    }

    const items = [];
    for (let i = 0; i < itemsRes.rows.length; i++) {
      items.push(itemsRes.rows.item(i));
    }

    const marketers = [];
    for (let i = 0; i < marketersRes.rows.length; i++) {
      marketers.push(marketersRes.rows.item(i));
    }

    return { orderers, items, marketers };
  } catch (e) {
    console.log("GET MASTER SUGGESTIONS ERROR:", e);
    return { orderers: [], items: [], marketers: [] };
  }
}
