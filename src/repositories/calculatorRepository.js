import { exec, generateUniqueNumericId } from "../services/database";

export async function getCalculatorEntries({ search = "", limit = 20, offset = 0 } = {}) {
  const normalized = (search || "").trim().toLowerCase();
  const sql = `
    SELECT *
    FROM calculator_entries
    WHERE (deleted_at IS NULL OR deleted_at = '')
      AND (? = '' OR LOWER(item_name) LIKE ? OR LOWER(IFNULL(note,'')) LIKE ?)
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

export async function createCalculatorEntry({
  itemName,
  basePrice = 0,
  shippingFee = 0,
  taxFee = 0,
  otherFee = 0,
  totalPrice = 0,
  note = "",
  itemsJson = "[]",
}) {
  const id = generateUniqueNumericId();
  const nowIso = new Date().toISOString();
  const sql = `
    INSERT INTO calculator_entries (
      id, item_name, base_price, shipping_fee, tax_fee, other_fee,
      total_price, note, items_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
  `;
  await exec(sql, [
    id,
    itemName.trim(),
    basePrice,
    shippingFee,
    taxFee,
    otherFee,
    totalPrice,
    note ? note.trim() : null,
    itemsJson,
    nowIso,
  ]);
  return id;
}

export async function updateCalculatorEntry(id, {
  itemName,
  basePrice = 0,
  shippingFee = 0,
  taxFee = 0,
  otherFee = 0,
  totalPrice = 0,
  note = "",
  itemsJson = "[]",
}) {
  const nowIso = new Date().toISOString();
  const sql = `
    UPDATE calculator_entries
    SET
      item_name = ?,
      base_price = ?,
      shipping_fee = ?,
      tax_fee = ?,
      other_fee = ?,
      total_price = ?,
      note = ?,
      items_json = ?,
      updated_at = ?
    WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')
  `;
  await exec(sql, [
    itemName.trim(),
    basePrice,
    shippingFee,
    taxFee,
    otherFee,
    totalPrice,
    note ? note.trim() : null,
    itemsJson,
    nowIso,
    id,
  ]);
}

export async function softDeleteCalculatorEntry(id) {
  const nowIso = new Date().toISOString();
  await exec(
    `UPDATE calculator_entries SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    [nowIso, nowIso, id]
  );
}
