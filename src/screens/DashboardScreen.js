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
  Platform,
  Dimensions,
  Animated,
  Easing,
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

export default function DashboardScreen({ navigation }) {
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
    bookkeepingCount: 0,
    bookkeepingTotal: 0,
    itemProfitTotal: 0,
    poProfitTotal: 0,
  });
  const [categoryStats, setCategoryStats] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [recentPOs, setRecentPOs] = useState([]);
  const [recentBookkeeping, setRecentBookkeeping] = useState([]);
  const [itemProfitLeaders, setItemProfitLeaders] = useState([]);
  const [poProfitLeaders, setPoProfitLeaders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [detailModal, setDetailModal] = useState({ visible: false, title: "", description: "", rows: [], type: null });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadingMore, setDetailLoadingMore] = useState(false);
  const [detailHasMore, setDetailHasMore] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailSearchInput, setDetailSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("summary");
  const [tooltipTab, setTooltipTab] = useState(null);
  const tabTransition = useRef(new Animated.Value(1)).current;
  const tabTransitioningRef = useRef(false);
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
            IFNULL(SUM(items.quantity * (items.price - items.cost_price)), 0) as total_profit,
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
  const easeIn = useMemo(() => Easing.in(Easing.ease), []);
  const handleTabPress = useCallback(
    key => {
      if (key === activeTab) {
        setTooltipTab(null);
        return;
      }
      if (tabTransitioningRef.current) {
        return;
      }
      tabTransitioningRef.current = true;
      Animated.timing(tabTransition, {
        toValue: 0.8,
        duration: 100,
        easing: easeIn,
        useNativeDriver: true,
      }).start(() => {
        tabTransition.setValue(0.9);
        setActiveTab(key);
        setTooltipTab(null);
        Animated.timing(tabTransition, {
          toValue: 1,
          duration: 120,
          easing: easeIn,
          useNativeDriver: true,
        }).start(() => {
          tabTransitioningRef.current = false;
        });
      });
    },
    [activeTab, easeIn, tabTransition],
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
          IFNULL(SUM(total_quantity), 0) as totalQuantity,
          IFNULL(SUM(total_value), 0) as totalValue,
          SUM(CASE WHEN status = 'PROGRESS' THEN 1 ELSE 0 END) as progressOrders
        FROM (
          SELECT
            po.id,
            po.status,
            IFNULL(SUM(items.quantity), 0) as total_quantity,
            IFNULL(SUM(items.quantity * items.price), 0) as total_value
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
          COALESCE(
            (SELECT name FROM purchase_order_items first_items WHERE first_items.order_id = po.id ORDER BY first_items.id LIMIT 1),
            ''
          ) as primary_item_name
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
        SELECT IFNULL(SUM(items.quantity * (items.price - items.cost_price)), 0) as total_profit
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
          IFNULL(SUM(items.quantity * (items.price - items.cost_price)), 0) as total_profit,
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

      setCategoryStats(nextCategoryStats);
      setTopItems(nextTopItems);
      setRecentPOs(nextRecentPOs);
      setRecentBookkeeping(nextRecentBookkeeping);
      setItemProfitLeaders(nextItemProfitLeaders);
      setPoProfitLeaders(nextPoProfitLeaders);
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
        bookkeepingCount: Number(bookkeepingSummaryRow.totalEntries ?? 0),
        bookkeepingTotal: Number(bookkeepingSummaryRow.totalAmount ?? 0),
        itemProfitTotal,
        poProfitTotal,
      });
    } catch (error) {
      console.log("DASHBOARD LOAD ERROR:", error);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);
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

  async function handleDetailRowPress(row) {
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
        navigation.navigate("ItemDetail", {
          itemId: itemRow.id,
          initialItem: {
            id: itemRow.id,
            name: itemRow.name,
            category: itemRow.category,
            price: Number(itemRow.price ?? 0),
            stock: Number(itemRow.stock ?? 0),
          },
          onDone: load,
        });
      } catch (error) {
        console.log("ITEM DETAIL OPEN ERROR:", error);
        Alert.alert("Gagal", "Tidak dapat membuka detail barang.");
      }
    } else if (row.entityType === "po") {
      const orderId = Number(row.entityId);
      if (!Number.isFinite(orderId)) return;
      closeDetail();
      navigation.navigate("PurchaseOrderDetail", {
        orderId,
        onDone: load,
      });
    } else if (row.entityType === "bookkeeping") {
      const entryId = Number(row.entityId);
      if (!Number.isFinite(entryId)) return;
      closeDetail();
      navigation.navigate("BookkeepingDetail", {
        entryId,
        onDone: load,
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
      poValue: "poValue",
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
      key: "poValue",
      label: "Nilai PO",
      value: formatCurrency(metrics.poTotalValue),
      helper: "Total belanja",
      icon: "document-text-outline",
      iconColor: "#A855F7",
      backgroundColor: "#F5E8FF",
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
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          shadowColor: "#0F172A",
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 2,
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
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          shadowColor: "#0F172A",
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 2,
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
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          shadowColor: "#0F172A",
          shadowOpacity: 0.05,
          shadowRadius: 12,
          elevation: 2,
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
        borderColor: "#E2E8F0",
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
              borderColor: "#E2E8F0",
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
        borderColor: "#E2E8F0",
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
              borderColor: "#E2E8F0",
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
        borderColor: "#E2E8F0",
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
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate("BookkeepingDetail", {
                  entryId: entry.id,
                  initialEntry: entry,
                  onDone: load,
                })
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: "#E2E8F0",
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
        borderColor: "#E2E8F0",
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
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: "#E2E8F0",
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
        borderColor: "#E2E8F0",
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
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderColor: "#E2E8F0",
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
        borderColor: "#E2E8F0",
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
                borderColor: "#E2E8F0",
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F1F5F9", marginBottom: -tabBarHeight }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 + tabBarHeight }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#2563EB" />}
      >
        <View style={{ gap: 16 }}>
          <View
            style={{
              backgroundColor: "#2563EB",
              borderRadius: 20,
              padding: 20,
              shadowColor: "#2563EB",
              shadowOpacity: 0.18,
              shadowRadius: 12,
              elevation: 4,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text style={{ color: "#BFDBFE", fontSize: 13, letterSpacing: 0.4 }}>Inventori Gudang</Text>
                <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700", marginTop: 4 }}>Ringkasan Hari Ini</Text>
                <Text style={{ color: "#DBEAFE", marginTop: 8 }}>{todayLabel}</Text>
              </View>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.18)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialCommunityIcons name="warehouse" size={36} color="#fff" />
              </View>
            </View>
            <TouchableOpacity
              onPress={load}
              style={{
                marginTop: 18,
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
              }}
            >
              <Ionicons name="refresh" color="#fff" size={18} style={{ marginRight: 8 }} />
              <Text style={{ color: "#fff", fontWeight: "600" }}>Perbarui Data</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            {dashboardTabs.map(({ key, label, icon }) => {
              const isActive = key === activeTab;
              const showTooltip = tooltipTab === key;
              return (
                <View key={key} style={{ flex: 1, alignItems: "center" }}>
                  <View style={{ position: "relative", alignItems: "center", paddingTop: 12 }}>
                    {showTooltip && (
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          transform: [{ translateY: -24 }],
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          backgroundColor: "rgba(15,23,42,0.92)",
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>{label}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => handleTabPress(key)}
                      onLongPress={() => setTooltipTab(key)}
                      onPressOut={() => setTooltipTab(null)}
                      delayLongPress={200}
                      activeOpacity={0.85}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: isActive ? "#2563EB" : "#E2E8F0",
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: isActive ? 0 : 1,
                        borderColor: "#CBD5F5",
                      }}
                    >
                      <Ionicons name={icon} size={isActive ? 26 : 24} color={isActive ? "#fff" : "#334155"} />
                    </TouchableOpacity>
                  </View>
                  <Text
                    style={{
                      marginTop: 10,
                      color: isActive ? "#2563EB" : "#64748B",
                      fontSize: 12,
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          <Animated.View style={{ opacity: tabTransition }}>
            <View style={{ gap: 16 }}>
              {activeTabSections.map((section, index) => (
                <React.Fragment key={`${activeTab}-section-${index}`}>{section}</React.Fragment>
              ))}
            </View>
          </Animated.View>
        </View>
      </ScrollView>
      <Modal visible={detailModal.visible} transparent animationType="fade" onRequestClose={closeDetail} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.35)", padding: 16 }} onPress={closeDetail}>
          <KeyboardAvoidingView
            behavior={KEYBOARD_AVOIDING_BEHAVIOR}
            keyboardVerticalOffset={modalKeyboardOffset}
            style={{ flex: 1, justifyContent: "flex-end" }}
            pointerEvents="box-none"
          >
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
                      value={detailSearchInput}
                      onChangeText={setDetailSearchInput}
                      placeholder="Cari..."
                      placeholderTextColor="#94A3B8"
                      onSubmitEditing={applySearch}
                      style={{
                        flex: 1,
                        backgroundColor: "#F8FAFC",
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
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
                              borderColor: "#E2E8F0",
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
                          borderColor: "#E2E8F0",
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
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
