import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { getStoredDriveToken, isDriveTokenValid, refreshDriveAccessToken, clearDriveToken } from "./googleDrive";

const SPREADSHEET_ID_KEY = "google_sheets_spreadsheet_id";
const SHEET_NAME_KEY = "google_sheets_sheet_name";

function getClientId() {
  const expoExtra = Constants?.expoConfig?.extra ?? {};
  const legacyExtra = Constants?.manifest?.extra ?? {};
  const extraClients = expoExtra.googleClientIds || legacyExtra.googleClientIds || {};
  return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || extraClients.android || "82888828682-bv5i05acv3emgv6fs4sig8dta4n4m4of.apps.googleusercontent.com";
}

async function handleSheetsResponseError(response, actionLabel) {
  const errorText = await response.text();
  let detailMessage = errorText;
  try {
    const json = JSON.parse(errorText);
    if (json?.error?.message) {
      detailMessage = json.error.message;
    }
  } catch (e) {
    // data is not JSON
  }

  if (response.status === 403) {
    throw new Error(
      `Akses Ditolak (403): ${detailMessage}\n\nSolusi:\n1. Keluar & Login Ulang Google di menu Manajemen Data agar scope baru (Sheets) aktif.\n2. Pastikan Google Sheets API telah diaktifkan di Google Cloud Console untuk project Client ID ini.\n3. Pastikan akun Google Anda memiliki akses ke spreadsheet tersebut.`
    );
  }

  throw new Error(`Gagal ${actionLabel} (${response.status}): ${detailMessage}`);
}

export async function getSheetsAccessToken() {
  let token = await getStoredDriveToken();
  if (!token) {
    throw new Error("Silakan hubungkan akun Google Anda terlebih dahulu di menu Manajemen Data.");
  }
  
  if (!isDriveTokenValid(token)) {
    if (token.refreshToken) {
      const clientId = getClientId();
      try {
        token = await refreshDriveAccessToken({ clientId, refreshToken: token.refreshToken });
      } catch (error) {
        console.log("GOOGLE SHEETS REFRESH ACCESS TOKEN ERROR:", error);
        await clearDriveToken();
        throw new Error("Sesi login Google Anda telah berakhir. Silakan login kembali di menu Manajemen Data.");
      }
    } else {
      await clearDriveToken();
      throw new Error("Sesi login Google Anda telah berakhir. Silakan login kembali di menu Manajemen Data.");
    }
  }
  
  return token.accessToken;
}

export async function getStoredSheetConfig() {
  try {
    const spreadsheetId = await SecureStore.getItemAsync(SPREADSHEET_ID_KEY);
    const sheetName = await SecureStore.getItemAsync(SHEET_NAME_KEY);
    return {
      spreadsheetId: spreadsheetId || "",
      sheetName: sheetName || "Sheet1",
    };
  } catch (error) {
    console.log("READ SHEET CONFIG ERROR:", error);
    return { spreadsheetId: "", sheetName: "Sheet1" };
  }
}

export async function saveSheetConfig(spreadsheetId, sheetName) {
  try {
    await SecureStore.setItemAsync(SPREADSHEET_ID_KEY, spreadsheetId || "");
    await SecureStore.setItemAsync(SHEET_NAME_KEY, sheetName || "Sheet1");
    return true;
  } catch (error) {
    console.log("SAVE SHEET CONFIG ERROR:", error);
    return false;
  }
}

// Mengambil metadata sheet di dalam Spreadsheet (untuk mendapatkan sheetId numerik berdasarkan nama sheet)
export async function getSheetProperties(spreadsheetId) {
  const token = await getSheetsAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    await handleSheetsResponseError(response, "mengambil metadata Spreadsheet");
  }

  const data = await response.json();
  return data.sheets || [];
}

// Mengambil data baris & kolom dari Google Sheet
export async function getSheetValues(spreadsheetId, sheetName) {
  const token = await getSheetsAccessToken();
  // Mengambil kolom A-Z untuk semua baris yang terisi
  const range = `${sheetName}!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    await handleSheetsResponseError(response, "mengambil data Sheet");
  }

  const data = await response.json();
  return data.values || [];
}

// Menambahkan baris baru (Create)
export async function appendSheetRow(spreadsheetId, sheetName, rowValues) {
  const token = await getSheetsAccessToken();
  const range = `${sheetName}!A:A`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [rowValues],
    }),
  });

  if (!response.ok) {
    await handleSheetsResponseError(response, "menambahkan baris baru ke Sheet");
  }

  return await response.json();
}

// Mengubah baris yang ada (Update)
// rowIndex adalah 1-based index (misal: baris 1 adalah header, baris 2 adalah baris data pertama)
export async function updateSheetRow(spreadsheetId, sheetName, rowIndex, rowValues) {
  const token = await getSheetsAccessToken();
  const range = `${sheetName}!A${rowIndex}:Z${rowIndex}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [rowValues],
    }),
  });

  if (!response.ok) {
    await handleSheetsResponseError(response, "mengubah data baris di Sheet");
  }

  return await response.json();
}

// Menghapus baris (Delete)
// Untuk menghapus baris secara fisik (bukan hanya clear), kita mengirim request deleteDimension batchUpdate
// rowIndexZeroBased adalah index baris 0-based
export async function deleteSheetRow(spreadsheetId, sheetName, rowIndexZeroBased) {
  const token = await getSheetsAccessToken();
  const sheets = await getSheetProperties(spreadsheetId);
  const sheet = sheets.find(s => s.properties.title.toLowerCase() === sheetName.toLowerCase());
  
  if (!sheet) {
    throw new Error(`Sheet dengan nama "${sheetName}" tidak ditemukan.`);
  }

  const sheetId = sheet.properties.sheetId;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: "ROWS",
              startIndex: rowIndexZeroBased,
              endIndex: rowIndexZeroBased + 1,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    await handleSheetsResponseError(response, "menghapus baris data di Sheet");
  }

  return await response.json();
}

// Membuat spreadsheet baru otomatis dengan 4 sheet (tab) untuk masing-masing fitur
export async function createAutoSpreadsheet() {
  const token = await getSheetsAccessToken();
  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  const body = {
    properties: {
      title: "BukuToko - Sinkronisasi Data",
    },
    sheets: [
      {
        properties: { title: "Barang" },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: "ID" } },
                  { userEnteredValue: { stringValue: "Nama Barang" } },
                  { userEnteredValue: { stringValue: "Kategori" } },
                  { userEnteredValue: { stringValue: "Harga Jual" } },
                  { userEnteredValue: { stringValue: "Harga Modal" } },
                  { userEnteredValue: { stringValue: "Stok" } },
                ],
              },
            ],
          },
        ],
      },
      {
        properties: { title: "PO" },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: "ID" } },
                  { userEnteredValue: { stringValue: "Nama Supplier" } },
                  { userEnteredValue: { stringValue: "Nama Barang" } },
                  { userEnteredValue: { stringValue: "Jumlah" } },
                  { userEnteredValue: { stringValue: "Harga" } },
                  { userEnteredValue: { stringValue: "Tanggal" } },
                  { userEnteredValue: { stringValue: "Status" } },
                  { userEnteredValue: { stringValue: "Catatan" } },
                  { userEnteredValue: { stringValue: "Tanggal Close PO" } },
                  { userEnteredValue: { stringValue: "Estimasi Ready" } },
                ],
              },
            ],
          },
        ],
      },
      {
        properties: { title: "Keuangan" },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: "ID" } },
                  { userEnteredValue: { stringValue: "Nama Transaksi" } },
                  { userEnteredValue: { stringValue: "Jumlah" } },
                  { userEnteredValue: { stringValue: "Tanggal" } },
                  { userEnteredValue: { stringValue: "Catatan" } },
                ],
              },
            ],
          },
        ],
      },
      {
        properties: { title: "Kalkulator" },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [
              {
                values: [
                  { userEnteredValue: { stringValue: "ID" } },
                  { userEnteredValue: { stringValue: "Nama Barang" } },
                  { userEnteredValue: { stringValue: "Harga Dasar" } },
                  { userEnteredValue: { stringValue: "Biaya Ongkir" } },
                  { userEnteredValue: { stringValue: "Biaya Pajak" } },
                  { userEnteredValue: { stringValue: "Biaya Lain" } },
                  { userEnteredValue: { stringValue: "Total Harga" } },
                  { userEnteredValue: { stringValue: "Catatan" } },
                  { userEnteredValue: { stringValue: "Tanggal" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleSheetsResponseError(response, "membuat Spreadsheet baru");
  }

  const data = await response.json();
  const newSpreadsheetId = data.spreadsheetId;
  
  // Simpan konfigurasi otomatis ke SecureStore (default ke tab "Barang")
  await saveSheetConfig(newSpreadsheetId, "Barang");
  return {
    spreadsheetId: newSpreadsheetId,
    sheetName: "Barang",
  };
}

// Melakukan sinkronisasi background dari operasi CRUD SQLite lokal ke Google Sheets
export async function syncLocalToGoogleSheets(moduleName, action, data) {
  try {
    // Pastikan akun Google terhubung
    const token = await getStoredDriveToken();
    if (!token || (!token.accessToken && !token.refreshToken)) {
      console.log("SHEETS SYNC: Akun Google belum terhubung, melewati sinkronisasi.");
      return;
    }

    let config = await getStoredSheetConfig();
    // Jika ID spreadsheet belum dibuat/diset, buat secara otomatis!
    if (!config.spreadsheetId) {
      console.log("SHEETS SYNC: Spreadsheet belum diset, membuat otomatis di Google Drive...");
      try {
        const newSheet = await createAutoSpreadsheet();
        config = { spreadsheetId: newSheet.spreadsheetId, sheetName: newSheet.sheetName };
      } catch (createError) {
        console.log("SHEETS SYNC: Gagal membuat spreadsheet otomatis:", createError);
        return;
      }
    }

    const sheetName = 
      moduleName === "barang" ? "Barang" :
      moduleName === "po" ? "PO" :
      moduleName === "keuangan" ? "Keuangan" :
      moduleName === "kalkulator" ? "Kalkulator" : null;
      
    if (!sheetName) return;

    let rowValues = [];
    if (moduleName === "barang") {
      rowValues = [
        String(data.id),
        String(data.name || ""),
        String(data.category || ""),
        Number(data.price || 0),
        Number(data.cost_price || 0),
        Number(data.stock || 0)
      ];
    } else if (moduleName === "po") {
      rowValues = [
        String(data.id),
        String(data.supplier_name || ""),
        String(data.item_name || ""),
        Number(data.quantity || 0),
        Number(data.price || 0),
        String(data.order_date || ""),
        String(data.status || ""),
        String(data.note || ""),
        String(data.close_po_date || ""),
        String(data.estimated_ready_date || "")
      ];
    } else if (moduleName === "keuangan") {
      rowValues = [
        String(data.id),
        String(data.name || ""),
        Number(data.amount || 0),
        String(data.entry_date || ""),
        String(data.note || "")
      ];
    } else if (moduleName === "kalkulator") {
      rowValues = [
        String(data.id),
        String(data.item_name || ""),
        Number(data.base_price || 0),
        Number(data.shipping_fee || 0),
        Number(data.tax_fee || 0),
        Number(data.other_fee || 0),
        Number(data.total_price || 0),
        String(data.note || ""),
        String(data.created_at || "")
      ];
    }

    const accessToken = await getSheetsAccessToken();
    const spreadsheetId = config.spreadsheetId;

    if (action === "create") {
      // Append row
      await appendSheetRow(spreadsheetId, sheetName, rowValues);
      console.log(`SHEETS SYNC: Berhasil menambahkan baris di tab ${sheetName} untuk ID ${data.id}`);
    } else if (action === "update" || action === "delete") {
      // Ambil kolom A (IDs) untuk mencari baris data mana yang sesuai
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + "!A:A")}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Gagal mengambil kolom ID di tab ${sheetName}`);
      }

      const resData = await response.json();
      const ids = resData.values || [];
      
      // Cari baris index (0-based starting from header)
      const targetIdStr = String(data.id);
      const rowIndexZeroBased = ids.findIndex(row => row && String(row[0]) === targetIdStr);

      if (rowIndexZeroBased === -1) {
        console.log(`SHEETS SYNC: ID ${data.id} tidak ditemukan di tab ${sheetName}.`);
        if (action === "update") {
          // Jika update tapi data belum ada, kita append
          await appendSheetRow(spreadsheetId, sheetName, rowValues);
        }
        return;
      }

      if (action === "update") {
        const sheetRowIndex = rowIndexZeroBased + 1; // 1-based index
        await updateSheetRow(spreadsheetId, sheetName, sheetRowIndex, rowValues);
        console.log(`SHEETS SYNC: Berhasil mengubah baris ${sheetRowIndex} di tab ${sheetName} untuk ID ${data.id}`);
      } else if (action === "delete") {
        await deleteSheetRow(spreadsheetId, sheetName, rowIndexZeroBased);
        console.log(`SHEETS SYNC: Berhasil menghapus baris index ${rowIndexZeroBased} di tab ${sheetName} untuk ID ${data.id}`);
      }
    }
  } catch (error) {
    console.log("GOOGLE SHEETS BACKGROUND SYNC ERROR (triggering auto repair/sync):", error);
    // Jalankan perbaikan/sinkronisasi penuh untuk modul ini di latar belakang
    syncModuleData(moduleName).catch(e => console.log("REPAIR SYNC FAILED:", e));
  }
}

// Sinkronisasi data dua arah untuk satu modul tertentu
export async function syncModuleData(moduleName) {
  // Set flag global untuk mematikan database hook agar tidak looping
  global.isSheetsSyncing = true;
  try {
    const token = await getStoredDriveToken();
    if (!token || (!token.accessToken && !token.refreshToken)) {
      throw new Error("Akun Google Drive belum terhubung.");
    }

    let config = await getStoredSheetConfig();
    let spreadsheetId = config.spreadsheetId;
    let accessToken = await getSheetsAccessToken();

    // 1. Validasi spreadsheet dan list sheet
    let sheets = [];
    let needNewSpreadsheet = false;

    if (!spreadsheetId) {
      needNewSpreadsheet = true;
    } else {
      try {
        const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
        const metaRes = await fetch(metaUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (!metaRes.ok) {
          needNewSpreadsheet = true;
        } else {
          const metaData = await metaRes.json();
          sheets = metaData.sheets || [];
        }
      } catch (err) {
        needNewSpreadsheet = true;
      }
    }

    if (needNewSpreadsheet) {
      console.log("SHEETS SYNC: Spreadsheet belum diset atau tidak ditemukan. Membuat baru...");
      const newSheet = await createAutoSpreadsheet();
      spreadsheetId = newSheet.spreadsheetId;
      // Perbarui token dan dapatkan list sheet terbaru
      accessToken = await getSheetsAccessToken();
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
      const metaRes = await fetch(metaUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      const metaData = await metaRes.json();
      sheets = metaData.sheets || [];
    }

    const sheetName = 
      moduleName === "barang" ? "Barang" :
      moduleName === "po" ? "PO" :
      moduleName === "keuangan" ? "Keuangan" :
      moduleName === "kalkulator" ? "Kalkulator" : null;
      
    if (!sheetName) return;

    // 2. Periksa apakah tab (sheet) dengan nama terkait ada di Spreadsheet. Jika belum, buat!
    const hasTab = sheets.some(s => s.properties && s.properties.title && s.properties.title.toLowerCase() === sheetName.toLowerCase());
    if (!hasTab) {
      console.log(`SHEETS SYNC: Tab "${sheetName}" tidak ditemukan. Membuat tab baru...`);
      const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      const createTabRes = await fetch(batchUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: { title: sheetName }
              }
            }
          ]
        })
      });

      if (!createTabRes.ok) {
        const errText = await createTabRes.text();
        throw new Error(`Gagal membuat tab "${sheetName}": ${createTabRes.status} - ${errText}`);
      }

      // Tulis header kolom default untuk tab baru tersebut
      let defaultHeaders = [];
      if (moduleName === "barang") {
        defaultHeaders = ["ID", "Nama Barang", "Kategori", "Harga Jual", "Harga Modal", "Stok"];
      } else if (moduleName === "po") {
        defaultHeaders = ["ID", "Nama Supplier", "Nama Barang", "Jumlah", "Harga", "Tanggal", "Status", "Catatan", "Tanggal Close PO", "Estimasi Ready"];
      } else if (moduleName === "keuangan") {
        defaultHeaders = ["ID", "Nama Transaksi", "Jumlah", "Tanggal", "Catatan"];
      } else if (moduleName === "kalkulator") {
        defaultHeaders = ["ID", "Nama Barang", "Harga Dasar", "Biaya Ongkir", "Biaya Pajak", "Biaya Lain", "Total Harga", "Catatan", "Tanggal"];
      }

      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + "!A1")}?valueInputOption=USER_ENTERED`;
      await fetch(writeUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [defaultHeaders]
        })
      });
    }

    // 3. Ambil data lokal SQLite
    let localRows = [];
    const sqlite = require("./database");
    if (moduleName === "barang") {
      const res = await sqlite.exec("SELECT id, name, category, price, cost_price, stock FROM items");
      localRows = res.rows._array;
    } else if (moduleName === "po") {
      const res = await sqlite.exec("SELECT id, supplier_name, item_name, quantity, price, order_date, status, note, close_po_date, estimated_ready_date FROM purchase_orders");
      localRows = res.rows._array;
    } else if (moduleName === "keuangan") {
      const res = await sqlite.exec("SELECT id, name, amount, entry_date, note FROM bookkeeping_entries");
      localRows = res.rows._array;
    } else if (moduleName === "kalkulator") {
      const res = await sqlite.exec("SELECT id, item_name, base_price, shipping_fee, tax_fee, other_fee, total_price, note, created_at FROM calculator_entries");
      localRows = res.rows._array;
    }

    // 4. Ambil data dari Google Sheet tab terkait
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + "!A:Z")}`;
    const response = await fetch(getUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      await handleSheetsResponseError(response, `mengambil data ${sheetName} saat sinkronisasi`);
    }

    const resData = await response.json();
    const sheetRows = resData.values || [];
    const dataRows = sheetRows.slice(1); // Potong baris header

    const localIds = new Set(localRows.map(r => String(r.id)));

    // 5. Impor data dari Google Sheet ke SQLite jika tidak ada di lokal
    for (let i = 0; i < dataRows.length; i++) {
      const sRow = dataRows[i];
      if (!sRow || sRow.length === 0) continue;
      const sId = String(sRow[0]);
      
      if (!localIds.has(sId)) {
        if (moduleName === "barang") {
          const [id, name, category, price, cost_price, stock] = sRow;
          if (id && name) {
            await sqlite.exec(
              "INSERT OR REPLACE INTO items (id, name, category, price, cost_price, stock) VALUES (?, ?, ?, ?, ?, ?)",
              [Number(id), name, category || "", Number(price || 0), Number(cost_price || 0), Number(stock || 0)]
            );
          }
        } else if (moduleName === "po") {
          const [id, supplier_name, item_name, quantity, price, order_date, status, note, close_po_date, estimated_ready_date] = sRow;
          if (id && item_name) {
            await sqlite.exec(
              "INSERT OR REPLACE INTO purchase_orders (id, supplier_name, item_name, quantity, price, order_date, status, note, close_po_date, estimated_ready_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [Number(id), supplier_name || "", item_name, Number(quantity || 0), Number(price || 0), order_date || "", status || "PROGRESS", note || "", close_po_date || null, estimated_ready_date || null]
            );
          }
        } else if (moduleName === "keuangan") {
          const [id, name, amount, entry_date, note] = sRow;
          if (id && name) {
            await sqlite.exec(
              "INSERT OR REPLACE INTO bookkeeping_entries (id, name, amount, entry_date, note) VALUES (?, ?, ?, ?, ?)",
              [Number(id), name, Number(amount || 0), entry_date || "", note || ""]
            );
          }
        } else if (moduleName === "kalkulator") {
          const [id, item_name, base_price, shipping_fee, tax_fee, other_fee, total_price, note, created_at] = sRow;
          if (id && item_name) {
            await sqlite.exec(
              "INSERT OR REPLACE INTO calculator_entries (id, item_name, base_price, shipping_fee, tax_fee, other_fee, total_price, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [Number(id), item_name, Number(base_price || 0), Number(shipping_fee || 0), Number(tax_fee || 0), Number(other_fee || 0), Number(total_price || 0), note || "", created_at || ""]
            );
          }
        }
      }
    }

    // 6. Ambil ulang data lokal gabungan (termasuk yang baru diimpor) untuk di-upload kembali ke Google Sheet
    let updatedLocalRows = [];
    if (moduleName === "barang") {
      const res = await sqlite.exec("SELECT id, name, category, price, cost_price, stock FROM items");
      updatedLocalRows = res.rows._array;
    } else if (moduleName === "po") {
      const res = await sqlite.exec("SELECT id, supplier_name, item_name, quantity, price, order_date, status, note, close_po_date, estimated_ready_date FROM purchase_orders");
      updatedLocalRows = res.rows._array;
    } else if (moduleName === "keuangan") {
      const res = await sqlite.exec("SELECT id, name, amount, entry_date, note FROM bookkeeping_entries");
      updatedLocalRows = res.rows._array;
    } else if (moduleName === "kalkulator") {
      const res = await sqlite.exec("SELECT id, item_name, base_price, shipping_fee, tax_fee, other_fee, total_price, note, created_at FROM calculator_entries");
      updatedLocalRows = res.rows._array;
    }

    const formatRow = (row) => {
      if (moduleName === "barang") {
        return [String(row.id), String(row.name || ""), String(row.category || ""), Number(row.price || 0), Number(row.cost_price || 0), Number(row.stock || 0)];
      } else if (moduleName === "po") {
        return [String(row.id), String(row.supplier_name || ""), String(row.item_name || ""), Number(row.quantity || 0), Number(row.price || 0), String(row.order_date || ""), String(row.status || ""), String(row.note || ""), String(row.close_po_date || ""), String(row.estimated_ready_date || "")];
      } else if (moduleName === "keuangan") {
        return [String(row.id), String(row.name || ""), Number(row.amount || 0), String(row.entry_date || ""), String(row.note || "")];
      } else if (moduleName === "kalkulator") {
        return [String(row.id), String(row.item_name || ""), Number(row.base_price || 0), Number(row.shipping_fee || 0), Number(row.tax_fee || 0), Number(row.other_fee || 0), Number(row.total_price || 0), String(row.note || ""), String(row.created_at || "")];
      }
    };

    const formattedRows = updatedLocalRows.map(r => formatRow(r));

    // 7. Bersihkan baris lama di Google Sheet dari baris 2 s.d 1000 agar data sinkron dengan database lokal
    const clearRange = `${sheetName}!A2:Z1000`;
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`;
    await fetch(clearUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    // Tulis ulang seluruh data ke baris 2 Google Sheet
    if (formattedRows.length > 0) {
      const writeRange = `${sheetName}!A2`;
      const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`;
      const writeResponse = await fetch(writeUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: formattedRows,
        }),
      });
      if (!writeResponse.ok) {
        throw new Error(`Gagal menulis ulang data ke tab ${sheetName}`);
      }
    }
  } catch (error) {
    console.log(`Error syncing module ${moduleName}:`, error);
    throw error;
  } finally {
    global.isSheetsSyncing = false;
  }
}

// Sinkronisasi seluruh 4 modul sekaligus
export async function syncAllModulesData() {
  await syncModuleData("barang");
  await syncModuleData("po");
  await syncModuleData("keuangan");
  await syncModuleData("kalkulator");
}

// Mengambil daftar tab/sheet yang ada saat ini di spreadsheet
export async function getSpreadsheetSheets(spreadsheetId) {
  const token = await getSheetsAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    await handleSheetsResponseError(response, "mengambil daftar sheet");
  }

  const data = await response.json();
  return (data.sheets || []).map(s => s.properties?.title || "");
}
