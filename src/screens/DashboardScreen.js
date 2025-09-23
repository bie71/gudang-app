import React, { useEffect, useRef, useState } from "react";
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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import StatCard from "../components/StatCard";
import { CATEGORY_COLORS, getPOStatusStyle } from "../constants";
import { formatCurrencyValue, formatDateDisplay, formatNumberValue } from "../utils/format";
import { exec } from "../services/database";
import { KEYBOARD_AVOIDING_BEHAVIOR } from "../components/FormScrollContainer";

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
  });
  const [categoryStats, setCategoryStats] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [recentPOs, setRecentPOs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [detailModal, setDetailModal] = useState({ visible: false, title: "", description: "", rows: [], type: null });
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
        subtitle: `${row.category && row.category.trim() ? row.category : "Tanpa kategori"} • ${formatNumberValue(row.stock)} stok`,
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
        const orderer = row.orderer_name ? row.orderer_name : "Tanpa pemesan";
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
        const orderer = row.orderer_name ? row.orderer_name : "Tanpa pemesan";
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
        const orderer = row.orderer_name ? row.orderer_name : "Tanpa pemesan";
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

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {stats.map(({ key: cardKey, ...cardProps }) => (
              <StatCard key={cardKey} {...cardProps} onPress={() => openDetail(cardKey)} />
            ))}
          </View>

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
                const totalValue = po.quantity * po.price;
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
                      <Text style={{ color: "#94A3B8", fontSize: 12 }}>{`${formatNumber(po.quantity)} pcs`}</Text>
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
                      renderItem={({ item, index }) => (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            paddingVertical: 12,
                            borderTopWidth: index === 0 ? 0 : 1,
                            borderColor: "#E2E8F0",
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 12 }}>
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
                        </View>
                      )}
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
                  {detailModal.rows.map((row, index) => (
                    <View
                      key={row.key ?? `${row.title}-${index}`}
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
                    </View>
                  ))}
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
