import { exec, generateUniqueNumericId } from "../services/database";

export async function getBookkeepingEntries({ search = "", limit = 20, offset = 0 } = {}) {
  const normalized = (search || "").trim().toLowerCase();
  const sql = `
    SELECT id, name, amount, entry_date, note, created_at, updated_at
    FROM bookkeeping_entries
    WHERE (deleted_at IS NULL OR deleted_at = '')
      AND (? = '' OR LOWER(name) LIKE ? OR LOWER(IFNULL(note,'')) LIKE ?)
    ORDER BY entry_date DESC, id DESC
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

export async function getBookkeepingSummary() {
  const sql = `
    SELECT
      COUNT(*) as totalEntries,
      IFNULL(SUM(amount), 0) as totalBalance
    FROM bookkeeping_entries
    WHERE (deleted_at IS NULL OR deleted_at = '')
  `;
  const res = await exec(sql);
  if (res.rows.length === 0) return { totalEntries: 0, totalBalance: 0 };
  const row = res.rows.item(0);
  return {
    totalEntries: Number(row.totalEntries) || 0,
    totalBalance: Number(row.totalBalance) || 0,
  };
}

export async function getBookkeepingById(id) {
  const entrySql = `
    SELECT id, name, amount, entry_date, note, created_at, updated_at
    FROM bookkeeping_entries
    WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')
  `;
  const entryRes = await exec(entrySql, [id]);
  if (entryRes.rows.length === 0) return null;
  const entry = entryRes.rows.item(0);

  const historySql = `
    SELECT id, entry_id, change_amount, type, note, previous_amount, new_amount, created_at
    FROM bookkeeping_entry_history
    WHERE entry_id = ? AND (deleted_at IS NULL OR deleted_at = '')
    ORDER BY id DESC
  `;
  const historyRes = await exec(historySql, [id]);
  const history = [];
  for (let i = 0; i < historyRes.rows.length; i++) {
    history.push(historyRes.rows.item(i));
  }

  return { ...entry, history };
}

export async function createBookkeepingEntry({ name, amount = 0, entryDate, note = "" }) {
  const id = generateUniqueNumericId();
  const nowIso = new Date().toISOString();
  const sql = `
    INSERT INTO bookkeeping_entries (id, name, amount, entry_date, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), ?)
  `;
  await exec(sql, [
    id,
    name.trim(),
    amount,
    entryDate,
    note ? note.trim() : null,
    nowIso,
  ]);
  return id;
}

export async function updateBookkeepingEntry(id, { name, entryDate, note }) {
  const nowIso = new Date().toISOString();
  const sql = `
    UPDATE bookkeeping_entries
    SET name = ?, entry_date = ?, note = ?, updated_at = ?
    WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')
  `;
  await exec(sql, [name.trim(), entryDate, note ? note.trim() : null, nowIso, id]);
}

export async function adjustBookkeepingAmount({
  entryId,
  type, // "IN" | "OUT"
  changeAmount,
  note = "",
  previousAmount,
}) {
  const historyId = generateUniqueNumericId();
  const nowIso = new Date().toISOString();
  const delta = type === "IN" ? changeAmount : -changeAmount;
  const newAmount = previousAmount + delta;

  // 1. Simpan riwayat perubahan
  await exec(
    `INSERT INTO bookkeeping_entry_history (
      id, entry_id, change_amount, type, note, previous_amount, new_amount, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)`,
    [
      historyId,
      entryId,
      changeAmount,
      type,
      note ? note.trim() : null,
      previousAmount,
      newAmount,
      nowIso,
    ]
  );

  // 2. Perbarui jumlah di tabel utama
  await exec(
    `UPDATE bookkeeping_entries SET amount = ?, updated_at = ? WHERE id = ?`,
    [newAmount, nowIso, entryId]
  );

  return { newAmount, historyId };
}

export async function softDeleteBookkeepingEntry(id) {
  const nowIso = new Date().toISOString();
  await exec(
    `UPDATE bookkeeping_entries SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    [nowIso, nowIso, id]
  );
  await exec(
    `UPDATE bookkeeping_entry_history SET deleted_at = ?, updated_at = ? WHERE entry_id = ?`,
    [nowIso, nowIso, id]
  );
}

export async function getBookkeepingReportData(startDate, endDate) {
  const sql = `
    SELECT
      b.id,
      b.name,
      b.amount,
      b.entry_date,
      IFNULL(b.note, '') as note,
      b.created_at,
      h.id as history_id,
      h.change_amount,
      h.type as change_type,
      IFNULL(h.note, '') as change_note,
      h.created_at as change_date
    FROM bookkeeping_entries b
    LEFT JOIN bookkeeping_entry_history h ON h.entry_id = b.id AND (h.deleted_at IS NULL OR h.deleted_at = '')
    WHERE (b.deleted_at IS NULL OR b.deleted_at = '')
      AND DATE(b.entry_date) BETWEEN ? AND ?
    ORDER BY b.entry_date DESC, b.id DESC
  `;
  const res = await exec(sql, [startDate, endDate]);
  const rows = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}
