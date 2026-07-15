import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  Pressable,
  ActivityIndicator,
  TextInput,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Dimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Polyline } from "react-native-svg";

import StatCard from "../components/StatCard";
import { CATEGORY_COLORS, getPOStatusStyle } from "../constants";
import {
  formatCurrencyValue,
  formatDateDisplay,
  formatDateTimeDisplay,
  formatNumberValue,
  parseDateString,
} from "../utils/format";
import { exec } from "../services/database";
import { KEYBOARD_AVOIDING_BEHAVIOR } from "../components/FormScrollContainer";
import { buildOrderItemLabel } from "../utils/purchaseOrders";
import * as SecureStore from "expo-secure-store";

export default function DashboardScreen({ navigation }) {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const modalKeyboardOffset = Platform.OS === "ios" ? insets.bottom + 16 : 0;
  const isIOS = Platform.OS === "ios";
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
    poDone: 0,
    poProgressValue: 0,
    poTotalValue: 0,
    poProgressProfit: 0,
    poDoneProfit: 0,
    poCancelledCount: 0,
    poCancelledTotal: 0,
    bookkeepingCount: 0,
    bookkeepingTotal: 0,
    itemProfitTotal: 0,
    poProfitTotal: 0,
    inQtyToday: 0,
    outQtyToday: 0,
  });
  const [priorityItems, setPriorityItems] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [recentPOs, setRecentPOs] = useState([]);
  const [recentBookkeeping, setRecentBookkeeping] = useState([]);
  const [itemProfitLeaders, setItemProfitLeaders] = useState([]);
  const [poProfitLeaders, setPoProfitLeaders] = useState([]);
  const [gudangSearch, setGudangSearch] = useState("");
  const [poSearch, setPoSearch] = useState("");
  const [kasSearch, setKasSearch] = useState("");
  const [gudangSearchResults, setGudangSearchResults] = useState([]);
  const [poSearchResults, setPoSearchResults] = useState([]);
  const [kasSearchResults, setKasSearchResults] = useState([]);
  const [storeName, setStoreName] = useState("Budi (Warehouse Manager)");
  const [tempStoreName, setTempStoreName] = useState("");
  const [storeNameModalVisible, setStoreNameModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [detailModal, setDetailModal] = useState({ visible: false, title: "", description: "", rows: [], type: null });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadingMore, setDetailLoadingMore] = useState(false);
  const [detailHasMore, setDetailHasMore] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailSearchInput, setDetailSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [tooltipTab, setTooltipTab] = useState(null);
  const detailPaging = useRef({ type: null, offset: 0, search: "" });
  const detailSearchInputRef = useRef(null);
  const [detailKeyboardInset, setDetailKeyboardInset] = useState(0);
  const navigateToRoot = useCallback(
    (routeName, params) => {
      if (!navigation) return;
      navigation.navigate(routeName, params);
    },
    [navigation],
  );

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
      mapRow: row => {
        const itemId = Number(row.id);
        return {
          key: String(row.id),
          title: row.name,
          subtitle: `${row.category && row.category.trim() ? row.category : "Tanpa kategori"} • ${formatNumberValue(row.stock)} stok`,
          trailingPrimary: formatCurrencyValue(row.totalValue),
          trailingSecondary: `@ ${formatCurrencyValue(row.price)}`,
          entityType: Number.isFinite(itemId) ? "item" : undefined,
          entityId: Number.isFinite(itemId) ? itemId : null,
        };
      },
    },
    poFull: {
      title: "Semua Purchase Order",
      description: "Riwayat purchase order terbaru.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT
            po.id,
            po.orderer_name,
            po.supplier_name,
            po.status,
            po.order_date,
            IFNULL(SUM(items.quantity), 0) as total_quantity,
            IFNULL(SUM(items.quantity * items.price), 0) as total_value,
            COUNT(items.id) as item_count,
            COALESCE(
              (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
              ''
            ) as primary_item_name
          FROM purchase_orders po
          LEFT JOIN purchase_order_items items ON items.order_id = po.id
          WHERE (
            ? = ''
            OR LOWER(IFNULL(po.orderer_name,'')) LIKE ?
            OR LOWER(IFNULL(po.supplier_name,'')) LIKE ?
            OR LOWER(IFNULL(po.note,'')) LIKE ?
            OR EXISTS (
              SELECT 1 FROM purchase_order_items search_items
              WHERE search_items.order_id = po.id AND LOWER(search_items.name) LIKE ?
            )
          )
          GROUP BY po.id
          ORDER BY po.order_date DESC, po.id DESC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => {
        const orderId = Number(row.id);
        const totalQuantity = Number(row.total_quantity ?? 0);
        const totalValue = Number(row.total_value ?? 0);
        const itemCount = Number(row.item_count ?? 0);
        const totalProfit = Number(row.total_profit ?? 0);
        const primaryItemName = row.primary_item_name || "";
        const itemName = buildOrderItemLabel(primaryItemName, itemCount || (primaryItemName ? 1 : 0));
        const orderer = row.orderer_name ? row.orderer_name : "Tanpa pemesan";
        const statusLabel = getPOStatusStyle(row.status).label;
        const profitLabel = `${totalProfit >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(totalProfit))}`;
        return {
          key: String(row.id),
          title: itemName,
          subtitle: `${orderer} • ${formatDateDisplay(row.order_date)} • ${statusLabel} • Est. ${profitLabel}`,
          trailingPrimary: formatCurrencyValue(totalValue),
          trailingSecondary: `${formatNumberValue(itemCount || (totalQuantity > 0 ? 1 : 0))} barang • ${formatNumberValue(totalQuantity)} pcs`,
          entityType: Number.isFinite(orderId) ? "po" : undefined,
          entityId: Number.isFinite(orderId) ? orderId : null,
        };
      },
    },
    poProgress: {
      title: "PO Progress",
      description: "Purchase order yang masih dalam proses.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT
            po.id,
            po.orderer_name,
            po.supplier_name,
            po.status,
            po.order_date,
            IFNULL(SUM(items.quantity), 0) as total_quantity,
            IFNULL(SUM(items.quantity * items.price), 0) as total_value,
            COUNT(items.id) as item_count,
            COALESCE(
              (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
              ''
            ) as primary_item_name
          FROM purchase_orders po
          LEFT JOIN purchase_order_items items ON items.order_id = po.id
          WHERE po.status = 'PROGRESS'
            AND (
              ? = ''
              OR LOWER(IFNULL(po.orderer_name,'')) LIKE ?
              OR LOWER(IFNULL(po.supplier_name,'')) LIKE ?
              OR LOWER(IFNULL(po.note,'')) LIKE ?
              OR EXISTS (
                SELECT 1 FROM purchase_order_items search_items
                WHERE search_items.order_id = po.id AND LOWER(search_items.name) LIKE ?
              )
            )
          GROUP BY po.id
          ORDER BY po.order_date ASC, po.id ASC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => {
        const orderId = Number(row.id);
        const totalQuantity = Number(row.total_quantity ?? 0);
        const totalValue = Number(row.total_value ?? 0);
        const itemCount = Number(row.item_count ?? 0);
        const primaryItemName = row.primary_item_name || "";
        const itemName = buildOrderItemLabel(primaryItemName, itemCount || (primaryItemName ? 1 : 0));
        const orderer = row.orderer_name ? row.orderer_name : "Tanpa pemesan";
        const statusLabel = getPOStatusStyle(row.status).label;
        return {
          key: String(row.id),
          title: itemName,
          subtitle: `${orderer} • ${formatDateDisplay(row.order_date)} • ${statusLabel}`,
          trailingPrimary: formatCurrencyValue(totalValue),
          trailingSecondary: `${formatNumberValue(itemCount || (totalQuantity > 0 ? 1 : 0))} barang • ${formatNumberValue(totalQuantity)} pcs`,
          entityType: Number.isFinite(orderId) ? "po" : undefined,
          entityId: Number.isFinite(orderId) ? orderId : null,
        };
      },
    },
    poCancelled: {
      title: "PO Dibatalkan",
      description: "Daftar purchase order yang dibatalkan.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT
            po.id,
            po.orderer_name,
            po.supplier_name,
            po.status,
            po.order_date,
            IFNULL(SUM(items.quantity), 0) as total_quantity,
            IFNULL(SUM(items.quantity * items.price), 0) as total_value,
            COUNT(items.id) as item_count,
            COALESCE(
              (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
              ''
            ) as primary_item_name
          FROM purchase_orders po
          LEFT JOIN purchase_order_items items ON items.order_id = po.id
          WHERE po.status = 'CANCELLED'
            AND (
              ? = ''
              OR LOWER(IFNULL(po.orderer_name,'')) LIKE ?
              OR LOWER(IFNULL(po.supplier_name,'')) LIKE ?
              OR LOWER(IFNULL(po.note,'')) LIKE ?
              OR EXISTS (
                SELECT 1 FROM purchase_order_items search_items
                WHERE search_items.order_id = po.id AND LOWER(search_items.name) LIKE ?
              )
            )
          GROUP BY po.id
          ORDER BY po.order_date DESC, po.id DESC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => {
        const orderId = Number(row.id);
        const totalQuantity = Number(row.total_quantity ?? 0);
        const totalValue = Number(row.total_value ?? 0);
        const itemCount = Number(row.item_count ?? 0);
        const primaryItemName = row.primary_item_name || "";
        const itemName = buildOrderItemLabel(primaryItemName, itemCount || (primaryItemName ? 1 : 0));
        const orderer = row.orderer_name ? row.orderer_name : "Tanpa pemesan";
        return {
          key: String(row.id),
          title: itemName,
          subtitle: `${orderer} • ${formatDateDisplay(row.order_date)} • Dibatalkan`,
          trailingPrimary: formatCurrencyValue(totalValue),
          trailingSecondary: `${formatNumberValue(itemCount || (totalQuantity > 0 ? 1 : 0))} barang • ${formatNumberValue(totalQuantity)} pcs`,
          entityType: Number.isFinite(orderId) ? "po" : undefined,
          entityId: Number.isFinite(orderId) ? orderId : null,
        };
      },
    },
    poValue: {
      title: "Nilai Purchase Order",
      description: "PO dengan nilai transaksi tertinggi.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT
            po.id,
            po.orderer_name,
            po.supplier_name,
            po.status,
            po.order_date,
            IFNULL(SUM(items.quantity), 0) as total_quantity,
            IFNULL(SUM(items.quantity * items.price), 0) as total_value,
            COUNT(items.id) as item_count,
            COALESCE(
              (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
              ''
            ) as primary_item_name
          FROM purchase_orders po
          LEFT JOIN purchase_order_items items ON items.order_id = po.id
          WHERE (
            ? = ''
            OR LOWER(IFNULL(po.orderer_name,'')) LIKE ?
            OR LOWER(IFNULL(po.supplier_name,'')) LIKE ?
            OR LOWER(IFNULL(po.note,'')) LIKE ?
            OR EXISTS (
              SELECT 1 FROM purchase_order_items search_items
              WHERE search_items.order_id = po.id AND LOWER(search_items.name) LIKE ?
            )
          )
          GROUP BY po.id
          ORDER BY total_value DESC, po.order_date DESC, po.id DESC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => {
        const orderId = Number(row.id);
        const totalQuantity = Number(row.total_quantity ?? 0);
        const totalValue = Number(row.total_value ?? 0);
        const itemCount = Number(row.item_count ?? 0);
        const primaryItemName = row.primary_item_name || "";
        const itemName = buildOrderItemLabel(primaryItemName, itemCount || (primaryItemName ? 1 : 0));
        const orderer = row.orderer_name ? row.orderer_name : "Tanpa pemesan";
        const statusLabel = getPOStatusStyle(row.status).label;
        return {
          key: String(row.id),
          title: itemName,
          subtitle: `${orderer} • ${formatDateDisplay(row.order_date)} • ${statusLabel}`,
          trailingPrimary: formatCurrencyValue(totalValue),
          trailingSecondary: `${formatNumberValue(itemCount || (totalQuantity > 0 ? 1 : 0))} barang • ${formatNumberValue(totalQuantity)} pcs`,
          entityType: Number.isFinite(orderId) ? "po" : undefined,
          entityId: Number.isFinite(orderId) ? orderId : null,
        };
      },
    },
    bookkeepingFull: {
      title: "Semua Pembukuan",
      description: "Daftar lengkap catatan pembukuan.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT id, name, amount, entry_date, note
          FROM bookkeeping_entries
          WHERE (? = '' OR LOWER(name) LIKE ? OR LOWER(IFNULL(note,'')) LIKE ?)
          ORDER BY entry_date DESC, id DESC
          LIMIT ? OFFSET ?
        `,
        params: [search, `%${search}%`, `%${search}%`, limit + 1, offset],
      }),
      mapRow: row => {
        const entryId = Number(row.id);
        const noteText = row.note && String(row.note).trim() ? String(row.note) : "";
        const dateDisplay = formatDateDisplay(row.entry_date);
        const subtitle = noteText ? `${dateDisplay} • ${noteText}` : dateDisplay;
        return {
          key: String(row.id),
          title: row.name,
          subtitle,
          trailingPrimary: formatCurrencyValue(row.amount),
          entityType: Number.isFinite(entryId) ? "bookkeeping" : undefined,
          entityId: Number.isFinite(entryId) ? entryId : null,
        };
      },
    },
    itemProfit: {
      title: "Profit Barang",
      description: "Daftar barang dengan profit tertinggi dari stok keluar.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT
            i.id as item_id,
            i.name,
            i.category,
            IFNULL(SUM(h.qty), 0) as total_qty,
            IFNULL(SUM(h.qty * IFNULL(h.unit_price, i.price)), 0) as total_sales,
            IFNULL(SUM(h.qty * IFNULL(h.unit_cost, i.cost_price)), 0) as total_cost,
            IFNULL(SUM(h.profit_amount), 0) as total_profit,
            MAX(h.created_at) as last_activity
          FROM stock_history h
          JOIN items i ON i.id = h.item_id
          WHERE h.type = 'OUT'
            AND (
              ? = ''
              OR LOWER(IFNULL(i.name,'')) LIKE ?
              OR LOWER(IFNULL(i.category,'')) LIKE ?
              OR LOWER(IFNULL(h.note,'')) LIKE ?
            )
          GROUP BY h.item_id
          ORDER BY total_profit DESC, last_activity DESC
          LIMIT ? OFFSET ?
        `,
        params: [
          search,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          limit + 1,
          offset,
        ],
      }),
      mapRow: row => {
        const itemId = Number(row.item_id);
        const totalProfit = Number(row.total_profit ?? 0);
        const profitLabel = `${totalProfit >= 0 ? '+' : '-'} ${formatCurrencyValue(Math.abs(totalProfit))}`;
        const qtyLabel = formatNumberValue(row.total_qty ?? 0);
        const salesLabel = formatCurrencyValue(row.total_sales ?? 0);
        const costLabel = formatCurrencyValue(row.total_cost ?? 0);
        const lastActivityLabel = row.last_activity ? formatDateTimeDisplay(row.last_activity) : 'Belum ada aktivitas';
        return {
          key: itemId ? String(itemId) : row.name,
          title: row.name,
          subtitle: `${row.category && row.category.trim() ? row.category : 'Tanpa kategori'} • ${qtyLabel} pcs • ${lastActivityLabel}`,
          trailingPrimary: profitLabel,
          trailingSecondary: `${salesLabel} • Modal ${costLabel}`,
          entityType: Number.isFinite(itemId) ? 'item' : undefined,
          entityId: Number.isFinite(itemId) ? itemId : null,
        };
      },
    },
    poProfit: {
      title: "Profit Purchase Order",
      description: "Purchase order selesai dengan profit tertinggi.",
      buildQuery: (search, limit, offset) => ({
        sql: `
          SELECT
            po.id,
            po.orderer_name,
            po.supplier_name,
            po.completed_at,
            po.order_date,
            IFNULL(SUM(items.quantity), 0) as total_qty,
            IFNULL(SUM(items.quantity * items.price), 0) as total_sales,
            IFNULL(SUM(items.quantity * items.cost_price), 0) as total_cost,
            IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) as total_profit,
            COUNT(items.id) as item_count,
            COALESCE(
              (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
              ''
            ) as primary_item_name
          FROM purchase_orders po
          JOIN purchase_order_items items ON items.order_id = po.id
          WHERE po.status = 'DONE'
            AND (
              ? = ''
              OR LOWER(IFNULL(po.orderer_name,'')) LIKE ?
              OR LOWER(IFNULL(po.supplier_name,'')) LIKE ?
              OR LOWER(IFNULL(po.note,'')) LIKE ?
              OR EXISTS (
                SELECT 1 FROM purchase_order_items search_items
                WHERE search_items.order_id = po.id AND LOWER(search_items.name) LIKE ?
              )
            )
          GROUP BY po.id
          ORDER BY total_profit DESC, po.completed_at DESC, po.id DESC
          LIMIT ? OFFSET ?
        `,
        params: [
          search,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          limit + 1,
          offset,
        ],
      }),
      mapRow: row => {
        const orderId = Number(row.id);
        const totalProfit = Number(row.total_profit ?? 0);
        const profitLabel = `${totalProfit >= 0 ? '+' : '-'} ${formatCurrencyValue(Math.abs(totalProfit))}`;
        const totalSales = Number(row.total_sales ?? 0);
        const totalCost = Number(row.total_cost ?? 0);
        const salesLabel = formatCurrencyValue(totalSales);
        const costLabel = formatCurrencyValue(totalCost);
        const qtyLabel = formatNumberValue(row.total_qty ?? 0);
        const itemCount = Number(row.item_count ?? 0);
        const itemLabel = buildOrderItemLabel(row.primary_item_name || '', itemCount || (row.primary_item_name ? 1 : 0));
        const completedLabel = row.completed_at ? formatDateTimeDisplay(row.completed_at) : formatDateDisplay(row.order_date);
        return {
          key: orderId ? String(orderId) : itemLabel,
          title: itemLabel,
          subtitle: `${row.orderer_name || 'Tanpa pemesan'}${row.supplier_name ? ` • ${row.supplier_name}` : ''} • ${completedLabel}`,
          trailingPrimary: profitLabel,
          trailingSecondary: `${salesLabel} • Modal ${costLabel} • ${qtyLabel} pcs`,
          entityType: Number.isFinite(orderId) ? 'po' : undefined,
          entityId: Number.isFinite(orderId) ? orderId : null,
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
  const dashboardTabs = useMemo(
    () => [
      { key: "summary", label: "Ringkasan", icon: "analytics-outline" },
      { key: "inventory", label: "Inventori", icon: "cube-outline" },
      { key: "purchase", label: "Purchase Order", icon: "cart-outline" },
      { key: "bookkeeping", label: "Pembukuan", icon: "book-outline" },
      { key: "profit", label: "Profit", icon: "trending-up-outline" },
    ],
    [],
  );
  const handleTabPress = useCallback(
    key => {
      if (key === activeTab) {
        setTooltipTab(null);
        return;
      }
      setActiveTab(key);
      setTooltipTab(null);
    },
    [activeTab],
  );
  const chartDimensions = useMemo(() => {
    const windowWidth = Dimensions.get("window").width || 360;
    const width = Math.max(windowWidth - 64, 240);
    return { width, height: 160 };
  }, []);
  const bookkeepingTrend = useMemo(() => {
    if (!recentBookkeeping.length) return [];
    const totals = new Map();
    recentBookkeeping.forEach(entry => {
      if (!entry?.entryDate) return;
      const parsed = parseDateString(entry.entryDate);
      if (Number.isNaN(parsed.getTime())) return;
      const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
      const amount = Number(entry.amount ?? 0);
      totals.set(iso, (totals.get(iso) || 0) + amount);
    });
    const sorted = Array.from(totals.entries())
      .map(([dateKey, total]) => {
        const parsed = parseDateString(dateKey);
        const shortLabel = parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
        return {
          date: dateKey,
          total,
          shortLabel,
          displayDate: formatDateDisplay(dateKey),
          sortKey: parsed.getTime(),
        };
      })
      .filter(item => Number.isFinite(item.sortKey))
      .sort((a, b) => a.sortKey - b.sortKey);
    return sorted.slice(-7);
  }, [recentBookkeeping]);

  const gudangSearchRef = useRef("");
  const poSearchRef = useRef("");
  const kasSearchRef = useRef("");

  useEffect(() => {
    gudangSearchRef.current = gudangSearch;
  }, [gudangSearch]);

  useEffect(() => {
    poSearchRef.current = poSearch;
  }, [poSearch]);

  useEffect(() => {
    kasSearchRef.current = kasSearch;
  }, [kasSearch]);

  const fetchGudangSearch = useCallback(async (searchVal) => {
    if (!searchVal.trim()) {
      setGudangSearchResults([]);
      return;
    }
    const cleanSearch = searchVal.trim().toLowerCase();
    try {
      const res = await exec(
        `SELECT id, name, category, stock, price
         FROM items
         WHERE LOWER(name) LIKE ? OR LOWER(IFNULL(category, '')) LIKE ?
         ORDER BY name ASC
         LIMIT 50`,
        [`%${cleanSearch}%`, `%${cleanSearch}%`]
      );
      const results = [];
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        results.push({
          id: row.id,
          name: row.name,
          category: row.category,
          stock: Number(row.stock ?? 0),
          price: Number(row.price ?? 0),
        });
      }
      setGudangSearchResults(results);
    } catch (err) {
      console.log("Gudang search error:", err);
    }
  }, []);

  const fetchPoSearch = useCallback(async (searchVal) => {
    if (!searchVal.trim()) {
      setPoSearchResults([]);
      return;
    }
    const cleanSearch = searchVal.trim().toLowerCase();
    const match = cleanSearch.match(/(?:po-w2026-)?(\d+)/);
    const searchedId = match ? parseInt(match[1], 10) : null;
    try {
      const res = await exec(
        `SELECT
           po.id,
           po.supplier_name,
           po.orderer_name,
           po.status,
           po.order_date,
           IFNULL(SUM(items.quantity), 0) as total_quantity,
           IFNULL(SUM(items.quantity * items.price), 0) as total_value,
           COUNT(items.id) as item_count,
           COALESCE(
             (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
             ''
           ) as primary_item_name,
           (SELECT group_concat(name, ', ') FROM purchase_order_items WHERE order_id = po.id) as all_item_names
         FROM purchase_orders po
         LEFT JOIN purchase_order_items items ON items.order_id = po.id
         WHERE
           LOWER(IFNULL(po.supplier_name, '')) LIKE ?
           OR LOWER(IFNULL(po.orderer_name, '')) LIKE ?
           OR LOWER(IFNULL(po.item_name, '')) LIKE ?
           OR po.id = ?
           OR EXISTS (
             SELECT 1 FROM purchase_order_items search_items
             WHERE search_items.order_id = po.id AND LOWER(search_items.name) LIKE ?
           )
         GROUP BY po.id
         ORDER BY po.order_date DESC, po.id DESC
         LIMIT 50`,
        [
          `%${cleanSearch}%`,
          `%${cleanSearch}%`,
          `%${cleanSearch}%`,
          searchedId ?? -1,
          `%${cleanSearch}%`
        ]
      );
      const results = [];
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        const itemCount = Number(row.item_count ?? 0);
        const totalQuantity = Number(row.total_quantity ?? 0);
        const totalValue = Number(row.total_value ?? 0);
        const primaryItemName = row.primary_item_name || "";
        const itemName = buildOrderItemLabel(primaryItemName, itemCount || (primaryItemName ? 1 : 0));
        results.push({
          id: row.id,
          supplierName: row.supplier_name,
          ordererName: row.orderer_name,
          itemName,
          primaryItemName,
          allItemNames: row.all_item_names || "",
          itemsCount: itemCount,
          totalQuantity,
          totalValue,
          status: row.status,
          orderDate: row.order_date,
        });
      }
      setPoSearchResults(results);
    } catch (err) {
      console.log("PO search error:", err);
    }
  }, []);

  const fetchKasSearch = useCallback(async (searchVal) => {
    if (!searchVal.trim()) {
      setKasSearchResults([]);
      return;
    }
    const cleanSearch = searchVal.trim().toLowerCase();
    try {
      const res = await exec(
        `SELECT id, name, amount, entry_date, note
         FROM bookkeeping_entries
         WHERE LOWER(name) LIKE ? OR LOWER(IFNULL(note, '')) LIKE ?
         ORDER BY entry_date DESC, id DESC
         LIMIT 50`,
        [`%${cleanSearch}%`, `%${cleanSearch}%`]
      );
      const results = [];
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        results.push({
          id: row.id,
          name: row.name,
          amount: Number(row.amount ?? 0),
          entryDate: row.entry_date,
          note: row.note,
        });
      }
      setKasSearchResults(results);
    } catch (err) {
      console.log("Kas search error:", err);
    }
  }, []);

  useEffect(() => {
    fetchGudangSearch(gudangSearch);
  }, [gudangSearch, fetchGudangSearch]);

  useEffect(() => {
    fetchPoSearch(poSearch);
  }, [poSearch, fetchPoSearch]);

  useEffect(() => {
    fetchKasSearch(kasSearch);
  }, [kasSearch, fetchKasSearch]);

  async function load() {
    try {
      setRefreshing(true);
      try {
        const { checkAndGenerateAlerts, getUnreadNotificationCount } = require("../services/notifications");
        await checkAndGenerateAlerts();
        const unreadCount = await getUnreadNotificationCount();
        setUnreadNotificationsCount(unreadCount);
      } catch (err) {
        console.log("Error loading notifications count:", err);
      }

      const summaryRes = await exec(`
        SELECT
          IFNULL(SUM(stock),0) as totalStock,
          COUNT(*) as totalItems,
          IFNULL(SUM(price),0) as totalPrice,
          IFNULL(SUM(stock * price),0) as totalInventoryValue
        FROM items
      `);
      const todayStockRes = await exec(`
        SELECT
          IFNULL(SUM(CASE WHEN type = 'IN' THEN qty ELSE 0 END), 0) as inQtyToday,
          IFNULL(SUM(CASE WHEN type = 'OUT' THEN qty ELSE 0 END), 0) as outQtyToday
        FROM stock_history
        WHERE date(created_at) = date('now', 'localtime')
      `);
      const priorityItemsRes = await exec(`
        SELECT id, name, category, stock, price
        FROM items
        ORDER BY stock ASC, name ASC
        LIMIT 3
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
          SUM(CASE WHEN status = 'PROGRESS' THEN 1 ELSE 0 END) as progressOrders,
          SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) as doneOrders,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelledOrders,
          IFNULL(SUM(total_value), 0) as totalValue,
          IFNULL(SUM(CASE WHEN status = 'PROGRESS' THEN total_value ELSE 0 END), 0) as progressValue,
          IFNULL(SUM(CASE WHEN status = 'PROGRESS' THEN total_profit ELSE 0 END), 0) as progressProfit,
          IFNULL(SUM(CASE WHEN status = 'DONE' THEN total_profit ELSE 0 END), 0) as doneProfit,
          IFNULL(SUM(CASE WHEN status = 'CANCELLED' THEN total_value ELSE 0 END), 0) as cancelledValue
        FROM (
          SELECT
            po.id,
            po.status,
            IFNULL(SUM(items.quantity), 0) as total_quantity,
            IFNULL(SUM(items.quantity * items.price), 0) as total_value,
            IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) as total_profit
          FROM purchase_orders po
          LEFT JOIN purchase_order_items items ON items.order_id = po.id
          GROUP BY po.id
        ) aggregated
      `);
      const recentPoRes = await exec(`
        SELECT
          po.id,
          po.supplier_name,
          po.orderer_name,
          po.status,
          po.order_date,
          IFNULL(SUM(items.quantity), 0) as total_quantity,
          IFNULL(SUM(items.quantity * items.price), 0) as total_value,
          COUNT(items.id) as item_count,
          IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) as total_profit,
          COALESCE(
            (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
            ''
          ) as primary_item_name,
          (SELECT group_concat(name, ', ') FROM purchase_order_items WHERE order_id = po.id) as all_item_names
        FROM purchase_orders po
        LEFT JOIN purchase_order_items items ON items.order_id = po.id
        GROUP BY po.id
        ORDER BY po.order_date DESC, po.id DESC
        LIMIT 5
      `);
      const bookkeepingSummaryRes = await exec(`
        SELECT
          COUNT(*) as totalEntries,
          IFNULL(SUM(amount), 0) as totalAmount
        FROM bookkeeping_entries
      `);
      const recentBookkeepingRes = await exec(`
        SELECT id, name, amount, entry_date, note
        FROM bookkeeping_entries
        ORDER BY entry_date DESC, id DESC
        LIMIT 5
      `);
      const itemProfitSummaryRes = await exec(`
        SELECT IFNULL(SUM(profit_amount), 0) as total_profit
        FROM stock_history
        WHERE type = 'OUT'
      `);
      const itemProfitLeadersRes = await exec(`
        SELECT
          h.item_id,
          i.name,
          i.category,
          IFNULL(SUM(h.profit_amount), 0) as total_profit,
          IFNULL(SUM(h.qty), 0) as total_qty,
          MAX(h.created_at) as last_activity
        FROM stock_history h
        JOIN items i ON i.id = h.item_id
        WHERE h.type = 'OUT'
        GROUP BY h.item_id
        ORDER BY total_profit DESC, i.name ASC
        LIMIT 10
      `);
      const poProfitSummaryRes = await exec(`
        SELECT IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) as total_profit
        FROM purchase_orders po
        JOIN purchase_order_items items ON items.order_id = po.id
        WHERE po.status = 'DONE'
      `);
      const poProfitLeadersRes = await exec(`
        SELECT
          po.id,
          po.orderer_name,
          po.supplier_name,
          po.order_date,
          po.completed_at,
          IFNULL(SUM(items.quantity), 0) as total_qty,
          IFNULL(SUM(items.quantity * items.price), 0) as total_value,
          IFNULL(SUM(items.quantity * items.cost_price), 0) as total_cost,
          IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) as total_profit,
          COUNT(items.id) as item_count,
          COALESCE(
            (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
            ''
          ) as primary_item_name
        FROM purchase_orders po
        JOIN purchase_order_items items ON items.order_id = po.id
        WHERE po.status = 'DONE'
        GROUP BY po.id
        ORDER BY total_profit DESC, po.completed_at DESC, po.id DESC
        LIMIT 10
      `);

      const summaryRow = summaryRes.rows.length ? summaryRes.rows.item(0) : {};
      const outRow = outRes.rows.length ? outRes.rows.item(0) : {};
      const poSummaryRow = poSummaryRes.rows.length ? poSummaryRes.rows.item(0) : {};
      const bookkeepingSummaryRow = bookkeepingSummaryRes.rows.length
        ? bookkeepingSummaryRes.rows.item(0)
        : {};

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
        const itemCount = Number(row.item_count ?? 0);
        const totalQuantity = Number(row.total_quantity ?? 0);
        const totalValue = Number(row.total_value ?? 0);
        const primaryItemName = row.primary_item_name || "";
        const itemName = buildOrderItemLabel(primaryItemName, itemCount || (primaryItemName ? 1 : 0));
        nextRecentPOs.push({
          id: row.id,
          supplierName: row.supplier_name,
          ordererName: row.orderer_name,
          itemName,
          primaryItemName,
          allItemNames: row.all_item_names || "",
          itemsCount: itemCount,
          totalQuantity,
          totalValue,
          status: row.status,
          orderDate: row.order_date,
        });
      }

      const nextRecentBookkeeping = [];
      for (let i = 0; i < recentBookkeepingRes.rows.length; i++) {
        const row = recentBookkeepingRes.rows.item(i);
        nextRecentBookkeeping.push({
          id: row.id,
          name: row.name,
          amount: Number(row.amount ?? 0),
          entryDate: row.entry_date,
          note: row.note,
        });
      }

      const itemProfitTotalRow = itemProfitSummaryRes.rows.length ? itemProfitSummaryRes.rows.item(0) : {};
      const itemProfitTotal = Number(itemProfitTotalRow.total_profit ?? 0);
      const nextItemProfitLeaders = [];
      for (let i = 0; i < itemProfitLeadersRes.rows.length; i++) {
        const row = itemProfitLeadersRes.rows.item(i);
        nextItemProfitLeaders.push({
          itemId: Number(row.item_id),
          name: row.name,
          category: row.category,
          totalProfit: Number(row.total_profit ?? 0),
          totalQty: Number(row.total_qty ?? 0),
          lastActivity: row.last_activity,
        });
      }

      const poProfitTotalRow = poProfitSummaryRes.rows.length ? poProfitSummaryRes.rows.item(0) : {};
      const poProfitTotal = Number(poProfitTotalRow.total_profit ?? 0);
      const nextPoProfitLeaders = [];
      for (let i = 0; i < poProfitLeadersRes.rows.length; i++) {
        const row = poProfitLeadersRes.rows.item(i);
        nextPoProfitLeaders.push({
          id: row.id,
          ordererName: row.orderer_name,
          supplierName: row.supplier_name,
          orderDate: row.order_date,
          completedAt: row.completed_at,
          totalQuantity: Number(row.total_qty ?? 0),
          totalValue: Number(row.total_value ?? 0),
          totalCost: Number(row.total_cost ?? 0),
          totalProfit: Number(row.total_profit ?? 0),
          itemCount: Number(row.item_count ?? 0),
          primaryItemName: row.primary_item_name,
        });
      }

      const todayStockRow = todayStockRes.rows.length ? todayStockRes.rows.item(0) : {};
      const inQtyToday = Number(todayStockRow.inQtyToday ?? 0);
      const outQtyToday = Number(todayStockRow.outQtyToday ?? 0);

      const nextPriorityItems = [];
      for (let i = 0; i < priorityItemsRes.rows.length; i++) {
        const row = priorityItemsRes.rows.item(i);
        nextPriorityItems.push({
          id: row.id,
          name: row.name,
          category: row.category,
          stock: Number(row.stock ?? 0),
          price: Number(row.price ?? 0),
        });
      }

      setCategoryStats(nextCategoryStats);
      setTopItems(nextTopItems);
      setRecentPOs(nextRecentPOs);
      setRecentBookkeeping(nextRecentBookkeeping);
      setItemProfitLeaders(nextItemProfitLeaders);
      setPoProfitLeaders(nextPoProfitLeaders);
      setPriorityItems(nextPriorityItems);
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
        poDone: Number(poSummaryRow.doneOrders ?? 0),
        poProgressValue: Number(poSummaryRow.progressValue ?? 0),
        poProgressProfit: Number(poSummaryRow.progressProfit ?? 0),
        poDoneProfit: Number(poSummaryRow.doneProfit ?? 0),
        poCancelledCount: Number(poSummaryRow.cancelledOrders ?? 0),
        poCancelledTotal: Number(poSummaryRow.cancelledValue ?? 0),
        poTotalValue: Number(poSummaryRow.totalValue ?? 0),
        bookkeepingCount: Number(bookkeepingSummaryRow.totalEntries ?? 0),
        bookkeepingTotal: Number(bookkeepingSummaryRow.totalAmount ?? 0),
        itemProfitTotal,
        poProfitTotal,
        inQtyToday,
        outQtyToday,
      });
      if (gudangSearchRef.current) fetchGudangSearch(gudangSearchRef.current);
      if (poSearchRef.current) fetchPoSearch(poSearchRef.current);
      if (kasSearchRef.current) fetchKasSearch(kasSearchRef.current);
    } catch (error) {
      console.log("DASHBOARD LOAD ERROR:", error);
    } finally {
      setRefreshing(false);
    }
  }

  const handleSaveStoreName = async () => {
    try {
      await SecureStore.setItemAsync("store_name", tempStoreName);
      setStoreName(tempStoreName);
      setStoreNameModalVisible(false);
    } catch (e) {
      console.log("Error saving store name:", e);
    }
  };

  useEffect(() => {
    load();
    async function loadStoreName() {
      try {
        const saved = await SecureStore.getItemAsync("store_name");
        if (saved) {
          setStoreName(saved);
        }
      } catch (e) {
        console.log("Error loading store name:", e);
      }
    }
    loadStoreName();
  }, []);
  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener("focus", load);

    // Listen to parent bookkeeping refresh events
    const parent = typeof navigation.getParent === "function" ? navigation.getParent() : null;
    let unsubParent;
    if (parent && typeof parent.addListener === "function") {
      unsubParent = parent.addListener("bookkeeping:refresh", load);
    }

    return () => {
      unsubscribe();
      if (unsubParent) unsubParent();
    };
  }, [navigation]);

  useEffect(() => {
    if (isIOS) return undefined;
    if (!detailModal.visible) {
      setDetailKeyboardInset(0);
      return undefined;
    }
    const showSub = Keyboard.addListener("keyboardDidShow", event => {
      const height = event?.endCoordinates?.height ?? 0;
      const adjusted = Math.max(0, height - insets.bottom);
      setDetailKeyboardInset(adjusted);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setDetailKeyboardInset(0);
    });
    return () => {
      showSub?.remove();
      hideSub?.remove();
      setDetailKeyboardInset(0);
    };
  }, [detailModal.visible, insets.bottom, isIOS]);

  function closeDetail() {
    detailSearchInputRef.current?.blur();
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
    detailSearchInputRef.current?.blur();
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
    detailSearchInputRef.current?.blur();
    if (!isPaginatedType(detailModal.type)) return;
    const term = detailSearchInput.trim();
    const normalized = term.toLowerCase();
    setDetailSearch(term);
    detailPaging.current = { type: detailModal.type, offset: 0, search: normalized };
    loadDetailPaginated({ type: detailModal.type, searchTerm: term, reset: true });
  }

  function renderDetailModalBody() {
    const ModalContainer = isIOS ? KeyboardAvoidingView : View;
    const modalProps = isIOS
      ? { behavior: KEYBOARD_AVOIDING_BEHAVIOR, keyboardVerticalOffset: modalKeyboardOffset }
      : {};
    const containerStyle = {
      flex: 1,
      justifyContent: "flex-end",
      marginBottom: isIOS ? 0 : detailKeyboardInset,
    };
    return (
      <ModalContainer {...modalProps} style={containerStyle} pointerEvents="box-none">
        <Pressable
          style={{
            backgroundColor: "#fff",
            borderRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 24,
            maxHeight: "75%",
          }}
          onPress={event => event.stopPropagation()}
        >
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <View style={{ width: 42, height: 4, borderRadius: 999, backgroundColor: "#E2E8F0" }} />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: detailModal.description ? 8 : 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A", flex: 1, paddingRight: 12 }}>{detailModal.title}</Text>
            <TouchableOpacity onPress={closeDetail} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>
          {detailModal.description ? <Text style={{ color: "#64748B", marginBottom: 16 }}>{detailModal.description}</Text> : null}
          {isPaginatedType(detailModal.type) ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <TextInput
                  ref={detailSearchInputRef}
                  value={detailSearchInput}
                  onChangeText={setDetailSearchInput}
                  placeholder="Cari..."
                  placeholderTextColor="#94A3B8"
                  onSubmitEditing={applySearch}
                  returnKeyType="search"
                  style={{
                    flex: 1,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#F1F5F9",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    height: 42,
                  }}
                />
                <TouchableOpacity
                  onPress={applySearch}
                  style={{ backgroundColor: "#2563EB", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 }}
                >
                  <Ionicons name="search" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              {detailLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <ActivityIndicator color="#2563EB" />
                  <Text style={{ marginTop: 12, color: "#64748B" }}>Memuat data…</Text>
                </View>
              ) : (
                <FlatList
                  data={detailModal.rows}
                  keyExtractor={(item, index) => (item.key ? String(item.key) : `${detailModal.type || "row"}-${index}`)}
                  renderItem={({ item, index }) => {
                    const isPressable =
                      item?.entityType === "item" ||
                      item?.entityType === "po" ||
                      item?.entityType === "bookkeeping";
                    return (
                      <TouchableOpacity
                        onPress={isPressable ? () => handleDetailRowPress(item) : undefined}
                        disabled={!isPressable}
                        activeOpacity={isPressable ? 0.7 : 1}
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          paddingVertical: 12,
                          borderTopWidth: index === 0 ? 0 : 1,
                          borderColor: "#F1F5F9",
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 12, marginBottom: 8 }}>
                          <Text style={{ color: "#0F172A", fontWeight: "600" }}>{item.title}</Text>
                          {item.subtitle ? (
                            <Text style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>{item.subtitle}</Text>
                          ) : null}
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          {item.trailingPrimary ? (
                            <Text style={{ color: "#0F172A", fontWeight: "700" }}>{item.trailingPrimary}</Text>
                          ) : null}
                          {item.trailingSecondary ? (
                            <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>{item.trailingSecondary}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  onEndReached={loadMoreDetail}
                  onEndReachedThreshold={0.6}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: detailHasMore ? 24 : 0 }}
                  style={{ maxHeight: 320 }}
                  keyboardShouldPersistTaps="handled"
                  ListFooterComponent={
                    detailLoadingMore ? (
                      <View style={{ paddingVertical: 16, alignItems: "center" }}>
                        <ActivityIndicator color="#2563EB" />
                      </View>
                    ) : null
                  }
                  ListEmptyComponent={
                    <View style={{ paddingVertical: 24 }}>
                      <Text style={{ color: "#94A3B8", textAlign: "center" }}>Belum ada data untuk ditampilkan.</Text>
                    </View>
                  }
                />
              )}
            </>
          ) : detailLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator color="#2563EB" />
              <Text style={{ marginTop: 12, color: "#64748B" }}>Memuat data…</Text>
            </View>
          ) : detailModal.rows.length ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {detailModal.rows.map((row, index) => {
                const isPressable =
                  row?.entityType === "item" ||
                  row?.entityType === "po" ||
                  row?.entityType === "bookkeeping";
                return (
                  <TouchableOpacity
                    key={row.key ?? `${row.title}-${index}`}
                    onPress={isPressable ? () => handleDetailRowPress(row) : undefined}
                    disabled={!isPressable}
                    activeOpacity={isPressable ? 0.7 : 1}
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderColor: "#F1F5F9",
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ color: "#0F172A", fontWeight: "600" }}>{row.title}</Text>
                      {row.subtitle ? (
                        <Text style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>{row.subtitle}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {row.trailingPrimary ? (
                        <Text style={{ color: "#0F172A", fontWeight: "700" }}>{row.trailingPrimary}</Text>
                      ) : null}
                      {row.trailingSecondary ? (
                        <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>{row.trailingSecondary}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={{ paddingVertical: 24 }}>
              <Text style={{ color: "#94A3B8", textAlign: "center" }}>Belum ada data untuk ditampilkan.</Text>
            </View>
          )}
        </Pressable>
      </ModalContainer>
    );
  }

  async function handleDetailRowPress(row) {
    Keyboard.dismiss();
    if (!row || !row.entityType) return;
    if (row.entityType === "item") {
      const itemId = Number(row.entityId);
      if (!Number.isFinite(itemId)) return;
      try {
        const res = await exec(
          `SELECT id, name, category, price, stock FROM items WHERE id = ?`,
          [itemId],
        );
        if (!res.rows.length) {
          Alert.alert("Data Tidak Ditemukan", "Barang mungkin telah dihapus.");
          return;
        }
        const itemRow = res.rows.item(0);
        closeDetail();
        navigateToRoot("ItemDetail", {
          itemId: itemRow.id,
          initialItem: {
            id: itemRow.id,
            name: itemRow.name,
            category: itemRow.category,
            price: Number(itemRow.price ?? 0),
            stock: Number(itemRow.stock ?? 0),
          },
        });
      } catch (error) {
        console.log("ITEM DETAIL OPEN ERROR:", error);
        Alert.alert("Gagal", "Tidak dapat membuka detail barang.");
      }
    } else if (row.entityType === "po") {
      const orderId = Number(row.entityId);
      if (!Number.isFinite(orderId)) return;
      closeDetail();
      navigateToRoot("PurchaseOrderDetail", {
        orderId,
      });
    } else if (row.entityType === "bookkeeping") {
      const entryId = Number(row.entityId);
      if (!Number.isFinite(entryId)) return;
      closeDetail();
      navigateToRoot("BookkeepingDetail", {
        entryId,
      });
    }
  }

  async function openDetail(statKey) {
    const paginatedMap = {
      categoriesFull: "categoriesFull",
      itemsFull: "itemsFull",
      poFull: "poFull",
      poCount: "poFull",
      poProgress: "poProgress",
      poPending: "poProgress",
      poProgressValue: "poProgress",
      poValue: "poValue",
      poProgressProfit: "poProgress",
      poCancelled: "poCancelled",
      bookkeepingCount: "bookkeepingFull",
      bookkeepingTotal: "bookkeepingFull",
      itemProfitTotal: "itemProfit",
      poProfitTotal: "poProfit",
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
          const itemId = Number(row.id);
          rows.push({
            key: String(row.id),
            title: row.name,
            subtitle: `${row.category || "Tanpa kategori"} • ${formatNumber(row.stock)} stok`,
            trailingPrimary: `@ ${formatCurrency(row.price)}`,
            entityType: Number.isFinite(itemId) ? "item" : undefined,
            entityId: Number.isFinite(itemId) ? itemId : null,
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
          const itemId = Number(row.id);
          rows.push({
            key: String(row.id),
            title: row.name,
            subtitle: row.category || "Tanpa kategori",
            trailingPrimary: `${formatNumber(row.stock)} stok`,
            trailingSecondary: `@ ${formatCurrency(row.price)}`,
            entityType: Number.isFinite(itemId) ? "item" : undefined,
            entityId: Number.isFinite(itemId) ? itemId : null,
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
          const itemId = Number(row.id);
          rows.push({
            key: String(row.id),
            title: row.name,
            subtitle: `${row.category || "Tanpa kategori"} • ${formatNumber(row.stock)} stok`,
            trailingPrimary: formatCurrency(row.totalValue),
            trailingSecondary: `@ ${formatCurrency(row.price)}`,
            entityType: Number.isFinite(itemId) ? "item" : undefined,
            entityId: Number.isFinite(itemId) ? itemId : null,
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
          SELECT h.id, i.id as item_id, i.name, i.category, h.qty, h.created_at, i.price, (h.qty * i.price) as totalValue
          FROM stock_history h JOIN items i ON i.id = h.item_id
          WHERE h.type = 'OUT'
          ORDER BY h.created_at DESC, h.id DESC
          LIMIT 30
        `);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) {
          const row = res.rows.item(i);
          const itemId = Number(row.item_id);
          rows.push({
            key: String(row.id),
            title: row.name,
            subtitle: `${row.category || "Tanpa kategori"} • ${row.created_at}`,
            trailingPrimary: `${formatNumber(row.qty)} pcs`,
            trailingSecondary: formatCurrency(row.totalValue),
            entityType: Number.isFinite(itemId) ? "item" : undefined,
            entityId: Number.isFinite(itemId) ? itemId : null,
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

  async function openItemProfitDetail(item) {
    const itemId = Number(item?.itemId ?? item?.id ?? item?.entityId);
    if (!Number.isFinite(itemId)) return;
    const totalProfit = Number(item?.totalProfit ?? 0);
    const totalQty = Number(item?.totalQty ?? 0);
    setDetailHasMore(false);
    setDetailSearch("");
    setDetailSearchInput("");
    detailPaging.current = { type: "itemProfitHistory", offset: 0, search: "" };
    setDetailModal({
      visible: true,
      title: item?.name ? `Profit ${item.name}` : "Profit Barang",
      description: `Total profit: ${
        totalProfit >= 0
          ? formatCurrencyValue(totalProfit)
          : `- ${formatCurrencyValue(Math.abs(totalProfit))}`
      } • Qty keluar: ${formatNumberValue(totalQty)} pcs`,
      rows: [],
      type: "itemProfitHistory",
    });
    setDetailLoading(true);
    try {
      const res = await exec(
        `
          SELECT id, qty, note, created_at, unit_price, unit_cost, profit_amount
          FROM stock_history
          WHERE item_id = ? AND type = 'OUT'
          ORDER BY created_at DESC, id DESC
          LIMIT 50
        `,
        [itemId],
      );
      const rows = [];
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        const qty = Number(row.qty ?? 0);
        const price = Number(row.unit_price ?? 0);
        const cost = Number(row.unit_cost ?? 0);
        const profit = Number(row.profit_amount ?? 0);
        const salesTotal = qty * price;
        const subtitleParts = [
          `Qty: ${formatNumberValue(qty)} pcs`,
          `Jual: ${formatCurrencyValue(price)}`,
          `Modal: ${formatCurrencyValue(cost)}`,
        ];
        const noteText = row.note && String(row.note).trim() ? String(row.note) : "";
        const displaySubtitle = noteText
          ? `${subtitleParts.join(" • ")}\nCatatan: ${noteText}`
          : subtitleParts.join(" • ");
        const profitLabel = `${profit >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(profit))}`;
        rows.push({
          key: `history-${row.id}`,
          title: formatDateTimeDisplay(row.created_at),
          subtitle: displaySubtitle,
          trailingPrimary: profitLabel,
          trailingSecondary: `Omzet ${formatCurrencyValue(salesTotal)}`,
        });
      }
      setDetailModal(prev => ({ ...prev, rows }));
    } catch (error) {
      console.log("ITEM PROFIT DETAIL ERROR:", error);
      setDetailModal({
        visible: true,
        title: "Tidak dapat memuat detail",
        description: "Terjadi kesalahan saat memuat riwayat profit barang.",
        rows: [],
        type: "itemProfitHistory",
      });
    } finally {
      setDetailLoading(false);
    }
  }

  async function openPoProfitDetail(po) {
    const orderId = Number(po?.id ?? po?.entityId);
    if (!Number.isFinite(orderId)) return;
    const totalProfit = Number(po?.totalProfit ?? 0);
    const totalSales = Number(po?.totalValue ?? po?.totalSales ?? 0);
    const totalCost = Number(po?.totalCost ?? 0);
    const completedLabel = po?.completedAt
      ? formatDateTimeDisplay(po.completedAt)
      : po?.orderDate
      ? formatDateDisplay(po.orderDate)
      : "-";
    setDetailHasMore(false);
    setDetailSearch("");
    setDetailSearchInput("");
    detailPaging.current = { type: "poProfitBreakdown", offset: 0, search: "" };
    setDetailModal({
      visible: true,
      title: po?.primaryItemName ? `Profit PO • ${po.primaryItemName}` : "Profit Purchase Order",
      description: `${
        totalProfit >= 0
          ? `Total profit: ${formatCurrencyValue(totalProfit)}`
          : `Total rugi: - ${formatCurrencyValue(Math.abs(totalProfit))}`
      } • Omzet: ${formatCurrencyValue(totalSales)} • Modal: ${formatCurrencyValue(totalCost)} • Selesai: ${completedLabel}`,
      rows: [],
      type: "poProfitBreakdown",
    });
    setDetailLoading(true);
    try {
      const res = await exec(
        `
          SELECT id, name, quantity, price, cost_price
          FROM purchase_order_items
          WHERE order_id = ?
          ORDER BY id
        `,
        [orderId],
      );
      const rows = [];
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        const qty = Number(row.quantity ?? 0);
        const price = Number(row.price ?? 0);
        const cost = Number(row.cost_price ?? 0);
        const revenue = qty * price;
        const totalCostLine = qty * cost;
        const profit = revenue - totalCostLine;
        const profitLabel = `${profit >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(profit))}`;
        const subtitle = `Qty: ${formatNumberValue(qty)} pcs • Harga jual: ${formatCurrencyValue(price)} • Harga modal: ${formatCurrencyValue(cost)}`;
        rows.push({
          key: `po-item-${row.id}`,
          title: row.name,
          subtitle,
          trailingPrimary: profitLabel,
          trailingSecondary: `Omzet ${formatCurrencyValue(revenue)}`,
        });
      }
      setDetailModal(prev => ({ ...prev, rows }));
    } catch (error) {
      console.log("PO PROFIT DETAIL ERROR:", error);
      setDetailModal({
        visible: true,
        title: "Tidak dapat memuat detail",
        description: "Terjadi kesalahan saat memuat rincian profit purchase order.",
        rows: [],
        type: "poProfitBreakdown",
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
      key: "bookkeepingCount",
      label: "Catatan Pembukuan",
      value: formatNumber(metrics.bookkeepingCount),
      helper: "Total catatan",
      icon: "receipt-outline",
      iconColor: "#7C3AED",
      backgroundColor: "#F3E8FF",
    },
    {
      key: "bookkeepingTotal",
      label: "Total Pembukuan",
      value: formatCurrency(metrics.bookkeepingTotal),
      helper: "Akumulasi nominal",
      icon: "wallet-outline",
      iconColor: "#4338CA",
      backgroundColor: "#E0E7FF",
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
      key: "poProgressValue",
      label: "Nilai Progress",
      value: formatCurrency(metrics.poProgressValue),
      helper: "Estimasi belanja",
      icon: "cash-outline",
      iconColor: "#0EA5E9",
      backgroundColor: "#E0F2FE",
    },
    {
      key: "poProgressProfit",
      label: "Estimasi Profit PO",
      value:
        metrics.poProgressProfit >= 0
          ? formatCurrency(metrics.poProgressProfit)
          : `- ${formatCurrency(Math.abs(metrics.poProgressProfit))}`,
      helper: "Status progress",
      icon: "stats-chart-outline",
      iconColor: "#0EA5E9",
      backgroundColor: "#E0F2FE",
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
    {
      key: "poCancelled",
      label: "PO Cancelled",
      value: formatCurrency(metrics.poCancelledTotal),
      helper: `${formatNumber(metrics.poCancelledCount)} dibatalkan`,
      icon: "close-circle-outline",
      iconColor: "#EF4444",
      backgroundColor: "#FEE2E2",
    },
    {
      key: "itemProfitTotal",
      label: "Profit Barang",
      value:
        metrics.itemProfitTotal >= 0
          ? formatCurrency(metrics.itemProfitTotal)
          : `- ${formatCurrency(Math.abs(metrics.itemProfitTotal))}`,
      helper: "Dari stok keluar",
      icon: "trending-up-outline",
      iconColor: "#16A34A",
      backgroundColor: "#DCFCE7",
    },
    {
      key: "poProfitTotal",
      label: "Profit PO",
      value:
        metrics.poProfitTotal >= 0
          ? formatCurrency(metrics.poProfitTotal)
          : `- ${formatCurrency(Math.abs(metrics.poProfitTotal))}`,
      helper: "PO selesai",
      icon: "pricetag-outline",
      iconColor: "#F97316",
      backgroundColor: "#FFEDD5",
    },
  ];

  const displayCategories = categoryStats.slice(0, 5);
  const displayTopItems = topItems.slice(0, 5);
  const displayRecentPOs = recentPOs.slice(0, 5);
  const displayRecentBookkeeping = recentBookkeeping.slice(0, 5);
  const displayItemProfit = itemProfitLeaders.slice(0, 5);
  const displayPoProfit = poProfitLeaders.slice(0, 5);

  const renderStatsGrid = () => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {stats.map(({ key: cardKey, ...cardProps }) => (
        <StatCard key={cardKey} {...cardProps} onPress={() => openDetail(cardKey)} />
      ))}
    </View>
  );

  const renderCategoryBarAnalytics = () => {
    const topCategories = categoryStats.slice(0, 5);
    const maxStock = topCategories.reduce((max, cat) => Math.max(max, Number(cat.totalStock ?? 0)), 0);
    return (
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 20,
          padding: 20,
          borderWidth: 1,
          borderColor: "#F1F5F9",
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.04,
          shadowRadius: 16,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Distribusi Stok per Kategori</Text>
            <Text style={{ color: "#64748B" }}>
              {topCategories.length
                ? "Top 5 kategori berdasarkan jumlah stok"
                : "Belum ada data kategori"}
            </Text>
          </View>
          {topCategories.length ? (
            <TouchableOpacity onPress={() => setActiveTab("inventory")}>
              <Text style={{ color: "#2563EB", fontWeight: "600" }}>Ke tab inventori</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {topCategories.length ? (
          <View style={{ gap: 14 }}>
            {topCategories.map((cat, index) => {
              const totalStock = Number(cat.totalStock ?? 0);
              const ratio = maxStock > 0 ? totalStock / maxStock : 0;
              const widthPercent = Math.min(100, Math.max(ratio * 100, totalStock > 0 ? 6 : 0));
              const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
              return (
                <View key={`${cat.label || "Tanpa Kategori"}-${index}`} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontWeight: "600", color: "#0F172A", flex: 1, paddingRight: 12 }}
                    >
                      {cat.label}
                    </Text>
                    <Text style={{ color: "#475569", fontWeight: "600" }}>{formatNumber(totalStock)} stok</Text>
                  </View>
                  <View style={{ height: 10, borderRadius: 999, backgroundColor: "#E2E8F0", overflow: "hidden" }}>
                    <View style={{ width: `${widthPercent}%`, height: "100%", backgroundColor: color }} />
                  </View>
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                    {`${formatNumber(Number(cat.totalItems ?? 0))} barang • ${formatCurrency(Number(cat.totalValue ?? 0))}`}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ paddingVertical: 12 }}>
            <Text style={{ color: "#94A3B8" }}>Belum ada data kategori. Tambahkan barang terlebih dahulu.</Text>
          </View>
        )}
      </View>
    );
  };

  const renderBookkeepingTrendAnalytics = () => {
    const data = bookkeepingTrend;
    const hasData = data.length > 0;
    const { width: chartWidth, height: chartHeight } = chartDimensions;
    const totals = data.map(item => Number(item.total ?? 0));
    const maxAmount = totals.length ? Math.max(...totals, 0) : 0;
    const minAmount = totals.length ? Math.min(...totals, 0) : 0;
    const range = maxAmount - minAmount || 1;
    const coordinates = data.map((item, index) => {
      const value = Number(item.total ?? 0);
      const x = data.length <= 1 ? chartWidth / 2 : (chartWidth / Math.max(data.length - 1, 1)) * index;
      const y = chartHeight - ((value - minAmount) / range) * chartHeight;
      return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? Math.min(chartHeight, Math.max(0, y)) : chartHeight,
        item,
      };
    });
    const linePoints = coordinates.map(point => `${point.x},${point.y}`).join(" ");
    const totalAmount = totals.reduce((sum, value) => sum + value, 0);
    const latest = data[data.length - 1];
    const formattedTotal =
      totalAmount >= 0
        ? formatCurrency(totalAmount)
        : `- ${formatCurrency(Math.abs(totalAmount))}`;
    const latestLabel = latest
      ? latest.total >= 0
        ? `Terbaru: + ${formatCurrency(latest.total)}`
        : `Terbaru: - ${formatCurrency(Math.abs(latest.total))}`
      : "Belum ada catatan";
    return (
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 20,
          padding: 20,
          borderWidth: 1,
          borderColor: "#F1F5F9",
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.04,
          shadowRadius: 16,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Tren Pembukuan 7 Hari</Text>
            <Text style={{ color: "#64748B" }}>
              {hasData ? `${data.length} hari terakhir • Total ${formattedTotal}` : "Belum ada catatan pembukuan"}
            </Text>
          </View>
          {hasData ? (
            <TouchableOpacity onPress={() => setActiveTab("bookkeeping")}>
              <Text style={{ color: "#2563EB", fontWeight: "600" }}>Ke tab pembukuan</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {hasData ? (
          <>
            <View
              style={{
                backgroundColor: "#F8FAFC",
                borderRadius: 12,
                paddingVertical: 16,
                paddingHorizontal: 12,
              }}
            >
              <Svg height={chartHeight} width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                {linePoints ? (
                  <Polyline
                    points={linePoints}
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null}
                {coordinates.map(({ x, y, item }, index) => (
                  <Circle
                    key={`${item.date}-${index}`}
                    cx={x}
                    cy={y}
                    r={4}
                    fill="#2563EB"
                  />
                ))}
              </Svg>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
              {coordinates.map(({ item }, index) => (
                <View key={`${item.date}-${index}-label`} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: "#64748B", fontSize: 12 }}>{item.shortLabel}</Text>
                </View>
              ))}
            </View>
            <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 12 }}>{latestLabel}</Text>
          </>
        ) : (
          <View style={{ paddingVertical: 12 }}>
            <Text style={{ color: "#94A3B8" }}>Catatan pembukuan akan tampil di sini setelah Anda menambah transaksi.</Text>
          </View>
        )}
      </View>
    );
  };

  const renderProfitSnapshot = () => {
    const items = [
      {
        key: "item",
        label: "Profit Barang",
        description: "Akumulasi dari transaksi stok keluar",
        value: Number(metrics.itemProfitTotal ?? 0),
      },
      {
        key: "po",
        label: "Profit Purchase Order",
        description: "Akumulasi dari PO selesai",
        value: Number(metrics.poProfitTotal ?? 0),
      },
    ];
    const maxAbs = items.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0);
    const hasInsight = maxAbs > 0;
    return (
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 20,
          padding: 20,
          borderWidth: 1,
          borderColor: "#F1F5F9",
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.04,
          shadowRadius: 16,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Sorotan Profit</Text>
            <Text style={{ color: "#64748B" }}>
              {hasInsight ? "Perbandingan sumber profit utama" : "Belum ada data profit"}
            </Text>
          </View>
          {hasInsight ? (
            <TouchableOpacity onPress={() => setActiveTab("profit")}>
              <Text style={{ color: "#2563EB", fontWeight: "600" }}>Ke tab profit</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={{ gap: 16 }}>
          {items.map(item => {
            const positive = item.value >= 0;
            const barColor = positive ? "#16A34A" : "#DC2626";
            const widthPercent = maxAbs ? Math.min(100, Math.max((Math.abs(item.value) / maxAbs) * 100, item.value !== 0 ? 6 : 0)) : 0;
            const formattedValue = positive
              ? `+ ${formatCurrency(item.value)}`
              : `- ${formatCurrency(Math.abs(item.value))}`;
            return (
              <View key={item.key} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "600", color: "#0F172A" }}>{item.label}</Text>
                  <Text style={{ fontWeight: "700", color: barColor }}>{formattedValue}</Text>
                </View>
                <View style={{ height: 10, borderRadius: 999, backgroundColor: "#E2E8F0", overflow: "hidden" }}>
                  <View style={{ width: `${widthPercent}%`, height: "100%", backgroundColor: barColor }} />
                </View>
                <Text style={{ color: "#94A3B8", fontSize: 12 }}>{item.description}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderCategorySummaryCard = () => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Ringkasan Kategori</Text>
          <Text style={{ color: "#64748B" }}>{categoryStats.length ? `${categoryStats.length} kategori` : "Belum ada data"}</Text>
        </View>
        {categoryStats.length ? (
          <TouchableOpacity onPress={() => openPaginatedDetail("categoriesFull")}>
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Lihat semua</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {categoryStats.length ? (
        displayCategories.map((cat, index) => (
          <View
            key={`${cat.label}-${index}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
              borderTopWidth: index === 0 ? 0 : 1,
              borderColor: "#F1F5F9",
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                alignItems: "center",
                justifyContent: "center",
                marginRight: 14,
              }}
            >
              <MaterialCommunityIcons name="shape-outline" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>{cat.label}</Text>
              <Text style={{ color: "#64748B", fontSize: 12 }}>{`${formatNumber(cat.totalItems)} barang • ${formatNumber(cat.totalStock)} stok`}</Text>
            </View>
            <Text style={{ color: "#0F172A", fontWeight: "700" }}>{formatCurrency(cat.totalValue)}</Text>
          </View>
        ))
      ) : (
        <View style={{ paddingVertical: 16 }}>
          <Text style={{ color: "#94A3B8" }}>Belum ada data kategori. Tambahkan barang terlebih dahulu.</Text>
        </View>
      )}
    </View>
  );

  const renderTopItemsCard = () => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Barang Tersedia</Text>
          <Text style={{ color: "#64748B" }}>{topItems.length ? `${topItems.length} item` : "Belum ada stok"}</Text>
        </View>
        {topItems.length ? (
          <TouchableOpacity onPress={() => openPaginatedDetail("itemsFull")}>
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Lihat semua</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {topItems.length ? (
        displayTopItems.map((item, index) => (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
              borderTopWidth: index === 0 ? 0 : 1,
              borderColor: "#F1F5F9",
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: "#E0F2FE",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 14,
              }}
            >
              <Ionicons name="cube" size={22} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: "#0F172A" }}>{item.name}</Text>
              <Text style={{ color: "#64748B", fontSize: 12 }}>{`${item.category || "Tanpa kategori"} • ${formatNumber(item.stock)} stok`}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: "#0F172A", fontWeight: "700" }}>{formatCurrency(item.totalValue)}</Text>
              <Text style={{ color: "#94A3B8", fontSize: 12 }}>{`@ ${formatCurrency(item.price)}`}</Text>
            </View>
          </View>
        ))
      ) : (
        <View style={{ paddingVertical: 16 }}>
          <Text style={{ color: "#94A3B8" }}>Belum ada stok tersimpan. Tambahkan barang untuk melihat ringkasan.</Text>
        </View>
      )}
    </View>
  );

  const renderBookkeepingCard = () => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Pembukuan Terbaru</Text>
          <Text style={{ color: "#64748B" }}>
            {recentBookkeeping.length ? `${recentBookkeeping.length} catatan` : "Belum ada catatan"}
          </Text>
        </View>
        {recentBookkeeping.length ? (
          <TouchableOpacity onPress={() => openPaginatedDetail("bookkeepingFull")}>
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Lihat semua</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {recentBookkeeping.length ? (
        displayRecentBookkeeping.map((entry, index) => {
          const noteText = entry.note && String(entry.note).trim() ? String(entry.note) : "";
          const subtitle = noteText
            ? `${formatDateDisplay(entry.entryDate)} • ${noteText}`
            : formatDateDisplay(entry.entryDate);
          return (
            <TouchableOpacity
              key={entry.id}
              activeOpacity={0.7}
              onPress={() =>
                navigateToRoot("BookkeepingDetail", {
                  entryId: entry.id,
                  initialEntry: entry,
                })
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: "#F1F5F9",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: "#E0E7FF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <Ionicons name="wallet-outline" size={22} color="#4338CA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: "#0F172A" }}>{entry.name}</Text>
                <Text style={{ color: "#64748B", fontSize: 12 }}>{subtitle}</Text>
              </View>
              <Text style={{ color: "#0F172A", fontWeight: "700" }}>{formatCurrency(entry.amount)}</Text>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={{ paddingVertical: 16 }}>
          <Text style={{ color: "#94A3B8" }}>Belum ada catatan pembukuan.</Text>
        </View>
      )}
    </View>
  );

  const renderItemProfitCard = () => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Profit Barang</Text>
          <Text style={{ color: "#64748B" }}>
            {itemProfitLeaders.length ? `${itemProfitLeaders.length} barang` : "Belum ada data"}
          </Text>
        </View>
        {itemProfitLeaders.length ? (
          <TouchableOpacity onPress={() => openPaginatedDetail("itemProfit")}>
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Lihat semua</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {displayItemProfit.length ? (
        displayItemProfit.map((entry, index) => {
          const profit = Number(entry.totalProfit ?? 0);
          const profitLabel = `${profit >= 0 ? "+" : "-"} ${formatCurrency(Math.abs(profit))}`;
          const profitColor = profit >= 0 ? "#16A34A" : "#DC2626";
          const qtyLabel = formatNumber(entry.totalQty ?? 0);
          const lastLabel = entry.lastActivity
            ? formatDateTimeDisplay(entry.lastActivity)
            : "Belum ada transaksi";
          const categoryLabel = entry.category && entry.category.trim() ? entry.category : "Tanpa kategori";
          return (
            <TouchableOpacity
              key={`item-profit-${entry.itemId ?? index}`}
              onPress={() => openItemProfitDetail(entry)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: "#F1F5F9",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: "#DCFCE7",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <Ionicons name="trending-up-outline" size={22} color="#16A34A" />
              </View>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontWeight: "700", color: "#0F172A" }}>{entry.name}</Text>
                <Text style={{ color: "#64748B", fontSize: 12 }}>{`${categoryLabel} • ${qtyLabel} pcs`}</Text>
                <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>{`Terakhir: ${lastLabel}`}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: profitColor, fontWeight: "700" }}>{profitLabel}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={{ paddingVertical: 16 }}>
          <Text style={{ color: "#94A3B8" }}>Belum ada data profit barang. Catat transaksi keluar untuk melihat hasil.</Text>
        </View>
      )}
    </View>
  );

  const renderPoProfitCard = () => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Profit Purchase Order</Text>
          <Text style={{ color: "#64748B" }}>
            {poProfitLeaders.length ? `${poProfitLeaders.length} PO selesai` : "Belum ada data"}
          </Text>
        </View>
        {poProfitLeaders.length ? (
          <TouchableOpacity onPress={() => openPaginatedDetail("poProfit")}>
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Lihat semua</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {displayPoProfit.length ? (
        displayPoProfit.map((entry, index) => {
          const profit = Number(entry.totalProfit ?? 0);
          const profitLabel = `${profit >= 0 ? "+" : "-"} ${formatCurrency(Math.abs(profit))}`;
          const profitColor = profit >= 0 ? "#16A34A" : "#DC2626";
          const revenueLabel = formatCurrency(entry.totalValue ?? 0);
          const qtyLabel = formatNumber(entry.totalQuantity ?? 0);
          const partyLabel = entry.supplierName && entry.supplierName.trim()
            ? `${entry.ordererName || "Tanpa pemesan"} • ${entry.supplierName}`
            : entry.ordererName || "Tanpa pemesan";
          const completedLabel = entry.completedAt
            ? formatDateTimeDisplay(entry.completedAt)
            : formatDateDisplay(entry.orderDate);
          const itemLabel = buildOrderItemLabel(
            entry.primaryItemName || "",
            entry.itemCount || (entry.primaryItemName ? 1 : 0),
          );
          return (
            <TouchableOpacity
              key={`po-profit-${entry.id}`}
              onPress={() => openPoProfitDetail(entry)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: "#F1F5F9",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: "#FEF3C7",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <Ionicons name="pricetag-outline" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontWeight: "700", color: "#0F172A" }}>{itemLabel}</Text>
                <Text style={{ color: "#64748B", fontSize: 12 }}>{`${partyLabel} • ${completedLabel}`}</Text>
                <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>{`Qty: ${qtyLabel} pcs • Omzet ${revenueLabel}`}</Text>
              </View>
              <Text style={{ color: profitColor, fontWeight: "700" }}>{profitLabel}</Text>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={{ paddingVertical: 16 }}>
          <Text style={{ color: "#94A3B8" }}>
            Belum ada PO selesai dengan data profit. Tandai PO selesai untuk melihat ringkasan.
          </Text>
        </View>
      )}
    </View>
  );

  const renderRecentPoCard = () => (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: "#F1F5F9",
        shadowColor: "#0F172A",
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>PO Terbaru</Text>
          <Text style={{ color: "#64748B" }}>{recentPOs.length ? `${recentPOs.length} data` : "Belum ada PO"}</Text>
        </View>
        {recentPOs.length ? (
          <TouchableOpacity onPress={() => openPaginatedDetail("poFull")}>
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Lihat semua</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {recentPOs.length ? (
        displayRecentPOs.map((po, index) => {
          const totalValue = Number(po.totalValue ?? 0);
          const totalQuantity = Number(po.totalQuantity ?? 0);
          const itemsCount = Number(po.itemsCount ?? 0);
          const statusStyle = getPOStatusStyle(po.status);
          return (
            <View
              key={po.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: "#F1F5F9",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: "#FEF3C7",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <Ionicons name="cart-outline" size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: "#0F172A" }}>{po.itemName}</Text>
                <Text style={{ color: "#64748B", fontSize: 12 }}>{`${po.ordererName || "Tanpa pemesan"} • ${formatDateDisplay(po.orderDate)} • ${statusStyle.label}`}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: "#0F172A", fontWeight: "700" }}>{formatCurrency(totalValue)}</Text>
                <Text style={{ color: "#94A3B8", fontSize: 12 }}>{`${formatNumber(itemsCount || (totalQuantity > 0 ? 1 : 0))} barang • ${formatNumber(totalQuantity)} pcs`}</Text>
              </View>
            </View>
          );
        })
      ) : (
        <View style={{ paddingVertical: 16 }}>
          <Text style={{ color: "#94A3B8" }}>Belum ada purchase order tercatat.</Text>
        </View>
      )}
    </View>
  );

  const activeTabSections = (() => {
    switch (activeTab) {
      case "summary":
        return [
          renderStatsGrid(),
          renderCategoryBarAnalytics(),
          renderBookkeepingTrendAnalytics(),
          renderProfitSnapshot(),
        ];
      case "inventory":
        return [renderCategorySummaryCard(), renderTopItemsCard()];
      case "purchase":
        return [renderRecentPoCard()];
      case "bookkeeping":
        return [renderBookkeepingCard()];
      case "profit":
        return [renderItemProfitCard(), renderPoProfitCard()];
      default:
        return [renderStatsGrid()];
    }
  })();

  const formatShortCurrency = (value) => {
    if (value >= 1000000000) {
      return `Rp ${(value / 1000000000).toFixed(1).replace(".", ",")} Miliar`;
    } else if (value >= 1000000) {
      const jt = value / 1000000;
      return `Rp ${jt % 1 === 0 ? jt.toFixed(0) : jt.toFixed(1).replace(".", ",")}Jt`;
    }
    return formatCurrencyValue(value);
  };


  const getFormattedLocalDate = () => {
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const d = new Date();
    const dayName = days[d.getDay()];
    const date = d.getDate();
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();
    return `${dayName}, ${date} ${monthName} ${year}`;
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#0F172A" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: "#F8FAFC" }}
          contentContainerStyle={{ paddingBottom: 24 + tabBarHeight }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#fff" />}
        >
        {/* Dark Header Container with Pemanis Header */}
        <View style={{ backgroundColor: "#0F172A", padding: 20, paddingBottom: 28 }}>
          {/* Header row */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="cube" size={24} color="#14B8A6" />
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 }}>
                BukuToko
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate("GoogleSheets")}>
                <Ionicons name="grid" size={22} color="#34A853" />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate("Notifications")}
                style={{ position: "relative", padding: 4 }}
              >
                <Ionicons name="notifications-outline" size={24} color="#fff" />
                {unreadNotificationsCount > 0 && (
                  <View style={{
                    position: "absolute",
                    right: 2,
                    top: 2,
                    backgroundColor: "#EF4444",
                    borderRadius: 7,
                    width: 14,
                    height: 14,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: "#0F172A",
                  }}>
                    <Text style={{ color: "#fff", fontSize: 8, fontWeight: "700", textAlign: "center" }}>
                      {unreadNotificationsCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate("History")}>
                <Ionicons name="time-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate("DataManagement")}>
                <Ionicons name="settings-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Welcome and Date row (Pemanis Header) */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "500" }}>
                Selamat bekerja kembali!
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setTempStoreName(storeName);
                  setStoreNameModalVisible(true);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}
              >
                <Text style={{ color: "#E2E8F0", fontSize: 16, fontWeight: "700" }}>
                  {storeName}
                </Text>
                <Ionicons name="pencil-sharp" size={12} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Today's Date (Pemanis Header) */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: "flex-start", marginTop: 18 }}>
            <Ionicons name="calendar-outline" size={14} color="#94A3B8" />
            <Text style={{ color: "#E2E8F0", fontSize: 12, fontWeight: "600" }}>
              {getFormattedLocalDate()}
            </Text>
          </View>
        </View>

        {/* Group Cards Container */}
        <View style={{ padding: 16, gap: 16 }}>
          
          {/* Group 1: Inventori Gudang */}
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              shadowColor: "#0F172A",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.03,
              shadowRadius: 10,
              elevation: 1,
            }}
          >
            {/* Group Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F0FDFA", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="cube-outline" size={20} color="#0D9488" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Inventori & Gudang</Text>
            </View>

            {/* Group Stats */}
            <View style={{ borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingBottom: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="cube-outline" size={12} color="#0D9488" />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Total Barang</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>
                    {formatNumberValue(metrics.totalItems)}
                  </Text>
                </View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: "#F1F5F9", paddingLeft: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="albums-outline" size={12} color="#0D9488" />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Total Qty Stok</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>
                    {formatNumberValue(metrics.totalStock)}
                  </Text>
                </View>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingTop: 12, marginTop: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="cash-outline" size={12} color="#0D9488" />
                  <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Nilai Persediaan</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>
                  {formatCurrencyValue(metrics.totalValue)}
                </Text>
              </View>
            </View>

            {/* Group Search Input */}
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 8, height: 32, marginBottom: 12 }}>
              <Ionicons name="search-outline" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
              <TextInput
                placeholder="Cari barang berstok rendah..."
                value={gudangSearch}
                onChangeText={setGudangSearch}
                style={{ flex: 1, fontSize: 12, color: "#334155", paddingVertical: 0 }}
                placeholderTextColor="#94A3B8"
              />
              {!!gudangSearch && (
                <TouchableOpacity onPress={() => setGudangSearch("")}>
                  <Ionicons name="close-circle" size={14} color="#CBD5E1" />
                </TouchableOpacity>
              )}
            </View>

            {/* Group Preview: Critical / Action Items */}
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 8 }}>
              {gudangSearch.trim() ? "Hasil Pencarian Barang" : "Barang Berstok Rendah"}
            </Text>
            <View style={{ marginBottom: 16 }}>
              {(() => {
                const filtered = gudangSearch.trim()
                  ? gudangSearchResults.slice(0, 5)
                  : priorityItems;
                
                if (filtered.length > 0) {
                  return filtered.map((item, index) => {
                    let iconName = "cube-outline";
                    let iconBg = "#F8FAFC";
                    let iconColor = "#64748B";
                    const lowerName = item.name.toLowerCase();
                    
                    if (lowerName.includes("minyak")) {
                      iconName = "water";
                      iconBg = "#FEF3C7";
                      iconColor = "#D97706";
                    } else if (lowerName.includes("kardus") || lowerName.includes("kemasan")) {
                      iconName = "cube-outline";
                      iconBg = "#FFEDD5";
                      iconColor = "#EA580C";
                    } else if (lowerName.includes("pita") || lowerName.includes("perekat")) {
                      iconName = "cut-outline";
                      iconBg = "#F3E8FF";
                      iconColor = "#7C3AED";
                    }

                    return (
                      <TouchableOpacity
                        key={item.id || index}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate("ItemDetail", { itemId: item.id, onDone: load })}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingVertical: 10,
                          borderBottomWidth: index === filtered.length - 1 ? 0 : 1,
                          borderBottomColor: "#F8FAFC",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name={iconName} size={16} color={iconColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }} numberOfLines={1}>{item.name}</Text>
                            {item.stock <= 5 && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                                <Ionicons name="warning" size={10} color="#EF4444" />
                                <Text style={{ fontSize: 9, fontWeight: "700", color: "#EF4444" }}>
                                  Stok kritis! Tinggal {item.stock} pcs
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#EF4444" }}>
                          {item.stock} pcs
                        </Text>
                      </TouchableOpacity>
                    );
                  });
                }
                
                return (
                  <View style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC", borderRadius: 12 }}>
                    <Ionicons name="checkmark-circle-outline" size={24} color="#0D9488" style={{ marginBottom: 4 }} />
                    <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "500" }}>
                      {gudangSearch.trim() ? "Tidak ada hasil pencarian." : "Semua stok barang aman."}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Group Actions */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate("Barang", { screen: "BarangMain", params: { search: gudangSearch } })}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#0D9488",
                  backgroundColor: "#fff",
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#0D9488", fontWeight: "600", fontSize: 13 }}>Lihat Gudang</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate("History")}
                style={{
                  flex: 1,
                  backgroundColor: "#0D9488",
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Riwayat Stok</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Group 2: Logistik & PO */}
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              shadowColor: "#0F172A",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.03,
              shadowRadius: 10,
              elevation: 1,
            }}
          >
            {/* Group Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F0F9FF", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="document-text-outline" size={20} color="#0284C7" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Logistik & Purchase Order</Text>
            </View>

            {/* Group Stats (3-Row Grid) */}
            <View style={{ borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingBottom: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="receipt-outline" size={12} color="#0284C7" />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Total PO</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>
                    {formatNumberValue(metrics.poCount)}
                  </Text>
                </View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: "#F1F5F9", paddingLeft: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="time-outline" size={12} color="#0EA5E9" />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Diproses (Sent)</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0EA5E9", marginTop: 4 }}>
                    {formatNumberValue(metrics.poProgress)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="checkmark-circle-outline" size={12} color="#10B981" />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Diterima (Done)</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#10B981", marginTop: 4 }}>
                    {formatNumberValue(metrics.poDone)}
                  </Text>
                </View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: "#F1F5F9", paddingLeft: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="cart-outline" size={12} color="#F59E0B" />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Total Belanja</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>
                    {formatCurrencyValue(metrics.poTotalValue)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="trending-up-outline" size={12} color="#0EA5E9" />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Estimasi Profit</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0EA5E9", marginTop: 4 }}>
                    {formatCurrencyValue(metrics.poProgressProfit)}
                  </Text>
                </View>
                <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: "#F1F5F9", paddingLeft: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="wallet-outline" size={12} color="#10B981" />
                    <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Total Profit</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#10B981", marginTop: 4 }}>
                    {formatCurrencyValue(metrics.poDoneProfit)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Group Search Input */}
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 8, height: 32, marginBottom: 12 }}>
              <Ionicons name="search-outline" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
              <TextInput
                placeholder="Cari supplier, ID PO, atau barang..."
                value={poSearch}
                onChangeText={setPoSearch}
                style={{ flex: 1, fontSize: 12, color: "#334155", paddingVertical: 0 }}
                placeholderTextColor="#94A3B8"
              />
              {!!poSearch && (
                <TouchableOpacity onPress={() => setPoSearch("")}>
                  <Ionicons name="close-circle" size={14} color="#CBD5E1" />
                </TouchableOpacity>
              )}
            </View>

            {/* Group Preview: Last PO */}
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 8 }}>
              {poSearch.trim() ? "Hasil Pencarian PO" : "Purchase Order Terbaru"}
            </Text>
            <View style={{ marginBottom: 16 }}>
              {(() => {
                const filtered = poSearch.trim()
                  ? poSearchResults
                  : recentPOs;

                if (filtered.length > 0) {
                  const displayList = poSearch.trim() ? filtered.slice(0, 5) : filtered.slice(0, 3);
                  return (
                    <View style={{ backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2 }}>
                      {displayList.map((po, index) => {
                        let badgeText = "Pending";
                        let badgeBg = "#FEF3C7";
                        let badgeColor = "#B45309";

                        if (po.status === "DONE") {
                          badgeText = "Diterima";
                          badgeBg = "#E6F4EA";
                          badgeColor = "#0D9488";
                        } else if (po.status === "PROGRESS") {
                          badgeText = "Sent";
                          badgeBg = "#E0F2FE";
                          badgeColor = "#0284C7";
                        } else if (po.status === "CANCELLED") {
                          badgeText = "Batal";
                          badgeBg = "#FEE2E2";
                          badgeColor = "#EF4444";
                        }

                        return (
                          <TouchableOpacity
                            key={po.id || index}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate("PurchaseOrderDetail", { orderId: po.id, onDone: load })}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              paddingVertical: 10,
                              borderBottomWidth: index === displayList.length - 1 ? 0 : 1,
                              borderBottomColor: "#E2E8F0",
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>
                                {`PO-W2026-${String(po.id).padStart(3, "0")}`}
                              </Text>
                              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }} numberOfLines={1}>
                                Pemasok: {po.supplierName || "Tanpa Supplier"} • Pemesan: {po.ordererName || "-"}
                              </Text>
                              <Text style={{ fontSize: 11, color: "#475569", marginTop: 2 }} numberOfLines={1}>
                                {po.itemName || "Tanpa barang"}
                              </Text>
                            </View>
                            <View style={{ alignItems: "flex-end", gap: 6 }}>
                              <View style={{ backgroundColor: badgeBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                                <Text style={{ fontSize: 10, fontWeight: "700", color: badgeColor }}>{badgeText}</Text>
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: "#334155" }}>
                                {formatCurrencyValue(po.totalValue)}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                }
                
                return (
                  <View style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC", borderRadius: 12 }}>
                    <Ionicons name="cart-outline" size={24} color="#0284C7" style={{ marginBottom: 4 }} />
                    <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "500" }}>
                      {poSearch.trim() ? "Tidak ada hasil pencarian." : "Belum ada PO tercatat."}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Group Actions */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate("AddPurchaseOrder", { onDone: load })}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#0284C7",
                  backgroundColor: "#fff",
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#0284C7", fontWeight: "600", fontSize: 13 }}>Tambah PO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate("PO", { screen: "POMain", params: { search: poSearch } })}
                style={{
                  flex: 1,
                  backgroundColor: "#0284C7",
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Kelola PO</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Group 3: Keuangan & Pembukuan */}
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              shadowColor: "#0F172A",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.03,
              shadowRadius: 10,
              elevation: 1,
            }}
          >
            {/* Group Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="wallet-outline" size={20} color="#EA580C" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Keuangan & Buku Kas</Text>
            </View>

            {/* Group Stats (2 Columns - Profit Removed) */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingBottom: 16, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="book-outline" size={12} color="#EA580C" />
                  <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Catatan Kas</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>
                  {formatNumberValue(metrics.bookkeepingCount)}
                </Text>
              </View>
              <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: "#F1F5F9", paddingLeft: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="wallet-outline" size={12} color="#16A34A" />
                  <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase" }}>Total Saldo</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>
                  {formatCurrencyValue(metrics.bookkeepingTotal)}
                </Text>
              </View>
            </View>

            {/* Group Search Input */}
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 8, height: 32, marginBottom: 12 }}>
              <Ionicons name="search-outline" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
              <TextInput
                placeholder="Cari transaksi kas..."
                value={kasSearch}
                onChangeText={setKasSearch}
                style={{ flex: 1, fontSize: 12, color: "#334155", paddingVertical: 0 }}
                placeholderTextColor="#94A3B8"
              />
              {!!kasSearch && (
                <TouchableOpacity onPress={() => setKasSearch("")}>
                  <Ionicons name="close-circle" size={14} color="#CBD5E1" />
                </TouchableOpacity>
              )}
            </View>

            {/* Group Preview: Last Kas Entry */}
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 8 }}>
              {kasSearch.trim() ? "Hasil Pencarian Transaksi" : "Transaksi Terakhir"}
            </Text>
            <View style={{ marginBottom: 16 }}>
              {(() => {
                const filtered = kasSearch.trim()
                  ? kasSearchResults
                  : recentBookkeeping;

                if (filtered.length > 0) {
                  const displayList = kasSearch.trim() ? filtered.slice(0, 5) : filtered.slice(0, 3);
                  return (
                    <View style={{ backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2 }}>
                      {displayList.map((entry, index) => {
                        const isExpense = entry.amount < 0;
                        return (
                          <TouchableOpacity
                            key={entry.id || index}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate("BookkeepingDetail", { entryId: entry.id })}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              paddingVertical: 10,
                              borderBottomWidth: index === displayList.length - 1 ? 0 : 1,
                              borderBottomColor: "#E2E8F0",
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }} numberOfLines={1}>
                                {entry.name}
                              </Text>
                              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                                {formatDateDisplay(entry.entryDate)}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: isExpense ? "#EF4444" : "#16A34A",
                              }}
                            >
                               {isExpense ? "" : "+"}{formatCurrencyValue(entry.amount)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                }
                
                return (
                  <View style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC", borderRadius: 12 }}>
                    <Ionicons name="wallet-outline" size={24} color="#EA580C" style={{ marginBottom: 4 }} />
                    <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "500" }}>
                      {kasSearch.trim() ? "Tidak ada hasil pencarian." : "Belum ada transaksi kas."}
                    </Text>
                  </View>
                );
              })()}
            </View>

            {/* Group Actions */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate("AddBookkeeping")}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#EA580C",
                  backgroundColor: "#fff",
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#EA580C", fontWeight: "600", fontSize: 13 }}>Catat Kas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate("Pembukuan", { screen: "PembukuanMain", params: { search: kasSearch } })}
                style={{
                  flex: 1,
                  backgroundColor: "#EA580C",
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Kelola Kas</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={detailModal.visible} transparent animationType="fade" onRequestClose={closeDetail} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.35)", padding: 16 }} onPress={closeDetail}>
          {renderDetailModalBody()}
        </Pressable>
      </Modal>

      <Modal visible={storeNameModalVisible} transparent animationType="fade" onRequestClose={() => setStoreNameModalVisible(false)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "center", padding: 20 }} onPress={() => setStoreNameModalVisible(false)}>
          <Pressable style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, shadowColor: "#0F172A", shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 }} onPress={e => e.stopPropagation()}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Ubah Nama Toko / Gudang</Text>
              <TouchableOpacity onPress={() => setStoreNameModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: "#64748B", fontSize: 13, marginBottom: 16 }}>
              Masukkan nama toko atau gudang Anda untuk ditampilkan di halaman beranda.
            </Text>
            <TextInput
              placeholder="Nama Toko / Gudang"
              value={tempStoreName}
              onChangeText={setTempStoreName}
              style={{
                backgroundColor: "#F1F5F9",
                borderRadius: 12,
                paddingHorizontal: 16,
                height: 48,
                fontSize: 15,
                color: "#0F172A",
                marginBottom: 20,
              }}
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setStoreNameModalVisible(false)}
                style={{
                  flex: 1,
                  backgroundColor: "#F1F5F9",
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#475569", fontWeight: "700" }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveStoreName}
                style={{
                  flex: 1,
                  backgroundColor: "#0D9488",
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
