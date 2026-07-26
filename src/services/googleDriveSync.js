import { exec } from "./database";
import { getStoredDriveToken, isDriveTokenValid, refreshDriveAccessToken } from "./googleDrive";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const SYNC_FILE_NAME = "gudang_app_sync.json";
const AUTO_SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 jam
const LAST_AUTO_SYNC_KEY = "google_drive_last_auto_sync";

function getClientId() {
  const expoExtra = Constants?.expoConfig?.extra ?? {};
  const legacyExtra = Constants?.manifest?.extra ?? {};
  const extraClients = expoExtra.googleClientIds || legacyExtra.googleClientIds || {};
  return (
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ||
    extraClients.android ||
    "82888828682-bv5i05acv3emgv6fs4sig8dta4n4m4of.apps.googleusercontent.com"
  );
}

const TABLE_LIST = [
  "master_orderers",
  "master_po_items",
  "master_marketers",
  "items",
  "purchase_orders",
  "purchase_order_items",
  "bookkeeping_entries",
  "bookkeeping_entry_history",
  "stock_history",
  "calculator_entries",
  "notifications",
];

const TABLE_SCHEMAS = {
  master_orderers: ["id", "name", "phone", "address", "note", "created_at", "updated_at", "deleted_at"],
  master_po_items: ["id", "name", "category", "default_price", "default_cost_price", "note", "created_at", "updated_at", "deleted_at"],
  master_marketers: ["id", "name", "phone", "address", "default_fee", "note", "created_at", "updated_at", "deleted_at"],
  items: ["id", "name", "category", "price", "cost_price", "stock", "size", "updated_at", "deleted_at"],
  purchase_orders: ["id", "supplier_name", "item_name", "quantity", "price", "order_date", "status", "note", "close_po_date", "estimated_ready_date", "created_at", "orderer_name", "marketer_name", "marketer_fee", "completed_at", "updated_at", "deleted_at"],
  purchase_order_items: ["id", "order_id", "name", "quantity", "price", "cost_price", "updated_at", "deleted_at"],
  bookkeeping_entries: ["id", "name", "amount", "entry_date", "note", "created_at", "updated_at", "deleted_at"],
  bookkeeping_entry_history: ["id", "entry_id", "change_amount", "type", "note", "previous_amount", "new_amount", "created_at", "updated_at", "deleted_at"],
  stock_history: ["id", "item_id", "type", "qty", "note", "created_at", "unit_price", "unit_cost", "profit_amount", "updated_at", "deleted_at"],
  calculator_entries: ["id", "item_name", "base_price", "shipping_fee", "tax_fee", "other_fee", "total_price", "note", "items_json", "created_at", "updated_at", "deleted_at"],
  notifications: ["id", "title", "message", "category", "is_read", "created_at", "updated_at", "deleted_at"],
};

// Ambil valid access token
async function getValidAccessToken() {
  const token = await getStoredDriveToken();
  if (!token || !token.accessToken) return null;
  if (isDriveTokenValid(token)) return token.accessToken;

  const clientId = getClientId();
  if (token.refreshToken && clientId) {
    try {
      const refreshed = await refreshDriveAccessToken({ clientId, refreshToken: token.refreshToken });
      if (refreshed?.accessToken) {
        return refreshed.accessToken;
      }
    } catch (e) {
      console.log("SYNC TOKEN REFRESH ERROR:", e);
      if (e?.isInvalidGrant) {
        await clearDriveToken();
        return null;
      }
    }
  }

  // Gunakan token.accessToken yang ada, biarkan panggilan API menguji validitasnya
  return token.accessToken;
}

// Cari ID file gudang_app_sync.json di Drive
async function findSyncFileId(accessToken) {
  const q = encodeURIComponent(`name = '${SYNC_FILE_NAME}' and trashed = false`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) {
    const err = new Error("401 Unauthorized");
    err.status = 401;
    throw err;
  }
  if (!response.ok) return null;
  const json = await response.json();
  if (json.files && json.files.length > 0) {
    return json.files[0].id;
  }
  return null;
}

// Download isi file sync dari Drive
async function downloadRemoteSyncData(accessToken, fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) {
    const err = new Error("401 Unauthorized");
    err.status = 401;
    throw err;
  }
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch (e) {
    return null;
  }
}

// Upload atau update data sync ke Drive
async function uploadSyncDataToDrive(accessToken, fileId, payload) {
  const jsonContent = JSON.stringify(payload, null, 2);
  const boundary = `sync_bound_${Math.random().toString(36).slice(2)}`;
  const metadata = { name: SYNC_FILE_NAME, mimeType: "application/json" };
  const bodyParts = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    jsonContent,
    `--${boundary}--`,
    "",
  ];
  const body = bodyParts.join("\r\n");

  let url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  let method = "POST";
  if (fileId) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
    method = "PATCH";
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (response.status === 401) {
    const err = new Error("401 Unauthorized");
    err.status = 401;
    throw err;
  }

  if (!response.ok) {
    throw new Error("Gagal mengunggah data sync ke Google Drive.");
  }
  return await response.json();
}

// Ambil semua data lokal SQLite
async function getLocalTablesData() {
  const localData = {};
  for (const table of TABLE_LIST) {
    const cols = TABLE_SCHEMAS[table];
    if (!cols) continue;
    const res = await exec(`SELECT * FROM ${table}`);
    const rows = [];
    for (let i = 0; i < res.rows.length; i++) {
      rows.push(res.rows.item(i));
    }
    localData[table] = rows;
  }
  return localData;
}

// Algoritma 2-Way Merge (Last-Write-Wins per-row)
function mergeTables(localData, remoteData) {
  const mergedTables = {};

  for (const table of TABLE_LIST) {
    const localRows = localData[table] || [];
    const remoteRows = remoteData?.tables?.[table] || [];
    const cols = TABLE_SCHEMAS[table];
    if (!cols) continue;

    const map = new Map();

    // Tambahkan baris lokal ke map
    for (const row of localRows) {
      if (row && row.id !== undefined && row.id !== null) {
        map.set(String(row.id), { ...row });
      }
    }

    // Gabungkan dengan baris remote
    for (const remoteRow of remoteRows) {
      if (!remoteRow || remoteRow.id === undefined || remoteRow.id === null) continue;
      const key = String(remoteRow.id);
      const existing = map.get(key);

      if (!existing) {
        map.set(key, { ...remoteRow });
      } else {
        // Bandingkan updated_at
        const localTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
        const remoteTime = remoteRow.updated_at ? new Date(remoteRow.updated_at).getTime() : 0;

        if (remoteTime > localTime) {
          map.set(key, { ...remoteRow });
        }
      }
    }

    mergedTables[table] = Array.from(map.values());
  }

  return mergedTables;
}

// Tulis data merged ke SQLite lokal
async function applyMergedDataToLocalDb(mergedTables) {
  await exec("BEGIN TRANSACTION");
  try {
    for (const table of TABLE_LIST) {
      const rows = mergedTables[table] || [];
      const cols = TABLE_SCHEMAS[table];
      if (!cols) continue;

      const columnSql = cols.map(c => `"${c}"`).join(", ");
      const placeholders = cols.map(() => "?").join(", ");
      const insertSql = `INSERT OR REPLACE INTO ${table} (${columnSql}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = cols.map(col => (row[col] !== undefined ? row[col] : null));
        await exec(insertSql, values);
      }
    }
    await exec("COMMIT");
  } catch (err) {
    await exec("ROLLBACK");
    throw err;
  }
}

// Fungsi utama 2-Way Sync
export async function performGoogleDriveSync() {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("Sesi Google Drive telah berakhir atau belum terhubung. Silakan login ulang.");
  }

  try {
    const fileId = await findSyncFileId(accessToken);
    let remotePayload = null;
    if (fileId) {
      remotePayload = await downloadRemoteSyncData(accessToken, fileId);
    }

    const localTables = await getLocalTablesData();
    const mergedTables = mergeTables(localTables, remotePayload);

    // Tulis ke lokal
    await applyMergedDataToLocalDb(mergedTables);

    // Upload kembali hasil gabungan ke Drive
    const newPayload = {
      version: 1,
      syncedAt: new Date().toISOString(),
      tables: mergedTables,
    };
    await uploadSyncDataToDrive(accessToken, fileId, newPayload);
    try {
      await SecureStore.setItemAsync(LAST_AUTO_SYNC_KEY, String(Date.now()));
    } catch (e) {}

    return { success: true, syncedAt: newPayload.syncedAt };
  } catch (err) {
    if (err?.status === 401 || err?.message?.includes("401")) {
      await clearDriveToken();
      throw new Error("Sesi Google Drive telah berakhir. Silakan login ulang.");
    }
    throw err;
  }
}

// Otomatisasi 2-Way Sync per 6 Jam
export async function checkAndAutoSync() {
  try {
    const token = await getStoredDriveToken();
    if (!token) return; // Skip jika belum terhubung / login

    const lastSyncRaw = await SecureStore.getItemAsync(LAST_AUTO_SYNC_KEY);
    const now = Date.now();
    if (lastSyncRaw) {
      const lastSyncTime = parseInt(lastSyncRaw, 10);
      if (now - lastSyncTime < AUTO_SYNC_INTERVAL) {
        return; // Belum 6 jam, skip
      }
    }

    console.log("AUTOMATIC 6-HOUR SYNC: Executing...");
    const res = await performGoogleDriveSync();
    if (res?.success) {
      console.log("AUTOMATIC 6-HOUR SYNC: Successfully synced at", res.syncedAt);
    }
  } catch (err) {
    console.log("AUTOMATIC 6-HOUR SYNC FAILED:", err?.message || err);
  }
}
