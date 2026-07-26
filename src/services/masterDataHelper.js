import { exec } from "./database";

// Pastikan Pemesan tersimpan ke master_orderers jika belum ada
export async function ensureMasterOrdererExists(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  try {
    const res = await exec("SELECT id FROM master_orderers WHERE LOWER(name) = LOWER(?)", [trimmed]);
    if (res.rows.length === 0) {
      const nowIso = new Date().toISOString();
      await exec(
        "INSERT INTO master_orderers (name, created_at, updated_at) VALUES (?, ?, ?)",
        [trimmed, nowIso, nowIso]
      );
    }
  } catch (e) {
    console.log("ENSURE MASTER ORDERER ERROR:", e);
  }
}

// Pastikan Barang PO tersimpan ke master_po_items jika belum ada
export async function ensureMasterPoItemExists(name, price = 0, costPrice = 0) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  try {
    const res = await exec("SELECT id FROM master_po_items WHERE LOWER(name) = LOWER(?)", [trimmed]);
    if (res.rows.length === 0) {
      const nowIso = new Date().toISOString();
      await exec(
        "INSERT INTO master_po_items (name, default_price, default_cost_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [trimmed, price || 0, costPrice || 0, nowIso, nowIso]
      );
    }
  } catch (e) {
    console.log("ENSURE MASTER PO ITEM ERROR:", e);
  }
}

// Pastikan Marketer tersimpan ke master_marketers jika belum ada
export async function ensureMasterMarketerExists(name, defaultFee = 0) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  try {
    const res = await exec("SELECT id FROM master_marketers WHERE LOWER(name) = LOWER(?)", [trimmed]);
    if (res.rows.length === 0) {
      const nowIso = new Date().toISOString();
      await exec(
        "INSERT INTO master_marketers (name, default_fee, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [trimmed, defaultFee || 0, nowIso, nowIso]
      );
    }
  } catch (e) {
    console.log("ENSURE MASTER MARKETER ERROR:", e);
  }
}

// Ambil saran autocomplete untuk Pemesan, Barang PO, & Marketer
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
