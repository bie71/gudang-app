import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, ScrollView, RefreshControl, Modal, Pressable, ActivityIndicator, Dimensions, Platform, KeyboardAvoidingView } from "react-native";
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { openDatabaseAsync } from "expo-sqlite";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import * as FileSystem from "expo-file-system/legacy";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

const dbPromise = openDatabaseAsync("gudang.db");
let initPromise;
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const CATEGORY_COLORS = ["#2563EB", "#7C3AED", "#F97316", "#10B981", "#F43F5E"];
const PO_STATUS_OPTIONS = ["PROGRESS", "DONE", "CANCELLED"];
const PO_STATUS_STYLES = {
  PROGRESS: { background: "#FEF3C7", color: "#B45309", label: "Progress" },
  DONE: { background: "#DCFCE7", color: "#166534", label: "Done" },
  CANCELLED: { background: "#FEE2E2", color: "#B91C1C", label: "Cancelled" },
};

function getPOStatusStyle(status) {
  return PO_STATUS_STYLES[status] || PO_STATUS_STYLES.PROGRESS;
}

function formatNumberInput(value) {
  const digitsOnly = (value || "").replace(/[^0-9]/g, "");
  if (!digitsOnly) return "";
  return Number(digitsOnly).toLocaleString("id-ID");
}

function parseNumberInput(value) {
  const digitsOnly = (value || "").replace(/[^0-9]/g, "");
  return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

function formatNumberValue(value) {
  return Number(value ?? 0).toLocaleString("id-ID");
}

function formatCurrencyValue(value) {
  return `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`;
}

function formatDateDisplay(value) {
  if (!value) return "-";
  const safeValue = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(safeValue);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function parseDateString(value) {
  if (!value) return new Date();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const fallback = new Date(value);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return new Date();
}

function formatDateInputValue(dateLike) {
  const date = dateLike instanceof Date ? dateLike : parseDateString(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeSlug(text) {
  const normalized = (text || '').toString().trim().toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'po';
}

function buildPOFileBase(order) {
  const ordererSlug = safeSlug(order?.ordererName || 'pemesan');
  const itemSlug = safeSlug(order?.itemName || 'barang');
  const dateSlug = safeSlug(formatDateInputValue(new Date()));
  return `${ordererSlug}_${itemSlug}_${dateSlug}`;
}

const DOWNLOAD_PREF_FILE = `${FileSystem.documentDirectory}po_download_dir.json`;

const KEYBOARD_AVOIDING_BEHAVIOR =
  Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined;

function useFormKeyboardOffset(extraOffset = 0) {
  const headerHeight = useHeaderHeight();
  const platformOffset = Platform.OS === "android" ? 16 : 0;
  return headerHeight + platformOffset + extraOffset;
}

function FormScrollContainer({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  ...rest
}) {
  const keyboardOffset = useFormKeyboardOffset();
  const baseContentStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  };
  const mergedContentStyle = Array.isArray(contentContainerStyle)
    ? [baseContentStyle, ...contentContainerStyle]
    : { ...baseContentStyle, ...(contentContainerStyle || {}) };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={keyboardOffset}
    >
      <ScrollView
        {...rest}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? "handled"}
        contentContainerStyle={mergedContentStyle}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function describeSafDirectory(directoryUri) {
  if (!directoryUri) return null;
  try {
    let descriptor = directoryUri;
    const treeMarker = '/tree/';
    const treeIndex = descriptor.indexOf(treeMarker);
    if (treeIndex >= 0) {
      descriptor = descriptor.substring(treeIndex + treeMarker.length);
    }
    const documentMarker = '/document/';
    const documentIndex = descriptor.indexOf(documentMarker);
    if (documentIndex >= 0) {
      descriptor = descriptor.substring(0, documentIndex);
    }
    let decoded = decodeURIComponent(descriptor);
    if (!decoded) return null;
    if (decoded.startsWith('primary:')) {
      const relative = decoded.substring('primary:'.length).replace(/:/g, '/');
      return relative ? `Penyimpanan internal/${relative}` : 'Penyimpanan internal';
    }
    if (decoded.startsWith('home:')) {
      const relative = decoded.substring('home:'.length).replace(/:/g, '/');
      return relative ? `Folder beranda/${relative}` : 'Folder beranda';
    }
    if (decoded.includes(':')) {
      const [volume, ...restParts] = decoded.split(':');
      const rest = restParts.join(':').replace(/:/g, '/');
      return rest ? `${volume}/${rest}` : volume;
    }
    return decoded.replace(/:/g, '/');
  } catch (error) {
    console.log('DESCRIBE DIRECTORY ERROR:', error);
    return null;
  }
}

function buildExternalDisplayPath(directoryUri, fileName) {
  const baseLabel = describeSafDirectory(directoryUri);
  const sanitizedName = (fileName || '').replace(/^\/+/, '');
  const trimmedBase = baseLabel ? baseLabel.replace(/\/+$/, '') : null;
  if (trimmedBase) {
    const path = sanitizedName ? `${trimmedBase}/${sanitizedName}` : trimmedBase;
    return `Folder yang kamu pilih: ${path}`;
  }
  if (directoryUri) {
    const trimmedUri = directoryUri.replace(/\/+$/, '');
    const path = sanitizedName ? `${trimmedUri}/${sanitizedName}` : trimmedUri;
    return `Folder yang kamu pilih: ${path}`;
  }
  return null;
}

function buildInternalDisplayPath(fileName, destPath) {
  const sanitizedName = (fileName || '').replace(/^\/+/, '');
  if (FileSystem.documentDirectory) {
    const normalizedDir = FileSystem.documentDirectory.endsWith('/')
      ? FileSystem.documentDirectory
      : `${FileSystem.documentDirectory}/`;
    return `Folder aplikasi internal: ${normalizedDir}${sanitizedName}`;
  }
  if (destPath) {
    return `Folder aplikasi internal: ${destPath}`;
  }
  return 'Folder aplikasi internal';
}

async function getSavedDownloadDir() {
  try {
    const content = await FileSystem.readAsStringAsync(DOWNLOAD_PREF_FILE);
    if (!content) return null;
    const parsed = JSON.parse(content);
    return parsed?.directoryUri || null;
  } catch (error) {
    return null;
  }
}

async function setSavedDownloadDir(directoryUri) {
  try {
    if (!directoryUri) {
      await FileSystem.deleteAsync(DOWNLOAD_PREF_FILE, { idempotent: true });
      return;
    }
    await FileSystem.writeAsStringAsync(DOWNLOAD_PREF_FILE, JSON.stringify({ directoryUri }));
  } catch (error) {
    console.log('SAVE PREF ERROR:', error);
  }
}

async function saveFileToStorage(tempUri, fileName, mimeType) {
  const copyToDocumentDirectory = async () => {
    if (!FileSystem.documentDirectory) {
      throw new Error('DOCUMENT_DIRECTORY_UNAVAILABLE');
    }
    const destPath = `${FileSystem.documentDirectory}${fileName}`;
    try {
      await FileSystem.deleteAsync(destPath, { idempotent: true });
    } catch (error) {
      if (error?.message) {
        console.log('DELETE TEMP FILE ERROR:', error);
      }
    }
    await FileSystem.copyAsync({ from: tempUri, to: destPath });
    return {
      uri: destPath,
      displayPath: buildInternalDisplayPath(fileName, destPath),
    };
  };

  const hasSAF =
    Platform.OS === 'android' &&
    FileSystem.StorageAccessFramework &&
    typeof FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync === 'function';

  if (hasSAF) {
    let directoryUri = await getSavedDownloadDir();
    if (!directoryUri) {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          directoryUri = permissions.directoryUri;
          await setSavedDownloadDir(directoryUri);
        } else {
          const fallback = await copyToDocumentDirectory();
          return {
            uri: fallback.uri,
            location: 'internal',
            notice: 'Perangkat tidak mengizinkan memilih folder penyimpanan eksternal.',
            displayPath: fallback.displayPath,
          };
        }
      } catch (permissionError) {
        console.log('SAF PERMISSION ERROR:', permissionError);
        const fallback = await copyToDocumentDirectory();
        return {
          uri: fallback.uri,
          location: 'internal',
          notice: 'Gagal membuka pemilih folder. File disimpan di folder aplikasi.',
          displayPath: fallback.displayPath,
        };
      }
    }

    if (directoryUri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, mimeType);
        await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return {
          uri: destUri,
          location: 'external',
          notice: null,
          displayPath: buildExternalDisplayPath(directoryUri, fileName),
        };
      } catch (saveError) {
        console.log('SAF SAVE ERROR:', saveError);
        await setSavedDownloadDir(null);
        const fallback = await copyToDocumentDirectory();
        return {
          uri: fallback.uri,
          location: 'internal',
          notice: 'Tidak dapat menyimpan ke folder yang dipilih. File disimpan di folder aplikasi.',
          displayPath: fallback.displayPath,
        };
      }
    }
  }

  try {
    const fallback = await copyToDocumentDirectory();
    return {
      uri: fallback.uri,
      location: 'internal',
      notice:
        Platform.OS === 'android' && !hasSAF
          ? 'Perangkat tidak mendukung pemilihan folder eksternal. File disimpan di folder aplikasi.'
          : null,
      displayPath: fallback.displayPath,
    };
  } catch (error) {
    console.log('SAVE FILE ERROR:', error);
    return {
      uri: tempUri,
      location: 'unknown',
      notice: 'Gagal memindahkan file ke folder aplikasi.',
      displayPath: tempUri ? `Lokasi sementara: ${tempUri}` : null,
    };
  }
}

async function resolveShareableUri(fileName, ...candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    if (candidate.startsWith('file://')) return candidate;
    if (candidate.startsWith('/')) return `file://${candidate}`;
  }

  const contentCandidate = candidates.find(uri => typeof uri === 'string' && uri.startsWith('content://'));
  if (
    contentCandidate &&
    FileSystem.StorageAccessFramework &&
    typeof FileSystem.StorageAccessFramework.readAsStringAsync === 'function'
  ) {
    try {
      const base64 = await FileSystem.StorageAccessFramework.readAsStringAsync(contentCandidate, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const cacheRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!cacheRoot) return null;
      const sharePath = `${cacheRoot}${fileName}`;
      await FileSystem.writeAsStringAsync(sharePath, base64, { encoding: FileSystem.EncodingType.Base64 });
      return sharePath;
    } catch (error) {
      console.log('CONTENT SHARE ERROR:', error);
    }
  }

  return null;
}

async function exec(sql, params = []) {
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

async function initDb() {
  await ensureDbReady();
}

async function ensureDbReady() {
  const db = await dbPromise;
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
      await db.execAsync(createItemsSql);
      await db.execAsync(createHistorySql);
      await db.execAsync(createPurchaseOrderSql);
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
      return db;
    })().catch(error => {
      initPromise = undefined;
      throw error;
    });
  }
  await initPromise;
  return db;
}

// ---------- Dashboard ----------
function DashboardScreen({ navigation }) {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const modalKeyboardOffset = Platform.OS === "ios" ? insets.bottom + 16 : 0;
  const [metrics, setMetrics] = useState({
    totalStock: 0,
    totalItems: 0,
    totalValue: 0,
    totalCategories: 0,
    totalPrice: 0,
    totalOutQty: 0,
    totalOutValue: 0,
    poCount: 0,
    poProgress: 0,
    poTotalValue: 0,
  });
  const [categoryStats, setCategoryStats] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [recentPOs, setRecentPOs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [detailModal, setDetailModal] = useState({ visible:false, title:"", description:"", rows: [], type: null });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadingMore, setDetailLoadingMore] = useState(false);
  const [detailHasMore, setDetailHasMore] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailSearchInput, setDetailSearchInput] = useState("");
  const detailPaging = useRef({ type: null, offset: 0, search: "" });
  const DETAIL_PAGE_SIZE = 20;
  const PAGINATED_CONFIG = {
    categoriesFull: {
      title: "Semua Kategori",
      description: "Daftar lengkap kategori dengan ringkasan stok.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT
            CASE WHEN category IS NULL OR TRIM(category) = '' THEN 'Tanpa Kategori' ELSE category END as label,
            COUNT(*) as totalItems,
            IFNULL(SUM(stock),0) as totalStock,
            IFNULL(SUM(price * stock),0) as totalValue
          FROM items
          GROUP BY label
          HAVING (? = '' OR LOWER(label) LIKE ?)
          ORDER BY totalItems DESC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => ({
        key: row.label,
        title: row.label,
        subtitle: `${formatNumberValue(row.totalItems)} barang • ${formatNumberValue(row.totalStock)} stok`,
        trailingPrimary: formatCurrencyValue(row.totalValue),
      }),
    },
    itemsFull: {
      title: "Barang Tersedia",
      description: "Semua barang dengan stok saat ini.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT id, name, category, stock, price, (stock * price) as totalValue
          FROM items
          WHERE (? = '' OR LOWER(name) LIKE ? OR LOWER(IFNULL(category,'')) LIKE ?)
          ORDER BY stock DESC, name ASC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => ({
        key: String(row.id),
        title: row.name,
        subtitle: `${(row.category && row.category.trim()) ? row.category : 'Tanpa kategori'} • ${formatNumberValue(row.stock)} stok`,
        trailingPrimary: formatCurrencyValue(row.totalValue),
        trailingSecondary: `@ ${formatCurrencyValue(row.price)}`,
      }),
    },
    poFull: {
      title: "Semua Purchase Order",
      description: "Riwayat purchase order terbaru.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT id, orderer_name, supplier_name, item_name, quantity, price, status, order_date
          FROM purchase_orders
          WHERE (? = '' OR LOWER(item_name) LIKE ? OR LOWER(IFNULL(orderer_name,'')) LIKE ? OR LOWER(IFNULL(supplier_name,'')) LIKE ?)
          ORDER BY order_date DESC, id DESC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => {
        const qty = Number(row.quantity ?? 0);
        const price = Number(row.price ?? 0);
        const totalValue = qty * price;
        const orderer = row.orderer_name ? row.orderer_name : 'Tanpa pemesan';
        const statusLabel = getPOStatusStyle(row.status).label;
        return {
          key: String(row.id),
          title: row.item_name,
          subtitle: `${orderer} • ${formatDateDisplay(row.order_date)} • ${statusLabel}`,
          trailingPrimary: formatCurrencyValue(totalValue),
          trailingSecondary: `${formatNumberValue(qty)} pcs @ ${formatCurrencyValue(price)}`,
        };
      },
    },
    poProgress: {
      title: "PO Progress",
      description: "Purchase order yang masih dalam proses.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT id, orderer_name, supplier_name, item_name, quantity, price, status, order_date
          FROM purchase_orders
          WHERE status = 'PROGRESS'
            AND (? = '' OR LOWER(item_name) LIKE ? OR LOWER(IFNULL(orderer_name,'')) LIKE ? OR LOWER(IFNULL(supplier_name,'')) LIKE ?)
          ORDER BY order_date ASC, id ASC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => {
        const qty = Number(row.quantity ?? 0);
        const price = Number(row.price ?? 0);
        const totalValue = qty * price;
        const orderer = row.orderer_name ? row.orderer_name : 'Tanpa pemesan';
        const statusLabel = getPOStatusStyle(row.status).label;
        return {
          key: String(row.id),
          title: row.item_name,
          subtitle: `${orderer} • ${formatDateDisplay(row.order_date)} • ${statusLabel}`,
          trailingPrimary: formatCurrencyValue(totalValue),
          trailingSecondary: `${formatNumberValue(qty)} pcs @ ${formatCurrencyValue(price)}`,
        };
      },
    },
    poValue: {
      title: "Nilai Purchase Order",
      description: "PO dengan nilai transaksi tertinggi.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT id, orderer_name, supplier_name, item_name, quantity, price, status, order_date
          FROM purchase_orders
          WHERE (? = '' OR LOWER(item_name) LIKE ? OR LOWER(IFNULL(orderer_name,'')) LIKE ? OR LOWER(IFNULL(supplier_name,'')) LIKE ?)
          ORDER BY (quantity * price) DESC, order_date DESC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => {
        const qty = Number(row.quantity ?? 0);
        const price = Number(row.price ?? 0);
        const totalValue = qty * price;
        const orderer = row.orderer_name ? row.orderer_name : 'Tanpa pemesan';
        const statusLabel = getPOStatusStyle(row.status).label;
        return {
          key: String(row.id),
          title: row.item_name,
          subtitle: `${orderer} • ${formatDateDisplay(row.order_date)} • ${statusLabel}`,
          trailingPrimary: formatCurrencyValue(totalValue),
          trailingSecondary: `${formatNumberValue(qty)} pcs @ ${formatCurrencyValue(price)}`,
        };
      },
    },
  };

  const isPaginatedType = type => Boolean(type && PAGINATED_CONFIG[type]);

  const formatNumber = formatNumberValue;
  const formatCurrency = formatCurrencyValue;
  const todayLabel = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  async function load() {
    try {
      setRefreshing(true);
      const summaryRes = await exec(`
        SELECT
          IFNULL(SUM(stock),0) as totalStock,
          COUNT(*) as totalItems,
          IFNULL(SUM(price),0) as totalPrice,
          IFNULL(SUM(stock * price),0) as totalInventoryValue
        FROM items
      `);
      const outRes = await exec(`
        SELECT
          IFNULL(SUM(h.qty),0) as totalOutQty,
          IFNULL(SUM(h.qty * i.price),0) as totalOutValue
        FROM stock_history h JOIN items i ON i.id = h.item_id
        WHERE h.type = 'OUT'
      `);
      const categoryRes = await exec(`
        SELECT
          category,
          COUNT(*) as totalItems,
          IFNULL(SUM(stock),0) as totalStock,
          IFNULL(SUM(price * stock),0) as totalValue
        FROM items
        GROUP BY category
        ORDER BY totalItems DESC
      `);
      const topItemsRes = await exec(`
        SELECT id, name, category, stock, price, (stock * price) as totalValue
        FROM items
        WHERE stock > 0
        ORDER BY stock DESC, name ASC
        LIMIT 5
      `);
      const poSummaryRes = await exec(`
        SELECT
          COUNT(*) as totalOrders,
          IFNULL(SUM(quantity),0) as totalQuantity,
          IFNULL(SUM(quantity * price),0) as totalValue,
          SUM(CASE WHEN status = 'PROGRESS' THEN 1 ELSE 0 END) as progressOrders
        FROM purchase_orders
      `);
      const recentPoRes = await exec(`
        SELECT id, supplier_name, orderer_name, item_name, quantity, price, status, order_date
        FROM purchase_orders
        ORDER BY order_date DESC, id DESC
        LIMIT 5
      `);

      const summaryRow = summaryRes.rows.length ? summaryRes.rows.item(0) : {};
      const outRow = outRes.rows.length ? outRes.rows.item(0) : {};
      const poSummaryRow = poSummaryRes.rows.length ? poSummaryRes.rows.item(0) : {};

      const nextCategoryStats = [];
      for (let i = 0; i < categoryRes.rows.length; i++) {
        const row = categoryRes.rows.item(i);
        const rawLabel = row.category != null ? String(row.category).trim() : "";
        nextCategoryStats.push({
          label: rawLabel || "Tanpa Kategori",
          totalItems: Number(row.totalItems ?? 0),
          totalStock: Number(row.totalStock ?? 0),
          totalValue: Number(row.totalValue ?? 0),
        });
      }

      const nextTopItems = [];
      for (let i = 0; i < topItemsRes.rows.length; i++) {
        const row = topItemsRes.rows.item(i);
        nextTopItems.push({
          id: row.id,
          name: row.name,
          category: row.category,
          stock: Number(row.stock ?? 0),
          price: Number(row.price ?? 0),
          totalValue: Number(row.totalValue ?? 0),
        });
      }

      const nextRecentPOs = [];
      for (let i = 0; i < recentPoRes.rows.length; i++) {
        const row = recentPoRes.rows.item(i);
        nextRecentPOs.push({
          id: row.id,
          supplierName: row.supplier_name,
          ordererName: row.orderer_name,
          itemName: row.item_name,
          quantity: Number(row.quantity ?? 0),
          price: Number(row.price ?? 0),
          status: row.status,
          orderDate: row.order_date,
        });
      }

      setCategoryStats(nextCategoryStats);
      setTopItems(nextTopItems);
      setRecentPOs(nextRecentPOs);
      setMetrics({
        totalStock: Number(summaryRow.totalStock ?? 0),
        totalItems: Number(summaryRow.totalItems ?? 0),
        totalValue: Number(summaryRow.totalInventoryValue ?? 0),
        totalCategories: nextCategoryStats.length,
        totalPrice: Number(summaryRow.totalPrice ?? 0),
        totalOutQty: Number(outRow.totalOutQty ?? 0),
        totalOutValue: Number(outRow.totalOutValue ?? 0),
        poCount: Number(poSummaryRow.totalOrders ?? 0),
        poProgress: Number(poSummaryRow.progressOrders ?? 0),
        poTotalValue: Number(poSummaryRow.totalValue ?? 0),
      });
    } catch (error) {
      console.log("DASHBOARD LOAD ERROR:", error);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation]);

  function closeDetail() {
    setDetailModal({ visible: false, title: "", description: "", rows: [], type: null });
    setDetailSearch("");
    setDetailSearchInput("");
    setDetailHasMore(false);
    setDetailLoading(false);
    setDetailLoadingMore(false);
    detailPaging.current = { type: null, offset: 0, search: "" };
  }

  function openPaginatedDetail(type) {
    const config = PAGINATED_CONFIG[type];
    if (!config) return;
    setDetailModal({
      visible: true,
      type,
      title: config.title,
      description: config.description,
      rows: [],
    });
    setDetailSearch("");
    setDetailSearchInput("");
    setDetailHasMore(false);
    detailPaging.current = { type, offset: 0, search: "" };
    loadDetailPaginated({ type, searchTerm: "", reset: true });
  }

  async function loadDetailPaginated({ type, searchTerm = detailSearch, reset = false }) {
    const config = PAGINATED_CONFIG[type];
    if (!config) return;
    const trimmedTerm = (searchTerm || "").trim();
    const normalizedSearch = trimmedTerm.toLowerCase();
    const limit = DETAIL_PAGE_SIZE;
    const offset = reset ? 0 : detailPaging.current.offset;
    const { sql, params } = config.buildQuery(normalizedSearch, limit, offset);
    try {
      if (reset) {
        setDetailLoading(true);
        setDetailModal(prev => ({ ...prev, rows: [] }));
      } else {
        setDetailLoadingMore(true);
      }
      const res = await exec(sql, params);
      const fetchedRows = [];
      for (let i = 0; i < res.rows.length; i++) {
        fetchedRows.push(config.mapRow(res.rows.item(i)));
      }
      const hasMore = fetchedRows.length > limit;
      const trimmedRows = hasMore ? fetchedRows.slice(0, limit) : fetchedRows;
      setDetailModal(prev => ({
        ...prev,
        rows: reset ? trimmedRows : [...prev.rows, ...trimmedRows],
      }));
      detailPaging.current = {
        type,
        offset: offset + trimmedRows.length,
        search: normalizedSearch,
      };
      setDetailSearch(trimmedTerm);
      setDetailHasMore(hasMore);
    } catch (error) {
      console.log("DETAIL LOAD ERROR:", error);
      if (reset) {
        setDetailModal(prev => ({
          ...prev,
          description: "Tidak dapat memuat data. Silakan coba lagi.",
          rows: [],
        }));
      } else {
        Alert.alert("Gagal", "Tidak dapat memuat data tambahan.");
      }
      setDetailHasMore(false);
    } finally {
      if (reset) setDetailLoading(false);
      else setDetailLoadingMore(false);
    }
  }

  function loadMoreDetail() {
    const { type } = detailPaging.current;
    if (!isPaginatedType(type) || detailLoadingMore || !detailHasMore) return;
    loadDetailPaginated({ type, searchTerm: detailSearch, reset: false });
  }

  function applySearch() {
    if (!isPaginatedType(detailModal.type)) return;
    const term = detailSearchInput.trim();
    const normalized = term.toLowerCase();
    setDetailSearch(term);
    detailPaging.current = { type: detailModal.type, offset: 0, search: normalized };
    loadDetailPaginated({ type: detailModal.type, searchTerm: term, reset: true });
  }

  async function openDetail(statKey) {
    const paginatedMap = {
      categoriesFull: "categoriesFull",
      itemsFull: "itemsFull",
      poFull: "poFull",
      poCount: "poFull",
      poProgress: "poProgress",
      poPending: "poProgress",
      poValue: "poValue",
    };
    const paginatedType = paginatedMap[statKey];
    if (paginatedType) {
      openPaginatedDetail(paginatedType);
      return;
    }

    setDetailHasMore(false);
    setDetailSearch("");
    setDetailSearchInput("");
    detailPaging.current = { type: null, offset: 0, search: "" };
    setDetailModal({ visible: true, title: "Memuat detail…", description: "", rows: [], type: statKey });
    setDetailLoading(true);
    try {
      let modalState = null;

      if (statKey === "categories") {
        const rows = categoryStats.map(cat => ({
          key: cat.label,
          title: cat.label,
          subtitle: `${formatNumber(cat.totalItems)} barang • ${formatNumber(cat.totalStock)} stok`,
          trailingPrimary: formatCurrency(cat.totalValue),
        }));
        modalState = {
          visible: true,
          title: "Kategori Barang",
          description: "Distribusi barang berdasarkan kategori aktif.",
          rows,
          type: statKey,
        };
      } else if (statKey === "items") {
        const res = await exec(`
          SELECT id, name, category, stock, price
          FROM items
          ORDER BY id DESC
          LIMIT 50
        `);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) {
          const row = res.rows.item(i);
          rows.push({
            key: String(row.id),
            title: row.name,
            subtitle: `${row.category || "Tanpa kategori"} • ${formatNumber(row.stock)} stok`,
            trailingPrimary: `@ ${formatCurrency(row.price)}`,
          });
        }
        modalState = {
          visible: true,
          title: "Daftar Barang",
          description: rows.length ? `${rows.length} barang terbaru` : "Belum ada barang terdaftar.",
          rows,
          type: statKey,
        };
      } else if (statKey === "stock") {
        const res = await exec(`
          SELECT id, name, category, stock, price
          FROM items
          ORDER BY stock DESC, name ASC
          LIMIT 30
        `);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) {
          const row = res.rows.item(i);
          rows.push({
            key: String(row.id),
            title: row.name,
            subtitle: row.category || "Tanpa kategori",
            trailingPrimary: `${formatNumber(row.stock)} stok`,
            trailingSecondary: `@ ${formatCurrency(row.price)}`,
          });
        }
        modalState = {
          visible: true,
          title: "Stok Terbanyak",
          description: rows.length ? "30 barang dengan stok tertinggi." : "Belum ada stok tersimpan.",
          rows,
          type: statKey,
        };
      } else if (statKey === "value") {
        const res = await exec(`
          SELECT id, name, category, stock, price, (stock * price) as totalValue
          FROM items
          ORDER BY totalValue DESC, name ASC
          LIMIT 30
        `);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) {
          const row = res.rows.item(i);
          rows.push({
            key: String(row.id),
            title: row.name,
            subtitle: `${row.category || "Tanpa kategori"} • ${formatNumber(row.stock)} stok`,
            trailingPrimary: formatCurrency(row.totalValue),
            trailingSecondary: `@ ${formatCurrency(row.price)}`,
          });
        }
        modalState = {
          visible: true,
          title: "Nilai Persediaan",
          description: rows.length ? "Barang dengan nilai persediaan tertinggi." : "Belum ada persediaan tersimpan.",
          rows,
          type: statKey,
        };
      } else if (statKey === "outQty" || statKey === "outValue") {
        const res = await exec(`
          SELECT h.id, i.name, i.category, h.qty, h.created_at, i.price, (h.qty * i.price) as totalValue
          FROM stock_history h JOIN items i ON i.id = h.item_id
          WHERE h.type = 'OUT'
          ORDER BY h.created_at DESC, h.id DESC
          LIMIT 30
        `);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) {
          const row = res.rows.item(i);
          rows.push({
            key: String(row.id),
            title: row.name,
            subtitle: `${row.category || "Tanpa kategori"} • ${row.created_at}`,
            trailingPrimary: `${formatNumber(row.qty)} pcs`,
            trailingSecondary: formatCurrency(row.totalValue),
          });
        }
        modalState = {
          visible: true,
          title: "Riwayat Stok Keluar",
          description: rows.length ? "30 transaksi keluar terbaru." : "Belum ada transaksi keluar.",
          rows,
          type: statKey,
        };
      } else {
        modalState = {
          visible: true,
          title: "Detail tidak tersedia",
          description: "Tidak ada data detail yang dapat ditampilkan.",
          rows: [],
          type: statKey,
        };
      }

      if (modalState && !modalState.type) {
        modalState.type = statKey;
      }
      setDetailModal(modalState);
    } catch (error) {
      console.log("DETAIL LOAD ERROR:", error);
      setDetailModal({
        visible: true,
        title: "Tidak dapat memuat detail",
        description: "Terjadi kesalahan. Silakan coba lagi.",
        rows: [],
        type: statKey,
      });
    } finally {
      setDetailLoading(false);
    }
  }

  const stats = [
    {
      key: "categories",
      label: "Kategori",
      value: formatNumber(metrics.totalCategories),
      helper: "Kategori aktif",
      icon: "grid-outline",
      iconColor: "#6366F1",
      backgroundColor: "#EEF2FF",
    },
    {
      key: "items",
      label: "Total Barang",
      value: formatNumber(metrics.totalItems),
      helper: "Produk terdaftar",
      icon: "cube-outline",
      iconColor: "#2563EB",
      backgroundColor: "#DBEAFE",
    },
    {
      key: "stock",
      label: "Total Stok",
      value: formatNumber(metrics.totalStock),
      helper: "Stok tersisa",
      icon: "layers-outline",
      iconColor: "#22C55E",
      backgroundColor: "#DCFCE7",
    },
    {
      key: "outQty",
      label: "Stok Keluar",
      value: formatNumber(metrics.totalOutQty),
      helper: "Qty keluar total",
      icon: "log-out-outline",
      iconColor: "#F87171",
      backgroundColor: "#FEE2E2",
    },
    {
      key: "value",
      label: "Nilai Persediaan",
      value: formatCurrency(metrics.totalValue),
      helper: "Estimasi harga",
      icon: "cash-outline",
      iconColor: "#F97316",
      backgroundColor: "#FFEDD5",
    },
    {
      key: "outValue",
      label: "Nilai Keluar",
      value: formatCurrency(metrics.totalOutValue),
      helper: "Akumulasi keluar",
      icon: "trending-down-outline",
      iconColor: "#0EA5E9",
      backgroundColor: "#E0F2FE",
    },
    {
      key: "poCount",
      label: "Total PO",
      value: formatNumber(metrics.poCount),
      helper: "Pesanan pembelian",
      icon: "cart-outline",
      iconColor: "#14B8A6",
      backgroundColor: "#CCFBF1",
    },
    {
      key: "poProgress",
      label: "PO Progress",
      value: formatNumber(metrics.poProgress),
      helper: "Sedang diproses",
      icon: "time-outline",
      iconColor: "#F59E0B",
      backgroundColor: "#FEF3C7",
    },
    {
      key: "poValue",
      label: "Nilai PO",
      value: formatCurrency(metrics.poTotalValue),
      helper: "Total belanja",
      icon: "document-text-outline",
      iconColor: "#A855F7",
      backgroundColor: "#F5E8FF",
    },
  ];

  const displayCategories = categoryStats.slice(0, 5);
  const displayTopItems = topItems.slice(0, 5);
  const displayRecentPOs = recentPOs.slice(0, 5);

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:"#F1F5F9" }}>
      <ScrollView
        contentContainerStyle={{ padding:16, paddingBottom:24 + tabBarHeight }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#2563EB" />}
      >
        <View style={{ gap:16 }}>
          <View style={{ backgroundColor:"#2563EB", borderRadius:20, padding:20, shadowColor:"#2563EB", shadowOpacity:0.18, shadowRadius:12, elevation:4 }}>
            <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
              <View style={{ flex:1, paddingRight:16 }}>
                <Text style={{ color:"#BFDBFE", fontSize:13, letterSpacing:0.4 }}>Inventori Gudang</Text>
                <Text style={{ color:"#fff", fontSize:24, fontWeight:"700", marginTop:4 }}>Ringkasan Hari Ini</Text>
                <Text style={{ color:"#DBEAFE", marginTop:8 }}>{todayLabel}</Text>
              </View>
              <View style={{ width:64, height:64, borderRadius:20, backgroundColor:"rgba(255,255,255,0.18)", alignItems:"center", justifyContent:"center" }}>
                <MaterialCommunityIcons name="warehouse" size={36} color="#fff" />
              </View>
            </View>
            <TouchableOpacity
              onPress={load}
              style={{ marginTop:18, backgroundColor:"rgba(255,255,255,0.2)", borderRadius:12, flexDirection:"row", alignItems:"center", justifyContent:"center", paddingVertical:12 }}
            >
              <Ionicons name="refresh" color="#fff" size={18} style={{ marginRight:8 }} />
              <Text style={{ color:"#fff", fontWeight:"600" }}>Perbarui Data</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:12 }}>
            {stats.map(({ key: cardKey, ...cardProps }) => (
              <StatCard key={cardKey} {...cardProps} onPress={() => openDetail(cardKey)} />
            ))}
          </View>

          <View style={{ backgroundColor:"#fff", borderRadius:16, padding:20, borderWidth:1, borderColor:"#E2E8F0", shadowColor:"#0F172A", shadowOpacity:0.05, shadowRadius:12, elevation:2 }}>
            <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <View>
                <Text style={{ fontSize:18, fontWeight:"700", color:"#0F172A" }}>Ringkasan Kategori</Text>
                <Text style={{ color:"#64748B" }}>{categoryStats.length ? `${categoryStats.length} kategori` : "Belum ada data"}</Text>
              </View>
              {categoryStats.length ? (
                <TouchableOpacity onPress={() => openPaginatedDetail("categoriesFull")}>
                  <Text style={{ color:"#2563EB", fontWeight:"600" }}>Lihat semua</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {categoryStats.length ? displayCategories.map((cat, index) => (
              <View
                key={`${cat.label}-${index}`}
                style={{ flexDirection:"row", alignItems:"center", paddingVertical:12, borderTopWidth: index === 0 ? 0 : 1, borderColor:"#E2E8F0" }}
              >
                <View style={{ width:44, height:44, borderRadius:14, backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length], alignItems:"center", justifyContent:"center", marginRight:14 }}>
                  <MaterialCommunityIcons name="shape-outline" size={22} color="#fff" />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={{ fontWeight:"700", color:"#0F172A" }}>{cat.label}</Text>
                  <Text style={{ color:"#64748B", fontSize:12 }}>{`${formatNumber(cat.totalItems)} barang • ${formatNumber(cat.totalStock)} stok`}</Text>
                </View>
                <Text style={{ color:"#0F172A", fontWeight:"700" }}>{formatCurrency(cat.totalValue)}</Text>
              </View>
            )) : (
              <View style={{ paddingVertical:16 }}>
                <Text style={{ color:"#94A3B8" }}>Belum ada data kategori. Tambahkan barang terlebih dahulu.</Text>
              </View>
            )}
          </View>

          <View style={{ backgroundColor:"#fff", borderRadius:16, padding:20, borderWidth:1, borderColor:"#E2E8F0", shadowColor:"#0F172A", shadowOpacity:0.05, shadowRadius:12, elevation:2 }}>
            <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <View>
                <Text style={{ fontSize:18, fontWeight:"700", color:"#0F172A" }}>Barang Tersedia</Text>
                <Text style={{ color:"#64748B" }}>{topItems.length ? `${topItems.length} item` : "Belum ada stok"}</Text>
              </View>
              {topItems.length ? (
                <TouchableOpacity onPress={() => openPaginatedDetail("itemsFull")}>
                  <Text style={{ color:"#2563EB", fontWeight:"600" }}>Lihat semua</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {topItems.length ? displayTopItems.map((item, index) => (
              <View key={item.id} style={{ flexDirection:"row", alignItems:"center", paddingVertical:12, borderTopWidth: index === 0 ? 0 : 1, borderColor:"#E2E8F0" }}>
                <View style={{ width:44, height:44, borderRadius:14, backgroundColor:"#E0F2FE", alignItems:"center", justifyContent:"center", marginRight:14 }}>
                  <Ionicons name="cube" size={22} color="#0284C7" />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={{ fontWeight:"700", color:"#0F172A" }}>{item.name}</Text>
                  <Text style={{ color:"#64748B", fontSize:12 }}>{`${item.category || "Tanpa kategori"} • ${formatNumber(item.stock)} stok`}</Text>
                </View>
                <View style={{ alignItems:"flex-end" }}>
                  <Text style={{ color:"#0F172A", fontWeight:"700" }}>{formatCurrency(item.totalValue)}</Text>
                  <Text style={{ color:"#94A3B8", fontSize:12 }}>{`@ ${formatCurrency(item.price)}`}</Text>
                </View>
              </View>
            )) : (
              <View style={{ paddingVertical:16 }}>
                <Text style={{ color:"#94A3B8" }}>Belum ada stok tersimpan. Tambahkan barang untuk melihat ringkasan.</Text>
              </View>
            )}
          </View>

          <View style={{ backgroundColor:"#fff", borderRadius:16, padding:20, borderWidth:1, borderColor:"#E2E8F0", shadowColor:"#0F172A", shadowOpacity:0.05, shadowRadius:12, elevation:2 }}>
            <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <View>
                <Text style={{ fontSize:18, fontWeight:"700", color:"#0F172A" }}>PO Terbaru</Text>
                <Text style={{ color:"#64748B" }}>{recentPOs.length ? `${recentPOs.length} data` : "Belum ada PO"}</Text>
              </View>
              {recentPOs.length ? (
                <TouchableOpacity onPress={() => openPaginatedDetail("poFull")}>
                  <Text style={{ color:"#2563EB", fontWeight:"600" }}>Lihat semua</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {recentPOs.length ? displayRecentPOs.map((po, index) => {
              const totalValue = po.quantity * po.price;
              const statusStyle = getPOStatusStyle(po.status);
              return (
                <View key={po.id} style={{ flexDirection:"row", alignItems:"center", paddingVertical:12, borderTopWidth: index === 0 ? 0 : 1, borderColor:"#E2E8F0" }}>
                  <View style={{ width:44, height:44, borderRadius:14, backgroundColor:"#FEF3C7", alignItems:"center", justifyContent:"center", marginRight:14 }}>
                    <Ionicons name="cart-outline" size={22} color="#D97706" />
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontWeight:"700", color:"#0F172A" }}>{po.itemName}</Text>
                    <Text style={{ color:"#64748B", fontSize:12 }}>{`${po.ordererName || "Tanpa pemesan"} • ${formatDateDisplay(po.orderDate)} • ${statusStyle.label}`}</Text>
                  </View>
                  <View style={{ alignItems:"flex-end" }}>
                    <Text style={{ color:"#0F172A", fontWeight:"700" }}>{formatCurrency(totalValue)}</Text>
                    <Text style={{ color:"#94A3B8", fontSize:12 }}>{`${formatNumber(po.quantity)} pcs`}</Text>
                  </View>
                </View>
              );
            }) : (
              <View style={{ paddingVertical:16 }}>
                <Text style={{ color:"#94A3B8" }}>Belum ada purchase order tercatat.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <Modal
        visible={detailModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeDetail}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.35)", padding: 16 }}
          onPress={closeDetail}
        >
          <KeyboardAvoidingView
            behavior={KEYBOARD_AVOIDING_BEHAVIOR}
            keyboardVerticalOffset={modalKeyboardOffset}
            style={{ flex: 1, justifyContent: "flex-end" }}
            pointerEvents="box-none"
          >
            <Pressable
              style={{ backgroundColor: "#fff", borderRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, maxHeight: "75%" }}
              onPress={event => event.stopPropagation()}
            >
            <View style={{ alignItems:"center", marginBottom:12 }}>
              <View style={{ width:42, height:4, borderRadius:999, backgroundColor:"#E2E8F0" }} />
            </View>
            <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom: detailModal.description ? 8 : 16 }}>
              <Text style={{ fontSize:18, fontWeight:"700", color:"#0F172A", flex:1, paddingRight:12 }}>{detailModal.title}</Text>
              <TouchableOpacity onPress={closeDetail} style={{ padding:6 }}>
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>
            {detailModal.description ? (
              <Text style={{ color:"#64748B", marginBottom:16 }}>{detailModal.description}</Text>
            ) : null}
            {isPaginatedType(detailModal.type) ? (
              <>
                <View style={{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:12 }}>
                  <TextInput
                    value={detailSearchInput}
                    onChangeText={setDetailSearchInput}
                    placeholder="Cari..."
                    placeholderTextColor="#94A3B8"
                    onSubmitEditing={applySearch}
                    style={{ flex:1, backgroundColor:"#F8FAFC", borderWidth:1, borderColor:"#E2E8F0", borderRadius:12, paddingHorizontal:12, height:42 }}
                  />
                  <TouchableOpacity
                    onPress={applySearch}
                    style={{ backgroundColor:"#2563EB", paddingHorizontal:14, paddingVertical:10, borderRadius:12 }}
                  >
                    <Ionicons name="search" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
                {detailLoading ? (
                  <View style={{ alignItems:"center", paddingVertical:24 }}>
                    <ActivityIndicator color="#2563EB" />
                    <Text style={{ marginTop:12, color:"#64748B" }}>Memuat data…</Text>
                  </View>
                ) : (
                  <FlatList
                    data={detailModal.rows}
                    keyExtractor={(item, index) => item.key ? String(item.key) : `${detailModal.type || 'row'}-${index}`}
                    renderItem={({ item, index }) => (
                      <View style={{ flexDirection:"row", alignItems:"flex-start", paddingVertical:12, borderTopWidth: index === 0 ? 0 : 1, borderColor:"#E2E8F0" }}>
                        <View style={{ flex:1, paddingRight:12 }}>
                          <Text style={{ color:"#0F172A", fontWeight:"600" }}>{item.title}</Text>
                          {item.subtitle ? <Text style={{ color:"#64748B", fontSize:12, marginTop:4 }}>{item.subtitle}</Text> : null}
                        </View>
                        <View style={{ alignItems:"flex-end" }}>
                          {item.trailingPrimary ? <Text style={{ color:"#0F172A", fontWeight:"700" }}>{item.trailingPrimary}</Text> : null}
                          {item.trailingSecondary ? <Text style={{ color:"#94A3B8", fontSize:12, marginTop:4 }}>{item.trailingSecondary}</Text> : null}
                        </View>
                      </View>
                    )}
                    onEndReached={loadMoreDetail}
                    onEndReachedThreshold={0.6}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: detailHasMore ? 24 : 0 }}
                    style={{ maxHeight: 320 }}
                    ListFooterComponent={detailLoadingMore ? (
                      <View style={{ paddingVertical:16, alignItems:"center" }}>
                        <ActivityIndicator color="#2563EB" />
                      </View>
                    ) : null}
                    ListEmptyComponent={
                      <View style={{ paddingVertical:24 }}>
                        <Text style={{ color:"#94A3B8", textAlign:"center" }}>Belum ada data untuk ditampilkan.</Text>
                      </View>
                    }
                  />
                )}
              </>
            ) : detailLoading ? (
              <View style={{ alignItems:"center", paddingVertical:24 }}>
                <ActivityIndicator color="#2563EB" />
                <Text style={{ marginTop:12, color:"#64748B" }}>Memuat data…</Text>
              </View>
            ) : detailModal.rows.length ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {detailModal.rows.map((row, index) => (
                  <View
                    key={row.key ?? `${row.title}-${index}`}
                    style={{ flexDirection:"row", alignItems:"flex-start", paddingVertical:12, borderTopWidth: index === 0 ? 0 : 1, borderColor:"#E2E8F0" }}
                  >
                    <View style={{ flex:1, paddingRight:12 }}>
                      <Text style={{ color:"#0F172A", fontWeight:"600" }}>{row.title}</Text>
                      {row.subtitle ? <Text style={{ color:"#64748B", fontSize:12, marginTop:4 }}>{row.subtitle}</Text> : null}
                    </View>
                    <View style={{ alignItems:"flex-end" }}>
                      {row.trailingPrimary ? <Text style={{ color:"#0F172A", fontWeight:"700" }}>{row.trailingPrimary}</Text> : null}
                      {row.trailingSecondary ? <Text style={{ color:"#94A3B8", fontSize:12, marginTop:4 }}>{row.trailingSecondary}</Text> : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={{ paddingVertical:24 }}>
                <Text style={{ color:"#94A3B8", textAlign:"center" }}>Belum ada data untuk ditampilkan.</Text>
              </View>
            )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({ label, value, helper, icon, iconColor, backgroundColor, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexBasis: "48%",
        flexGrow: 1,
        minWidth: 160,
        backgroundColor: "#fff",
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        shadowColor: "#0F172A",
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>{value}</Text>
      {helper ? <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 6 }}>{helper}</Text> : null}
    </TouchableOpacity>
  );
}

function IconActionButton({ icon, label, backgroundColor = "#EEF2FF", iconColor = "#2563EB", onPress, onPressIn }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPressIn={onPressIn}
      onPress={onPress}
      style={{ alignItems: "center", width: 72 }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
          shadowColor: "#0F172A",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={{ fontSize: 11, textAlign: "center", color: "#475569" }}>{label}</Text>
    </TouchableOpacity>
  );
}

function DatePickerField({ label, value, onChange }) {
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const currentDate = parseDateString(value);

  const handlePick = selectedDate => {
    if (!selectedDate) return;
    onChange(formatDateInputValue(selectedDate));
  };

  const openPicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: "date",
        onChange: (_, selected) => {
          if (selected) handlePick(selected);
        },
      });
    } else {
      setShowIOSPicker(true);
    }
  };

  return (
    <View style={{ marginBottom:12 }}>
      <Text style={{ marginBottom:6, color:"#475569" }}>{label}</Text>
      <TouchableOpacity
        onPress={openPicker}
        style={{ backgroundColor:"#fff", borderWidth:1, borderColor:"#E5E7EB", borderRadius:12, paddingHorizontal:12, height:44, justifyContent:"center" }}
      >
        <Text style={{ color: value ? "#0F172A" : "#94A3B8" }}>
          {value ? formatDateDisplay(value) : "Pilih tanggal"}
        </Text>
      </TouchableOpacity>
      {Platform.OS === "ios" && showIOSPicker ? (
        <DateTimePicker
          value={currentDate}
          mode="date"
          display="spinner"
          onChange={(event, selected) => {
            if (event.type === "dismissed") {
              setShowIOSPicker(false);
              return;
            }
            if (selected) handlePick(selected);
            setShowIOSPicker(false);
          }}
          style={{ marginTop:8 }}
        />
      ) : null}
    </View>
  );
}

// ---------- Purchase Orders ----------

function PurchaseOrdersScreen({ navigation }) {
  const PAGE_SIZE = 20;
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  useEffect(() => {
    loadOrders({ search: searchTerm, reset: true });
  }, []);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      loadOrders({ search: searchTerm, reset: true });
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadOrders({ search: searchTerm, reset: true });
    });
    return unsubscribe;
  }, [navigation, searchTerm]);

  async function loadOrders({ search = searchTerm, reset = false, mode = "default" } = {}) {
    const normalizedSearch = (search || "").trim().toLowerCase();
    const isSearchChanged = normalizedSearch !== pagingRef.current.search;
    const shouldReset = reset || isSearchChanged;
    const offset = shouldReset ? 0 : pagingRef.current.offset;
    const limit = PAGE_SIZE + 1;
    const requestId = ++requestIdRef.current;

    if (mode === "refresh") setRefreshing(true);
    else if (mode === "loadMore") setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await exec(
        `
          SELECT id, supplier_name, orderer_name, item_name, quantity, price, status, order_date, note
          FROM purchase_orders
          WHERE (? = '' OR LOWER(item_name) LIKE ? OR LOWER(IFNULL(orderer_name,'')) LIKE ? OR LOWER(IFNULL(supplier_name,'')) LIKE ? OR LOWER(IFNULL(note,'')) LIKE ?)
          ORDER BY order_date DESC, id DESC
          LIMIT ? OFFSET ?
        `,
        [normalizedSearch, `%${normalizedSearch}%`, `%${normalizedSearch}%`, `%${normalizedSearch}%`, `%${normalizedSearch}%`, limit, offset],
      );
      if (requestId !== requestIdRef.current) return;
      const rowsArray = res.rows?._array ?? [];
      const pageOrders = rowsArray.slice(0, PAGE_SIZE).map(row => ({
        id: row.id,
        supplierName: row.supplier_name,
        ordererName: row.orderer_name,
        itemName: row.item_name,
        quantity: Number(row.quantity ?? 0),
        price: Number(row.price ?? 0),
        status: row.status,
        orderDate: row.order_date,
        note: row.note,
      }));
      const nextOffset = offset + pageOrders.length;
      setHasMore(rowsArray.length > PAGE_SIZE);
      setOrders(prev => (shouldReset ? pageOrders : [...prev, ...pageOrders]));
      pagingRef.current = { offset: nextOffset, search: normalizedSearch };
    } catch (error) {
      console.log("PO LOAD ERROR:", error);
    } finally {
      if (requestId === requestIdRef.current) {
        if (mode === "refresh") setRefreshing(false);
        else if (mode === "loadMore") setLoadingMore(false);
        else setLoading(false);
      }
    }
  }

  const handleRefresh = () => loadOrders({ search: searchTerm, reset: true, mode: "refresh" });
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadOrders({ search: searchTerm, reset: false, mode: "loadMore" });
    }
  };

  const renderItem = ({ item }) => {
    const totalValue = item.quantity * item.price;
    const statusStyle = getPOStatusStyle(item.status);
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate("PurchaseOrderDetail", { orderId: item.id, onDone: () => loadOrders({ search: searchTerm, reset: true }) })}
        style={{ backgroundColor: "#fff", padding: 16, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontWeight: "700", fontSize: 16, color: "#0F172A" }}>{item.itemName}</Text>
          <View style={{ backgroundColor: statusStyle.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: statusStyle.color }}>{statusStyle.label}</Text>
          </View>
        </View>
        <Text style={{ color: "#64748B", marginTop: 4 }}>
          {(item.ordererName && item.ordererName.trim()) ? item.ordererName : "Tanpa pemesan"}
          {item.supplierName ? ` • ${item.supplierName}` : ""}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
          <Text style={{ color: "#0F172A", fontWeight: "600" }}>{formatDateDisplay(item.orderDate)}</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontWeight: "700", color: "#0F172A" }}>{formatCurrencyValue(totalValue)}</Text>
            <Text style={{ color: "#94A3B8", fontSize: 12 }}>{`${formatNumberValue(item.quantity)} pcs @ ${formatCurrencyValue(item.price)}`}</Text>
          </View>
        </View>
        {item.note ? <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 10 }}>{item.note}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <View style={{ padding: 16, flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A" }}>Purchase Order</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("AddPurchaseOrder", { onDone: () => loadOrders({ search: searchTerm, reset: true }) })}
            style={{ backgroundColor: "#14B8A6", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>+ PO</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          placeholder="Cari nama barang, pemasok, atau catatan..."
          value={searchTerm}
          onChangeText={setSearchTerm}
          style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 12 }}
        />
        <FlatList
          data={orders}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color="#2563EB" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingVertical: 40 }}>
                <ActivityIndicator color="#2563EB" />
              </View>
            ) : (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Ionicons name="cart-outline" size={36} color="#CBD5F5" />
                <Text style={{ color: "#94A3B8", marginTop: 8 }}>
                  {searchTerm.trim() ? "Tidak ada purchase order yang cocok." : "Belum ada purchase order. Tambahkan untuk mulai mencatat!"}
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </View>
    </SafeAreaView>
  );
}

function AddPurchaseOrderScreen({ route, navigation }) {
  const onDone = route.params?.onDone;
  const [supplierName, setSupplierName] = useState("");
  const [ordererName, setOrdererName] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [orderDate, setOrderDate] = useState(formatDateInputValue(new Date()));
  const [status, setStatus] = useState("PROGRESS");
  const [note, setNote] = useState("");

  async function save() {
    if (!itemName.trim()) {
      return Alert.alert("Validasi", "Nama barang wajib diisi.");
    }
    const qty = parseNumberInput(quantity);
    if (qty <= 0) {
      return Alert.alert("Validasi", "Qty harus lebih besar dari 0.");
    }
    const priceValue = parseNumberInput(price);
    const trimmedDate = (orderDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      return Alert.alert("Validasi", "Tanggal harus dalam format YYYY-MM-DD.");
    }

    try {
      await exec(
        `INSERT INTO purchase_orders(supplier_name, orderer_name, item_name, quantity, price, order_date, status, note)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          supplierName || null,
          ordererName ? ordererName.trim() : null,
          itemName.trim(),
          qty,
          priceValue,
          trimmedDate,
          status,
          note ? note.trim() : null,
        ]
      );
      onDone && onDone();
      navigation.goBack();
    } catch (error) {
      console.log("PO SAVE ERROR:", error);
      Alert.alert("Gagal", "Purchase order tidak dapat disimpan. Coba lagi.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <FormScrollContainer contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Tambah Purchase Order</Text>
        <Input label="Nama Pemasok" value={supplierName} onChangeText={setSupplierName} placeholder="contoh: PT ABC" />
        <Input label="Nama Pemesan" value={ordererName} onChangeText={setOrdererName} placeholder="contoh: Budi Hartono" />
        <Input label="Nama Barang" value={itemName} onChangeText={setItemName} placeholder="contoh: Kardus 40x40" />
        <DatePickerField label="Tanggal" value={orderDate} onChange={setOrderDate} />
        <Input label="Qty" value={quantity} onChangeText={text => setQuantity(formatNumberInput(text))} keyboardType="numeric" placeholder="0" />
        <Input label="Harga Satuan" value={price} onChangeText={text => setPrice(formatNumberInput(text))} keyboardType="numeric" placeholder="0" />
        <View style={{ marginBottom: 12 }}>
          <Text style={{ marginBottom: 6, color: "#475569" }}>Status</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PO_STATUS_OPTIONS.map(option => {
              const active = option === status;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => setStatus(option)}
                  style={{
                    paddingHorizontal:16,
                    paddingVertical:10,
                    borderRadius:999,
                    borderWidth:1,
                    borderColor: active ? "#14B8A6" : "#CBD5F5",
                    backgroundColor: active ? "#CCFBF1" : "#fff",
                  }}
                >
                  <Text style={{ color: active ? "#0F766E" : "#475569", fontWeight:"600" }}>{PO_STATUS_STYLES[option]?.label || option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={{ marginBottom:12 }}>
          <Text style={{ marginBottom:6, color:"#475569" }}>Catatan (opsional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="contoh: Kirim pekan depan"
            multiline
            style={{ backgroundColor:"#fff", borderWidth:1, borderColor:"#E5E7EB", borderRadius:12, paddingHorizontal:12, paddingVertical:10, minHeight:80, textAlignVertical:"top" }}
          />
        </View>
        <TouchableOpacity onPress={save} style={{ marginTop: 8, backgroundColor: "#14B8A6", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Simpan PO</Text>
        </TouchableOpacity>
      </FormScrollContainer>
    </SafeAreaView>
  );
}

function EditPurchaseOrderScreen({ route, navigation }) {
  const { orderId, onDone } = route.params;
  const [loading, setLoading] = useState(true);
  const [supplierName, setSupplierName] = useState("");
  const [ordererName, setOrdererName] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [orderDate, setOrderDate] = useState(formatDateInputValue(new Date()));
  const [status, setStatus] = useState("PROGRESS");
  const [note, setNote] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await exec(`SELECT * FROM purchase_orders WHERE id = ?`, [orderId]);
        if (!res.rows.length) {
          Alert.alert("Tidak ditemukan", "Purchase order tidak tersedia.", [{ text: "OK", onPress: () => navigation.goBack() }]);
          return;
        }
        const row = res.rows.item(0);
        setSupplierName(row.supplier_name || "");
        setOrdererName(row.orderer_name || "");
        setItemName(row.item_name || "");
        setQuantity(formatNumberInput(String(row.quantity ?? "")));
        setPrice(formatNumberInput(String(row.price ?? "")));
        setOrderDate(row.order_date ? formatDateInputValue(row.order_date) : formatDateInputValue(new Date()));
        setStatus(row.status || "PROGRESS");
        setNote(row.note || "");
      } catch (error) {
        console.log("PO EDIT LOAD ERROR:", error);
        Alert.alert("Gagal", "Tidak dapat memuat purchase order.");
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId, navigation]);

  async function save() {
    if (!itemName.trim()) {
      return Alert.alert("Validasi", "Nama barang wajib diisi.");
    }
    const qty = parseNumberInput(quantity);
    if (qty <= 0) {
      return Alert.alert("Validasi", "Qty harus lebih besar dari 0.");
    }
    const priceValue = parseNumberInput(price);
    const trimmedDate = (orderDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      return Alert.alert("Validasi", "Tanggal harus dalam format YYYY-MM-DD.");
    }

    try {
      await exec(
        `UPDATE purchase_orders
         SET supplier_name = ?, orderer_name = ?, item_name = ?, quantity = ?, price = ?, order_date = ?, status = ?, note = ?
         WHERE id = ?`,
        [
          supplierName || null,
          ordererName ? ordererName.trim() : null,
          itemName.trim(),
          qty,
          priceValue,
          trimmedDate,
          status,
          note ? note.trim() : null,
          orderId,
        ]
      );
      onDone && onDone();
      navigation.goBack();
    } catch (error) {
      console.log("PO EDIT SAVE ERROR:", error);
      Alert.alert("Gagal", "Perubahan tidak dapat disimpan.");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:"#F8FAFC", alignItems:"center", justifyContent:"center" }}>
        <ActivityIndicator color="#2563EB" />
        <Text style={{ marginTop:12, color:"#64748B" }}>Memuat data…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <FormScrollContainer contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Edit Purchase Order</Text>
        <Input label="Nama Pemasok" value={supplierName} onChangeText={setSupplierName} placeholder="contoh: PT ABC" />
        <Input label="Nama Pemesan" value={ordererName} onChangeText={setOrdererName} placeholder="contoh: Budi Hartono" />
        <Input label="Nama Barang" value={itemName} onChangeText={setItemName} placeholder="contoh: Kardus 40x40" />
        <DatePickerField label="Tanggal" value={orderDate} onChange={setOrderDate} />
        <Input label="Qty" value={quantity} onChangeText={text => setQuantity(formatNumberInput(text))} keyboardType="numeric" placeholder="0" />
        <Input label="Harga Satuan" value={price} onChangeText={text => setPrice(formatNumberInput(text))} keyboardType="numeric" placeholder="0" />
        <View style={{ marginBottom: 12 }}>
          <Text style={{ marginBottom: 6, color: "#475569" }}>Status</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PO_STATUS_OPTIONS.map(option => {
              const active = option === status;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => setStatus(option)}
                  style={{
                    paddingHorizontal:16,
                    paddingVertical:10,
                    borderRadius:999,
                    borderWidth:1,
                    borderColor: active ? "#14B8A6" : "#CBD5F5",
                    backgroundColor: active ? "#CCFBF1" : "#fff",
                  }}
                >
                  <Text style={{ color: active ? "#0F766E" : "#475569", fontWeight:"600" }}>{PO_STATUS_STYLES[option]?.label || option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={{ marginBottom:12 }}>
          <Text style={{ marginBottom:6, color:"#475569" }}>Catatan (opsional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="contoh: Kirim pekan depan"
            multiline
            style={{ backgroundColor:"#fff", borderWidth:1, borderColor:"#E5E7EB", borderRadius:12, paddingHorizontal:12, paddingVertical:10, minHeight:80, textAlignVertical:"top" }}
          />
        </View>
        <TouchableOpacity onPress={save} style={{ marginTop: 8, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Simpan Perubahan</Text>
        </TouchableOpacity>
      </FormScrollContainer>
    </SafeAreaView>
  );
}

function PurchaseOrderDetailScreen({ route, navigation }) {
  const { orderId, onDone } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const invoicePreviewRef = useRef(null);
  const previewWidth = Math.min(Dimensions.get('window').width - 48, 640);
  const actionHintTimeout = useRef(null);
  const [actionHint, setActionHint] = useState('');

  async function load() {
    try {
      setLoading(true);
      const res = await exec(`SELECT * FROM purchase_orders WHERE id = ?`, [orderId]);
      if (res.rows.length) {
        const row = res.rows.item(0);
        setOrder({
          id: row.id,
          supplierName: row.supplier_name,
          ordererName: row.orderer_name,
          itemName: row.item_name,
          quantity: Number(row.quantity ?? 0),
          price: Number(row.price ?? 0),
          status: row.status,
          orderDate: row.order_date,
          note: row.note,
          createdAt: row.created_at,
        });
      } else {
        setOrder(null);
      }
    } catch (error) {
      console.log("PO DETAIL LOAD ERROR:", error);
      Alert.alert("Gagal", "Tidak dapat memuat detail PO.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => {
      if (actionHintTimeout.current) clearTimeout(actionHintTimeout.current);
    };
  }, [orderId]);

  async function updateStatus(nextStatus) {
    try {
      await exec(`UPDATE purchase_orders SET status = ? WHERE id = ?`, [nextStatus, orderId]);
      onDone && onDone();
      load();
    } catch (error) {
      console.log("PO UPDATE STATUS ERROR:", error);
      Alert.alert("Gagal", "Status tidak dapat diperbarui.");
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Hapus Purchase Order",
      "Yakin ingin menghapus purchase order ini?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: deleteOrder,
        },
      ]
    );
  }

  async function deleteOrder() {
    try {
      await exec(`DELETE FROM purchase_orders WHERE id = ?`, [orderId]);
      onDone && onDone();
      navigation.goBack();
    } catch (error) {
      console.log("PO DELETE ERROR:", error);
      Alert.alert("Gagal", "Purchase order tidak dapat dihapus.");
    }
  }

  function showActionHint(label) {
    if (!label) return;
    if (actionHintTimeout.current) clearTimeout(actionHintTimeout.current);
    setActionHint(label);
    actionHintTimeout.current = setTimeout(() => setActionHint(''), 1200);
  }

  async function generateInvoicePdf() {
    try {
      const fileBaseName = buildPOFileBase(order);
      const escapeHtml = text => (text ?? "").toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const formattedDate = formatDateDisplay(order.orderDate);
      const createdDate = formatDateDisplay(order.createdAt);
      const qtyFormatted = formatNumberValue(order.quantity);
      const priceFormatted = formatCurrencyValue(order.price);
      const totalFormatted = formatCurrencyValue(totalValue);
      const noteHtml = order.note ? escapeHtml(order.note).replace(/\n/g, '<br/>') : '';
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              :root {
                color-scheme: light;
              }
              body {
                margin: 0;
                font-family: 'Poppins', 'Helvetica', sans-serif;
                background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
                padding: 32px;
                color: #0f172a;
              }
              .card {
                max-width: 640px;
                margin: 0 auto;
                background: #fff;
                border-radius: 24px;
                padding: 32px;
                box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
              }
              .card__header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 20px;
                margin-bottom: 24px;
              }
              .badge {
                border-radius: 999px;
                padding: 8px 18px;
                background: ${statusStyle.background};
                color: ${statusStyle.color};
                font-weight: 600;
              }
              h1 {
                font-size: 24px;
                margin: 0 0 8px;
              }
              .meta {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                gap: 12px 24px;
                margin-bottom: 24px;
              }
              .meta p {
                margin: 0;
                font-size: 14px;
                color: #475569;
              }
              .meta strong {
                display: block;
                color: #0f172a;
                font-size: 15px;
                margin-bottom: 4px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                border-radius: 16px;
                overflow: hidden;
                margin-bottom: 24px;
              }
              thead {
                background: #f1f5f9;
              }
              th {
                padding: 14px 16px;
                text-align: left;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #475569;
              }
              td {
                padding: 16px;
                border-bottom: 1px solid #e2e8f0;
                font-size: 15px;
                color: #0f172a;
              }
              tbody tr:last-child td {
                border-bottom: none;
              }
              .summary {
                margin-top: 12px;
                color: #64748b;
                font-size: 14px;
              }
              .summary strong {
                color: #0f172a;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="card__header">
                <div>
                  <p style="letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin: 0 0 6px;">Invoice</p>
                  <h1>Purchase Order</h1>
                </div>
                <span class="badge">${escapeHtml(statusStyle.label)}</span>
              </div>
              <div class="meta">
                <p><strong>No. PO</strong>${escapeHtml(String(order.id))}</p>
                <p><strong>Tanggal PO</strong>${escapeHtml(formattedDate)}</p>
                <p><strong>Pemesan</strong>${escapeHtml(order.ordererName || '-')}</p>
                <p><strong>Nilai Total</strong>${totalFormatted}</p>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th>Qty</th>
                    <th>Harga</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${escapeHtml(order.itemName)}</td>
                    <td>${qtyFormatted} pcs</td>
                    <td>${priceFormatted}</td>
                    <td>${totalFormatted}</td>
                  </tr>
                </tbody>
              </table>
              ${order.note ? `<div class="summary"><strong>Catatan:</strong> ${noteHtml}</div>` : ''}
              <div class="summary">Dibuat pada <strong>${escapeHtml(createdDate)}</strong></div>
            </div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html, base64: false, fileName: fileBaseName });
      const {
        uri: savedUri,
        location: savedLocation,
        notice: savedNotice,
        displayPath: savedDisplayPath,
      } = await saveFileToStorage(
        uri,
        `${fileBaseName}.pdf`,
        'application/pdf'
      );
      if (await Sharing.isAvailableAsync()) {
        const resolvedShareUri = await resolveShareableUri(
          `${fileBaseName}-share.pdf`,
          uri,
          savedUri
        );
        if (resolvedShareUri) {
          await Sharing.shareAsync(resolvedShareUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Bagikan Invoice Purchase Order',
            UTI: 'com.adobe.pdf',
          });
        } else {
          console.log('SHARE URI NOT AVAILABLE FOR PDF');
        }
      }
      const locationMessage = savedDisplayPath
        ? `File tersimpan di ${savedDisplayPath}.`
        : savedLocation === 'external'
          ? 'File tersimpan di folder yang kamu pilih.'
          : `File tersimpan di ${savedUri}.`;
      const alertMessage = savedNotice ? `${savedNotice}\n\n${locationMessage}` : locationMessage;
      Alert.alert('Invoice Disimpan', alertMessage);
    } catch (error) {
      console.log('PO PDF ERROR:', error);
      Alert.alert('Gagal', 'Invoice tidak dapat dibuat saat ini.');
    }
  }

  async function generateInvoiceImage() {
    try {
      if (!invoicePreviewRef.current) {
        Alert.alert('Gagal', 'Pratinjau invoice belum siap.');
        return;
      }
      const tempUri = await captureRef(invoicePreviewRef.current, {
        format: 'png',
        quality: 1,
      });
      const fileBaseName = buildPOFileBase(order);
      const fileName = `${fileBaseName}.png`;
      const {
        uri: savedUri,
        location: savedLocation,
        notice: savedNotice,
        displayPath: savedDisplayPath,
      } = await saveFileToStorage(
        tempUri,
        fileName,
        'image/png'
      );
      if (await Sharing.isAvailableAsync()) {
        const resolvedShareUri = await resolveShareableUri(
          `${fileBaseName}-share.png`,
          tempUri,
          savedUri
        );
        if (resolvedShareUri) {
          await Sharing.shareAsync(resolvedShareUri, {
            mimeType: 'image/png',
            dialogTitle: 'Bagikan Invoice PO (PNG)',
          });
        } else {
          console.log('SHARE URI NOT AVAILABLE FOR IMAGE');
        }
      }
      const locationMessage = savedDisplayPath
        ? `File tersimpan di ${savedDisplayPath}.`
        : savedLocation === 'external'
          ? 'File tersimpan di folder yang kamu pilih.'
          : `File tersimpan di ${savedUri}.`;
      const alertMessage = savedNotice ? `${savedNotice}\n\n${locationMessage}` : locationMessage;
      Alert.alert('Gambar Disimpan', alertMessage);
    } catch (error) {
      console.log('PO IMAGE ERROR:', error);
      Alert.alert('Gagal', 'Gambar invoice tidak dapat dibuat.');
    }
  }

  const InvoicePreview = () => (
    <View
      style={{ width: previewWidth, padding: 20, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#0F172A' }}>Invoice Purchase Order</Text>
          <Text style={{ color: '#64748B', marginTop: 4 }}>No. PO #{order.id}</Text>
        </View>
        <View style={{ backgroundColor: statusStyle.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
          <Text style={{ color: statusStyle.color, fontWeight: '700', fontSize: 12 }}>{statusStyle.label}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, marginBottom: 16 }}>
        <Text style={{ color: '#0F172A', fontWeight: '600' }}>{order.itemName}</Text>
        <Text style={{ color: '#64748B', marginTop: 6 }}>Pemesan: {order.ordererName || '-'}</Text>
        <Text style={{ color: '#64748B', marginTop: 4 }}>Tanggal: {formatDateDisplay(order.orderDate)}</Text>
      </View>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', paddingVertical: 10, paddingHorizontal: 12 }}>
          <Text style={{ flex: 3, fontWeight: '600', color: '#475569' }}>Deskripsi</Text>
          <Text style={{ flex: 1, fontWeight: '600', color: '#475569', textAlign: 'right' }}>Qty</Text>
          <Text style={{ flex: 1.2, fontWeight: '600', color: '#475569', textAlign: 'right' }}>Harga</Text>
          <Text style={{ flex: 1.2, fontWeight: '600', color: '#475569', textAlign: 'right' }}>Total</Text>
        </View>
        <View style={{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center' }}>
          <Text style={{ flex: 3, color: '#0F172A' }}>{order.itemName}</Text>
          <Text style={{ flex: 1, color: '#0F172A', textAlign: 'right' }}>{formatNumberValue(order.quantity)} pcs</Text>
          <Text style={{ flex: 1.2, color: '#0F172A', textAlign: 'right' }}>{formatCurrencyValue(order.price)}</Text>
          <Text style={{ flex: 1.2, color: '#0F172A', fontWeight: '600', textAlign: 'right' }}>{formatCurrencyValue(totalValue)}</Text>
        </View>
      </View>
      {order.note ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: '#64748B', fontWeight: '600' }}>Catatan</Text>
          <Text style={{ color: '#0F172A', marginTop: 4 }}>{order.note}</Text>
        </View>
      ) : null}
      <View style={{ marginTop: 16 }}>
        <Text style={{ color: '#94A3B8', fontSize: 12 }}>Dibuat pada {formatDateDisplay(order.createdAt)}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:"#F8FAFC", alignItems:"center", justifyContent:"center" }}>
        <ActivityIndicator color="#2563EB" />
        <Text style={{ marginTop:12, color:"#64748B" }}>Memuat detail…</Text>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex:1, backgroundColor:"#F8FAFC", alignItems:"center", justifyContent:"center", padding:16 }}>
        <Ionicons name="cart-outline" size={42} color="#CBD5F5" />
        <Text style={{ marginTop:12, color:"#94A3B8", textAlign:"center" }}>Purchase order tidak ditemukan.</Text>
      </SafeAreaView>
    );
  }

  const totalValue = order.quantity * order.price;
  const statusStyle = getPOStatusStyle(order.status);

  const actionButtons = [
    {
      key: 'pdf',
      icon: 'document-text-outline',
      label: 'PDF',
      backgroundColor: '#EEF2FF',
      iconColor: '#6366F1',
      onPress: generateInvoicePdf,
      tooltip: 'Generate Invoice (PDF)',
    },
    {
      key: 'png',
      icon: 'image-outline',
      label: 'PNG',
      backgroundColor: '#E0F2FE',
      iconColor: '#0284C7',
      onPress: generateInvoiceImage,
      tooltip: 'Simpan sebagai Gambar',
    },
    {
      key: 'edit',
      icon: 'create-outline',
      label: 'Edit',
      backgroundColor: '#E0E7FF',
      iconColor: '#4338CA',
      onPress: () => navigation.navigate('EditPurchaseOrder', { orderId, onDone: () => { onDone && onDone(); load(); } }),
      tooltip: 'Edit Purchase Order',
    },
  ];

  if (order.status !== 'DONE') {
    actionButtons.push({
      key: 'done',
      icon: 'checkmark-done-outline',
      label: 'Done',
      backgroundColor: '#DCFCE7',
      iconColor: '#15803D',
      onPress: () => updateStatus('DONE'),
      tooltip: 'Tandai selesai',
    });
  }
  if (order.status !== 'PROGRESS') {
    actionButtons.push({
      key: 'progress',
      icon: 'sync-outline',
      label: 'Progress',
      backgroundColor: '#DBEAFE',
      iconColor: '#2563EB',
      onPress: () => updateStatus('PROGRESS'),
      tooltip: 'Kembalikan ke progress',
    });
  }
  if (order.status !== 'CANCELLED') {
    actionButtons.push({
      key: 'cancel',
      icon: 'close-circle-outline',
      label: 'Cancel',
      backgroundColor: '#FEE2E2',
      iconColor: '#DC2626',
      onPress: () => updateStatus('CANCELLED'),
      tooltip: 'Batalkan PO',
    });
  }
  actionButtons.push({
    key: 'delete',
    icon: 'trash-outline',
    label: 'Hapus',
    backgroundColor: '#FFE4E6',
    iconColor: '#E11D48',
    onPress: confirmDelete,
    tooltip: 'Hapus PO',
  });

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:"#F8FAFC" }}>
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:32 }}>
        <View style={{ backgroundColor:"#fff", padding:18, borderRadius:16, borderWidth:1, borderColor:"#E2E8F0", marginBottom:16 }}>
          <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
            <Text style={{ fontSize:20, fontWeight:"700", color:"#0F172A" }}>{order.itemName}</Text>
            <View style={{ backgroundColor: statusStyle.background, paddingHorizontal:12, paddingVertical:6, borderRadius:999 }}>
              <Text style={{ color: statusStyle.color, fontWeight:"600" }}>{statusStyle.label}</Text>
            </View>
          </View>
          <View style={{ marginTop:16, gap:12 }}>
            <DetailRow label="Pemasok" value={order.supplierName || "-"} />
          <DetailRow label="Pemesan" value={order.ordererName || "-"} />
          <DetailRow label="Tanggal PO" value={formatDateDisplay(order.orderDate)} />
          <DetailRow label="Qty" value={`${formatNumberValue(order.quantity)} pcs`} />
          <DetailRow label="Harga Satuan" value={formatCurrencyValue(order.price)} />
          <DetailRow label="Nilai Total" value={formatCurrencyValue(totalValue)} bold />
            <DetailRow label="Dibuat" value={formatDateDisplay(order.createdAt)} />
            <DetailRow label="Catatan" value={order.note || "-"} multiline />
          </View>
        </View>

        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:16, rowGap:18 }}>
          {actionButtons.map(action => (
            <IconActionButton
              key={action.key}
              icon={action.icon}
              label={action.label}
              backgroundColor={action.backgroundColor}
              iconColor={action.iconColor}
              onPress={action.onPress}
              onPressIn={() => showActionHint(action.tooltip)}
            />
          ))}
        </View>
      </ScrollView>
      <View style={{ position:"absolute", top:-9999, left:-9999 }}>
        <View ref={invoicePreviewRef} collapsable={false}>
          {order ? <InvoicePreview /> : null}
        </View>
      </View>
      {actionHint ? (
        <View style={{ position:"absolute", bottom:24, left:0, right:0, alignItems:"center", pointerEvents:"none" }}>
          <View style={{ backgroundColor:"rgba(15,23,42,0.92)", paddingHorizontal:16, paddingVertical:8, borderRadius:999 }}>
            <Text style={{ color:"#fff", fontWeight:"600" }}>{actionHint}</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function DetailRow({ label, value, bold = false, multiline = false }) {
  return (
    <View>
      <Text style={{ color:"#94A3B8", fontSize:12, marginBottom:4 }}>{label}</Text>
      <Text style={{ color:"#0F172A", fontWeight: bold ? "700" : "500", lineHeight: multiline ? 22 : 18 }}>{value}</Text>
    </View>
  );
}

// ---------- Barang (List) ----------

function ItemsScreen({ navigation }) {
  const PAGE_SIZE = 20;
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  useEffect(() => {
    loadItems({ search: searchTerm, reset: true });
  }, []);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      loadItems({ search: searchTerm, reset: true });
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadItems({ search: searchTerm, reset: true });
    });
    return unsubscribe;
  }, [navigation, searchTerm]);

  async function loadItems({ search = searchTerm, reset = false, mode = "default" } = {}) {
    const normalizedSearch = (search || "").trim().toLowerCase();
    const isSearchChanged = normalizedSearch !== pagingRef.current.search;
    const shouldReset = reset || isSearchChanged;
    const offset = shouldReset ? 0 : pagingRef.current.offset;
    const limit = PAGE_SIZE + 1;
    const requestId = ++requestIdRef.current;

    if (mode === "refresh") setRefreshing(true);
    else if (mode === "loadMore") setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await exec(
        `
          SELECT id, name, category, price, stock
          FROM items
          WHERE (? = '' OR LOWER(name) LIKE ? OR LOWER(IFNULL(category,'')) LIKE ?)
          ORDER BY id DESC
          LIMIT ? OFFSET ?
        `,
        [normalizedSearch, `%${normalizedSearch}%`, `%${normalizedSearch}%`, limit, offset],
      );
      if (requestId !== requestIdRef.current) return;
      const rowsArray = res.rows?._array ?? [];
      const pageItems = rowsArray.slice(0, PAGE_SIZE).map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        price: Number(row.price ?? 0),
        stock: Number(row.stock ?? 0),
      }));
      const nextOffset = offset + pageItems.length;
      setHasMore(rowsArray.length > PAGE_SIZE);
      setItems(prev => (shouldReset ? pageItems : [...prev, ...pageItems]));
      pagingRef.current = { offset: nextOffset, search: normalizedSearch };
    } catch (error) {
      console.log("ITEMS LOAD ERROR:", error);
    } finally {
      if (requestId === requestIdRef.current) {
        if (mode === "refresh") setRefreshing(false);
        else if (mode === "loadMore") setLoadingMore(false);
        else setLoading(false);
      }
    }
  }

  function confirmDelete(item) {
    Alert.alert(
      "Hapus Barang",
      `Yakin ingin menghapus ${item.name}? Data riwayat stok juga akan dihapus.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => performDelete(item.id),
        },
      ],
    );
  }

  async function performDelete(id) {
    try {
      await exec(`DELETE FROM stock_history WHERE item_id = ?`, [id]);
      await exec(`DELETE FROM items WHERE id = ?`, [id]);
      await loadItems({ search: searchTerm, reset: true });
    } catch (error) {
      console.log("DELETE ITEM ERROR:", error);
      Alert.alert("Gagal", "Barang tidak dapat dihapus. Silakan coba lagi.");
    }
  }

  const handleRefresh = () => loadItems({ search: searchTerm, reset: true, mode: "refresh" });
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadItems({ search: searchTerm, reset: false, mode: "loadMore" });
    }
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:"#F8FAFC" }}>
      <View style={{ padding:16, flex:1 }}>
        <View style={{ flexDirection:"row", gap:8, marginBottom:12 }}>
          <TextInput
            placeholder="Cari nama/kategori…"
            value={searchTerm}
            onChangeText={setSearchTerm}
            style={{ flex:1, backgroundColor:"#fff", borderWidth:1, borderColor:"#E5E7EB", borderRadius:12, paddingHorizontal:12, height:44 }}
          />
          <TouchableOpacity
            onPress={() => navigation.navigate("AddItem", { onDone: () => loadItems({ search: searchTerm, reset: true }) })}
            style={{ backgroundColor:"#10B981", paddingHorizontal:16, borderRadius:12, alignItems:"center", justifyContent:"center" }}
          >
            <Text style={{ color:"#fff", fontWeight:"700" }}>+ Barang</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={items}
          keyExtractor={it => String(it.id)}
          renderItem={({ item }) => (
            <View style={{ backgroundColor:"#fff", padding:12, borderRadius:12, borderWidth:1, borderColor:"#E5E7EB", marginBottom:10 }}>
              <Text style={{ fontWeight:"700" }}>{item.name}</Text>
              <Text style={{ color:"#64748B" }}>{item.category || "-"}</Text>
              <View style={{ flexDirection:"row", justifyContent:"space-between", marginTop:6 }}>
                <Text>Harga: Rp {Number(item.price).toLocaleString("id-ID")}</Text>
                <Text>Stok: {item.stock}</Text>
              </View>
              <View style={{ flexDirection:"row", gap:8, marginTop:10 }}>
                <Btn onPress={() => navigation.navigate("StockMove", { item, mode: "IN", onDone: () => loadItems({ search: searchTerm, reset: true }) })} label="Masuk" color="#2563EB" />
                <Btn onPress={() => navigation.navigate("StockMove", { item, mode: "OUT", onDone: () => loadItems({ search: searchTerm, reset: true }) })} label="Keluar" color="#EF4444" />
                <TouchableOpacity
                  onPress={() => navigation.navigate("AddItem", { item, onDone: () => loadItems({ search: searchTerm, reset: true }) })}
                  style={{ flexDirection:"row", alignItems:"center", paddingVertical:10, paddingHorizontal:14, borderRadius:10,borderWidth:1, borderColor:"#3B82F6", backgroundColor:"#fff" }}
                >
                  <Ionicons name="create-outline" size={18} color="#3B82F6" style={{ marginRight:6 }} />
                  <Text style={{ color:"#3B82F6", fontWeight:"700" }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDelete(item)}
                  style={{ flexDirection:"row", alignItems:"center", paddingVertical:10, paddingHorizontal:14, borderRadius:10,borderWidth:1, borderColor:"#F87171", backgroundColor:"#fff" }}
                >
                  <Ionicons name="trash-outline" size={18} color="#F87171" style={{ marginRight:6 }} />
                  <Text style={{ color:"#F87171", fontWeight:"700" }}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical:16 }}>
                <ActivityIndicator color="#2563EB" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingVertical:40 }}>
                <ActivityIndicator color="#2563EB" />
              </View>
            ) : (
              <View style={{ paddingVertical:40, alignItems:"center" }}>
                <Ionicons name="cube-outline" size={32} color="#CBD5F5" />
                <Text style={{ color:"#94A3B8", marginTop:8 }}>
                  {searchTerm.trim() ? "Tidak ada barang yang cocok." : "Belum ada barang tersimpan."}
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom:40 }}
        />
      </View>
    </SafeAreaView>
  );
}
function Btn({ label, onPress, color="#2563EB" }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ backgroundColor:color, paddingVertical:10, paddingHorizontal:14, borderRadius:10 }}>
      <Text style={{ color:"#fff", fontWeight:"700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------- Tambah Barang ----------

function AddItemScreen({ route, navigation }) {
  const onDone = route.params?.onDone;
  const initialItem = route.params?.item || null;
  const [itemId, setItemId] = useState(initialItem?.id ?? null);
  const [name, setName] = useState(initialItem?.name ?? "");
  const [category, setCategory] = useState(initialItem?.category ?? "");
  const [price, setPrice] = useState(initialItem ? formatNumberInput(String(initialItem.price ?? "")) : "");
  const [stock, setStock] = useState(initialItem ? formatNumberInput(String(initialItem.stock ?? "")) : "");

  useEffect(() => {
    if (initialItem) {
      setItemId(initialItem.id);
      setName(initialItem.name || "");
      setCategory(initialItem.category || "");
      setPrice(formatNumberInput(String(initialItem.price ?? "")));
      setStock(formatNumberInput(String(initialItem.stock ?? "")));
      navigation.setOptions({ title: "Edit Barang" });
    } else {
      resetForm();
    }
  }, [initialItem?.id, navigation]);

  function resetForm() {
    setItemId(null);
    setName("");
    setCategory("");
    setPrice("");
    setStock("");
    navigation.setOptions({ title: "Tambah Barang" });
  }

  const isEdit = Boolean(itemId);

  async function save() {
    if (!name) return Alert.alert("Validasi", "Nama barang wajib diisi.");
    const p = parseNumberInput(price);
    const s = parseNumberInput(stock);
    if (isEdit) {
      await exec(`UPDATE items SET name = ?, category = ?, price = ?, stock = ? WHERE id = ?`, [name, category, p, s, itemId]);
    } else {
      await exec(`INSERT INTO items(name, category, price, stock) VALUES (?,?,?,?)`, [name, category, p, s]);
      if (s > 0) {
        const res = await exec(`SELECT last_insert_rowid() as id`);
        const id = res.rows.item(0).id;
        await exec(`INSERT INTO stock_history(item_id, type, qty, note) VALUES (?,?,?,?)`, [id, "IN", s, "Init stock"]);
      }
    }
    onDone && onDone();
    navigation.goBack();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <FormScrollContainer contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>{isEdit ? "Edit Barang" : "Tambah Barang"}</Text>
        <Input label="Nama" value={name} onChangeText={setName} />
        <Input label="Kategori" value={category} onChangeText={setCategory} />
        <Input label="Harga (Rp)" value={price} onChangeText={text => setPrice(formatNumberInput(text))} keyboardType="numeric" placeholder="0" />
        <Input label="Stok" value={stock} onChangeText={text => setStock(formatNumberInput(text))} keyboardType="numeric" />
        <TouchableOpacity onPress={save} style={{ marginTop: 16, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>{isEdit ? "Simpan Perubahan" : "Simpan"}</Text>
        </TouchableOpacity>
        {isEdit ? (
          <TouchableOpacity onPress={resetForm} style={{ marginTop: 12, paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#CBD5F5" }}>
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Buat Item Baru</Text>
          </TouchableOpacity>
        ) : null}
      </FormScrollContainer>
    </SafeAreaView>
  );
}
function Input({ label, ...props }) {
  return (
    <View style={{ marginBottom:12 }}>
      <Text style={{ marginBottom:6, color:"#475569" }}>{label}</Text>
      <TextInput {...props}
        style={{ backgroundColor:"#fff", borderWidth:1, borderColor:"#E5E7EB", borderRadius:12, paddingHorizontal:12, height:44 }} />
    </View>
  );
}

// ---------- Pergerakan Stok (Masuk/Keluar) ----------
function StockMoveScreen({ route, navigation }) {
  const { item, mode, onDone } = route.params;
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  async function commit() {
    const q = parseInt(qty || "0", 10);
    if (q <= 0) return Alert.alert("Validasi", "Qty harus > 0.");
    if (mode === "OUT" && q > item.stock) return Alert.alert("Stok Tidak Cukup", `Stok tersedia ${item.stock}`);
    await exec(`INSERT INTO stock_history(item_id, type, qty, note) VALUES (?,?,?,?)`, [item.id, mode, q, note || null]);
    if (mode === "IN") await exec(`UPDATE items SET stock = stock + ? WHERE id = ?`, [q, item.id]);
    else await exec(`UPDATE items SET stock = stock - ? WHERE id = ?`, [q, item.id]);
    onDone && onDone(); navigation.goBack();
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <FormScrollContainer contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 6 }}>{mode === "IN" ? "Barang Masuk" : "Barang Keluar"}</Text>
        <Text style={{ color: "#64748B" }}>{item.name} • Stok: {item.stock}</Text>
        <Input label="Qty" value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Input label="Catatan (opsional)" value={note} onChangeText={setNote} />
        <TouchableOpacity
          onPress={commit}
          style={{ marginTop: 16, backgroundColor: mode === "IN" ? "#2563EB" : "#EF4444", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>{mode === "IN" ? "Simpan Masuk" : "Simpan Keluar"}</Text>
        </TouchableOpacity>
      </FormScrollContainer>
    </SafeAreaView>
  );
}

// ---------- History ----------

function HistoryScreen() {
  const PAGE_SIZE = 30;
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  useEffect(() => {
    loadHistory({ search: searchTerm, reset: true });
  }, []);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      loadHistory({ search: searchTerm, reset: true });
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  async function loadHistory({ search = searchTerm, reset = false, mode = "default" } = {}) {
    const normalizedSearch = (search || "").trim().toLowerCase();
    const isSearchChanged = normalizedSearch !== pagingRef.current.search;
    const shouldReset = reset || isSearchChanged;
    const offset = shouldReset ? 0 : pagingRef.current.offset;
    const limit = PAGE_SIZE + 1;
    const requestId = ++requestIdRef.current;

    if (mode === "refresh") setRefreshing(true);
    else if (mode === "loadMore") setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await exec(
        `
          SELECT h.id, h.type, h.qty, h.note, h.created_at, i.name
          FROM stock_history h JOIN items i ON i.id = h.item_id
          WHERE (? = '' OR LOWER(i.name) LIKE ? OR LOWER(IFNULL(h.note,'')) LIKE ? OR LOWER(h.type) LIKE ?)
          ORDER BY h.id DESC
          LIMIT ? OFFSET ?
        `,
        [normalizedSearch, `%${normalizedSearch}%`, `%${normalizedSearch}%`, `%${normalizedSearch}%`, limit, offset],
      );
      if (requestId !== requestIdRef.current) return;
      const rowsArray = res.rows?._array ?? [];
      const pageRows = rowsArray.slice(0, PAGE_SIZE).map(row => ({
        id: row.id,
        type: row.type,
        qty: Number(row.qty ?? 0),
        note: row.note,
        created_at: row.created_at,
        name: row.name,
      }));
      const nextOffset = offset + pageRows.length;
      setHasMore(rowsArray.length > PAGE_SIZE);
      setRows(prev => (shouldReset ? pageRows : [...prev, ...pageRows]));
      pagingRef.current = { offset: nextOffset, search: normalizedSearch };
    } catch (error) {
      console.log("HISTORY LOAD ERROR:", error);
    } finally {
      if (requestId === requestIdRef.current) {
        if (mode === "refresh") setRefreshing(false);
        else if (mode === "loadMore") setLoadingMore(false);
        else setLoading(false);
      }
    }
  }

  const handleRefresh = () => loadHistory({ search: searchTerm, reset: true, mode: "refresh" });
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadHistory({ search: searchTerm, reset: false, mode: "loadMore" });
    }
  };

  const renderItem = ({ item }) => (
    <View style={{ backgroundColor:"#fff", padding:12, borderRadius:12, borderWidth:1, borderColor:"#E5E7EB", marginBottom:10 }}>
      <Text style={{ fontWeight:"700" }}>{item.name}</Text>
      <Text style={{ color:item.type === "IN" ? "#2563EB" : "#EF4444", fontWeight:"700" }}>{item.type} • Qty {item.qty}</Text>
      {!!item.note && <Text style={{ color:"#64748B" }}>{item.note}</Text>}
      <Text style={{ color:"#94A3B8", marginTop:4 }}>{item.created_at}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:"#F8FAFC", padding:16 }}>
      <Text style={{ fontSize:20, fontWeight:"700", marginBottom:12 }}>History</Text>
      <TextInput
        placeholder="Cari nama, catatan, atau tipe..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={{ backgroundColor:"#fff", borderWidth:1, borderColor:"#E5E7EB", borderRadius:12, paddingHorizontal:12, height:44, marginBottom:12 }}
      />
      <FlatList
        data={rows}
        keyExtractor={it => String(it.id)}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical:16 }}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical:40 }}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : (
            <View style={{ paddingVertical:40, alignItems:"center" }}>
              <Ionicons name="time-outline" size={32} color="#CBD5F5" />
              <Text style={{ color:"#94A3B8", marginTop:8 }}>
                {searchTerm.trim() ? "Tidak ada riwayat yang cocok." : "Belum ada riwayat stok."}
              </Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom:32 }}
      />
    </SafeAreaView>
  );
}

// ---------- Root Navigation ----------
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarHideOnKeyboard: true,
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#E2E8F0" },
        tabBarLabelStyle: { fontWeight: "600" },
        tabBarIcon: ({ color, size }) => {
          let iconName = "ellipse-outline";
          if (route.name === "Dashboard") iconName = "grid-outline";
          else if (route.name === "Barang") iconName = "cube-outline";
          else if (route.name === "PO") iconName = "cart-outline";
          else if (route.name === "History") iconName = "time-outline";
          return <Ionicons name={iconName} size={size ?? 22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Barang" component={ItemsScreen} />
      <Tab.Screen name="PO" component={PurchaseOrdersScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  useEffect(() => { initDb().catch(error => console.log("DB INIT ERROR:", error)); }, []);
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown:false }} />
          <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: "Tambah Barang" }} />
          <Stack.Screen name="StockMove" component={StockMoveScreen} options={{ title: "Pergerakan Stok" }} />
          <Stack.Screen name="AddPurchaseOrder" component={AddPurchaseOrderScreen} options={{ title: "Tambah PO" }} />
          <Stack.Screen name="EditPurchaseOrder" component={EditPurchaseOrderScreen} options={{ title: "Edit PO" }} />
          <Stack.Screen name="PurchaseOrderDetail" component={PurchaseOrderDetailScreen} options={{ title: "Detail PO" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
