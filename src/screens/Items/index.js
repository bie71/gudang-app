import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import ActionButton from "../../components/ActionButton";
import IconActionButton from "../../components/IconActionButton";
import DetailRow from "../../components/DetailRow";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import DatePickerField from "../../components/DatePickerField";
import { exec } from "../../services/database";
import { saveFileToStorage, resolveShareableUri } from "../../services/files";
import { exportItemsCsv } from "../../services/export";
import {
  formatCurrencyValue,
  formatDateDisplay,
  formatDateInputValue,
  formatDateTimeDisplay,
  formatNumberInput,
  formatNumberValue,
  parseNumberInput,
  buildItemsReportFileBase,
  buildItemImageFileBase,
} from "../../utils/format";
import ViewShot from "react-native-view-shot";

function buildDefaultReportRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: formatDateInputValue(start),
    endDate: formatDateInputValue(now),
  };
}

function escapeHtml(value) {
  if (value == null) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, char => map[char] || char);
}

export function ItemsScreen({ route, navigation }) {
  const PAGE_SIZE = 20;
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [reportModalState, setReportModalState] = useState(() => ({
    visible: false,
    ...buildDefaultReportRange(),
  }));
  const [reportGenerating, setReportGenerating] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  useEffect(() => {
    if (route?.params?.search !== undefined) {
      setSearchTerm(route.params.search);
      navigation.setParams({ search: undefined });
    }
  }, [route?.params?.search]);

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
          SELECT id, name, category, price, cost_price, stock
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
        costPrice: Number(row.cost_price ?? 0),
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

  const openReportModal = () => {
    const defaults = buildDefaultReportRange();
    setReportModalState({ visible: true, ...defaults });
  };

  const closeReportModal = useCallback(() => {
    if (reportGenerating) return;
    setReportModalState(prev => ({ ...prev, visible: false }));
  }, [reportGenerating]);

  const handleGenerateReport = useCallback(async () => {
    const { startDate, endDate } = reportModalState;
    if (!startDate || !endDate) {
      Alert.alert("Validasi", "Tanggal mulai dan akhir wajib dipilih.");
      return;
    }
    if (startDate > endDate) {
      Alert.alert("Validasi", "Tanggal mulai tidak boleh melebihi tanggal akhir.");
      return;
    }
    if (reportGenerating) return;
    setReportGenerating(true);
    try {
      const res = await exec(
        `
          SELECT
            sh.id,
            sh.created_at,
            sh.type,
            sh.qty,
            sh.note,
            sh.unit_price,
            sh.unit_cost,
            sh.profit_amount,
            i.name as item_name,
            i.category as item_category,
            i.price as default_price,
            i.cost_price as default_cost
          FROM stock_history sh
          JOIN items i ON i.id = sh.item_id
          WHERE DATE(sh.created_at) BETWEEN ? AND ?
          ORDER BY sh.created_at ASC, sh.id ASC
        `,
        [startDate, endDate],
      );
      const rows = [];
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        rows.push(row);
      }
      if (!rows.length) {
        Alert.alert("Tidak Ada Data", "Tidak ada riwayat stok dalam rentang tanggal tersebut.");
        return;
      }

      let totalInQty = 0;
      let totalOutQty = 0;
      let totalOutValue = 0;
      let totalOutCost = 0;
      let totalInCost = 0;
      let totalProfit = 0;

      const detailRows = rows.map(row => {
        const qty = Number(row.qty ?? 0);
        const type = row.type === "OUT" ? "OUT" : "IN";
        const unitPrice = Number(row.unit_price ?? row.default_price ?? 0);
        const unitCost = Number(row.unit_cost ?? row.default_cost ?? 0);
        const totalPrice = type === "OUT" ? unitPrice * qty : 0;
        const totalCost = unitCost * qty;
        const profitAmount =
          type === "OUT" ? Number(row.profit_amount ?? (unitPrice - unitCost) * qty) : 0;

        if (type === "IN") {
          totalInQty += qty;
          totalInCost += totalCost;
        } else {
          totalOutQty += qty;
          totalOutValue += totalPrice;
          totalOutCost += totalCost;
          totalProfit += profitAmount;
        }

        return {
          id: row.id,
          createdAt: row.created_at,
          type,
          qty,
          itemName: row.item_name,
          category: row.item_category,
          note: row.note,
          totalPrice,
          totalCost,
          profitAmount,
        };
      });

      const startDisplay = formatDateDisplay(startDate);
      const endDisplay = formatDateDisplay(endDate);
      const summaryCards = [
        { title: "Profit Bersih", value: formatCurrencyValue(totalProfit) },
        { title: "Nilai Penjualan", value: formatCurrencyValue(totalOutValue) },
        { title: "Modal Penjualan", value: formatCurrencyValue(totalOutCost) },
        { title: "Modal Pengadaan", value: formatCurrencyValue(totalInCost) },
        { title: "Barang Keluar", value: `${formatNumberValue(totalOutQty)} pcs` },
        { title: "Barang Masuk", value: `${formatNumberValue(totalInQty)} pcs` },
        { title: "Total Catatan", value: formatNumberValue(detailRows.length) },
      ];

      const rowsHtml = detailRows
        .map((entry, index) => {
          const inQty = entry.type === "IN" ? formatNumberValue(entry.qty) : "-";
          const outQty = entry.type === "OUT" ? formatNumberValue(entry.qty) : "-";
          const saleValue = entry.type === "OUT" ? formatCurrencyValue(entry.totalPrice) : "-";
          const costValue = formatCurrencyValue(entry.totalCost);
          const profitValue = entry.type === "OUT" ? formatCurrencyValue(entry.profitAmount) : "-";
          const categoryBadge = entry.category
            ? `<div class="item-category">${escapeHtml(entry.category)}</div>`
            : "";
          const noteText = entry.note ? escapeHtml(entry.note) : "-";
          return `
            <tr>
              <td class="col-index">${index + 1}</td>
              <td class="col-date">${escapeHtml(formatDateTimeDisplay(entry.createdAt))}</td>
              <td class="col-item">
                <div class="item-name">${escapeHtml(entry.itemName || "-")}</div>
                ${categoryBadge}
              </td>
              <td class="col-type">${entry.type === "IN" ? "Masuk" : "Keluar"}</td>
              <td class="col-qty">${inQty}</td>
              <td class="col-qty">${outQty}</td>
              <td class="col-amount">${saleValue}</td>
              <td class="col-amount">${costValue}</td>
              <td class="col-amount">${profitValue}</td>
              <td class="col-note">${noteText}</td>
            </tr>
          `;
        })
        .join("");

      const summaryHtml = summaryCards
        .map(card => {
          return `
            <div class="summary-item">
              <h2>${escapeHtml(card.title)}</h2>
              <p>${escapeHtml(card.value)}</p>
            </div>
          `;
        })
        .join("");

      const fileBase = buildItemsReportFileBase({ startDate, endDate });
      const html = `
        <!DOCTYPE html>
        <html lang="id">
          <head>
            <meta charset="utf-8" />
            <title>Laporan Barang</title>
            <style>
              @page { size: A4; margin: 24px 32px; }
              * { box-sizing: border-box; font-family: 'Inter', 'Helvetica', 'Arial', sans-serif; }
              .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 28px; }
              .header h1 { margin: 0; font-size: 28px; }
              .range { color: #64748b; margin-top: 4px; font-size: 14px; }
              .summary { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }
              .summary-item { background: #f8fafc; border-radius: 16px; padding: 18px 20px; flex: 1 1 210px; }
              .summary-item h2 { margin: 0 0 8px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
              .summary-item p { margin: 0; font-size: 18px; font-weight: 600; color: #0f172a; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; background: #e8edf3ff;}
              thead { background: #f8fafc; }
              th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
              th { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
              td { font-size: 13px; color: #0f172a; }
              .col-index { width: 48px; text-align: center; }
              .col-date { width: 150px; }
              .col-item { width: 220px; }
              .col-type { width: 72px; text-transform: uppercase; font-weight: 600; text-align: center; }
              .col-qty { width: 90px; text-align: right; font-variant-numeric: tabular-nums; }
              .col-amount { width: 120px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
              .col-note { width: 220px; }
              .item-name { font-weight: 600; }
              .item-category { margin-top: 4px; color: #64748b; font-size: 12px; }
              tfoot td { font-weight: 700; color: #0f172a; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div>
                  <p style="letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin: 0 0 8px;">Laporan</p>
                  <h1>Barang & Persediaan</h1>
                  <p class="range">${escapeHtml(startDisplay)} - ${escapeHtml(endDisplay)}</p>
                </div>
              </div>
              <div class="summary">
                ${summaryHtml}
              </div>
              <table>
                <thead>
                  <tr>
                    <th class="col-index">No</th>
                    <th class="col-date">Tanggal</th>
                    <th class="col-item">Barang</th>
                    <th class="col-type">Tipe</th>
                    <th class="col-qty">Masuk</th>
                    <th class="col-qty">Keluar</th>
                    <th class="col-amount">Nilai Jual</th>
                    <th class="col-amount">Modal</th>
                    <th class="col-amount">Profit</th>
                    <th class="col-note">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="text-align: right;">Total</td>
                    <td class="col-qty">${escapeHtml(formatNumberValue(totalInQty))}</td>
                    <td class="col-qty">${escapeHtml(formatNumberValue(totalOutQty))}</td>
                    <td class="col-amount">${escapeHtml(formatCurrencyValue(totalOutValue))}</td>
                    <td class="col-amount">${escapeHtml(formatCurrencyValue(totalOutCost + totalInCost))}</td>
                    <td class="col-amount">${escapeHtml(formatCurrencyValue(totalProfit))}</td>
                    <td class="col-note"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false, fileName: fileBase });
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } = await saveFileToStorage(
        uri,
        `${fileBase}.pdf`,
        "application/pdf",
      );
      if (await Sharing.isAvailableAsync()) {
        const shareUri = await resolveShareableUri(`${fileBase}-share.pdf`, uri, savedUri);
        if (shareUri) {
          await Sharing.shareAsync(shareUri, {
            mimeType: "application/pdf",
            dialogTitle: "Bagikan Laporan Barang",
            UTI: "com.adobe.pdf",
          });
        }
      }
      const locationMessage = savedDisplayPath
        ? `File tersimpan di ${savedDisplayPath}.`
        : savedLocation === "external"
        ? "File tersimpan di folder yang kamu pilih."
        : `File tersimpan di ${savedUri}.`;
      const alertMessage = savedNotice ? `${savedNotice}\n\n${locationMessage}` : locationMessage;
      Alert.alert("Laporan Dibuat", alertMessage);
      setReportModalState(prev => ({ ...prev, visible: false }));
    } catch (error) {
      console.log("ITEMS REPORT ERROR:", error);
      Alert.alert("Gagal", "Laporan tidak dapat dibuat saat ini.");
    } finally {
      setReportGenerating(false);
    }
  }, [reportModalState, reportGenerating]);

  const handleExportCsv = useCallback(async () => {
    if (csvExporting) return;
    setCsvExporting(true);
    try {
      const result = await exportItemsCsv();
      if (result.shareUri) {
        await Sharing.shareAsync(result.shareUri, {
          mimeType: "text/csv",
          dialogTitle: "Bagikan CSV Barang",
        });
      }
      const locationMessage = result.displayPath
        ? `File tersimpan di ${result.displayPath}.`
        : result.location === "external"
        ? "File tersimpan di folder yang kamu pilih."
        : `File tersimpan di ${result.uri}.`;
      const alertMessage = result.notice ? `${result.notice}\n\n${locationMessage}` : locationMessage;
      Alert.alert("Berhasil", alertMessage);
    } catch (error) {
      console.log("EXPORT ITEMS CSV ERROR:", error);
      Alert.alert("Gagal", "CSV tidak dapat dibuat saat ini.");
    } finally {
      setCsvExporting(false);
    }
  }, [csvExporting]);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#0F172A" }}>
      {/* Dark Header Container */}
      <View style={{ backgroundColor: "#0F172A", padding: 20, paddingBottom: 20 }}>
        {/* Header row */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700", letterSpacing: -0.5 }}>
            Katalog Barang
          </Text>
          <TouchableOpacity
            onPress={openReportModal}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#0D9488",
              borderRadius: 10,
              paddingHorizontal: 12,
              height: 36,
              gap: 6,
            }}
          >
            <Ionicons name="document-text-outline" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Laporan</Text>
          </TouchableOpacity>
        </View>

        {/* Search & Actions Row */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: "#fff",
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              height: 46,
            }}
          >
            <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Cari nama barang atau kategori..."
              value={searchTerm}
              onChangeText={setSearchTerm}
              style={{
                flex: 1,
                color: "#0F172A",
                fontSize: 14,
                height: "100%",
                paddingVertical: 0,
              }}
              placeholderTextColor="#94A3B8"
            />
          </View>


        </View>
      </View>

      {/* Main Content Area */}
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <FlatList
          data={items}
          keyExtractor={it => String(it.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          renderItem={({ item }) => {
            const lowerName = item.name.toLowerCase();
            let iconName = "cube-outline";
            let iconBg = "#F1F5F9";
            let iconColor = "#64748B";
            
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

            // Status indicator dot color based on stock levels
            let dotColor = "#EF4444"; // low stock
            if (item.stock > 50) {
              dotColor = "#10B981"; // high stock
            } else if (item.stock > 10) {
              dotColor = "#F59E0B"; // moderate stock
            }

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  navigation.navigate("ItemDetail", {
                    itemId: item.id,
                    initialItem: item,
                    onDone: () => loadItems({ search: searchTerm, reset: true }),
                  })
                }
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#F1F5F9",
                  padding: 16,
                  marginBottom: 12,
                  shadowColor: "#0F172A",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.03,
                  shadowRadius: 10,
                  elevation: 1,
                }}
              >
                {/* Item Info (Top part) */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={iconName} size={28} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                      {lowerName.includes("minyak") ? "(SKU-MGS001)" : lowerName.includes("kardus") ? "(SKU001)" : lowerName.includes("pita") ? "(SKU-TPE002)" : `(SKU-00${item.id})`}
                      {item.category ? ` • ${item.category}` : " • Tanpa Kategori"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#475569" }}>
                        {formatNumberValue(item.stock)} pcs
                      </Text>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor, marginLeft: 8 }} />
                    </View>
                    {item.stock <= 5 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <Ionicons name="warning" size={12} color="#EF4444" />
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#EF4444" }}>
                          Stok kritis! Tinggal {item.stock} pcs
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Card Actions (Bottom part) */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                  {/* Lihat Detail Button */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      navigation.navigate("ItemDetail", {
                        itemId: item.id,
                        initialItem: item,
                        onDone: () => loadItems({ search: searchTerm, reset: true }),
                      })
                    }
                    style={{
                      flex: 1.5,
                      borderWidth: 1,
                      borderColor: "#0D9488",
                      borderRadius: 10,
                      paddingVertical: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#fff",
                    }}
                  >
                    <Text style={{ color: "#0D9488", fontSize: 13, fontWeight: "600" }}>Lihat Detail</Text>
                  </TouchableOpacity>

                  {/* Stok Masuk Button */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      navigation.navigate("StockMove", {
                        item,
                        mode: "IN",
                        onDone: () => loadItems({ search: searchTerm, reset: true }),
                      })
                    }
                    style={{
                      width: 44,
                      borderRadius: 10,
                      backgroundColor: "#10B981",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                  </TouchableOpacity>

                  {/* Stok Keluar Button */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      navigation.navigate("StockMove", {
                        item,
                        mode: "OUT",
                        onDone: () => loadItems({ search: searchTerm, reset: true }),
                      })
                    }
                    style={{
                      width: 44,
                      borderRadius: 10,
                      backgroundColor: "#EF4444",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="remove" size={18} color="#fff" />
                  </TouchableOpacity>

                  {/* Edit Button */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      navigation.navigate("AddItem", {
                        item,
                        onDone: () => loadItems({ search: searchTerm, reset: true }),
                      })
                    }
                    style={{
                      width: 44,
                      borderRadius: 10,
                      backgroundColor: "#0EA5E9",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" />
                  </TouchableOpacity>

                  {/* Hapus Button */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => confirmDelete(item)}
                    style={{
                      width: 44,
                      borderRadius: 10,
                      backgroundColor: "#F1F5F9",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color="#0D9488" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingVertical: 40 }}>
                <ActivityIndicator color="#0D9488" />
              </View>
            ) : (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Ionicons name="cube-outline" size={32} color="#CBD5F5" />
                <Text style={{ color: "#94A3B8", marginTop: 8 }}>
                  {searchTerm.trim() ? "Tidak ada barang yang cocok." : "Belum ada barang tersimpan."}
                </Text>
              </View>
            )
          }
        />
      </View>

      {/* Floating Action Button */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() =>
          navigation.navigate("AddItem", {
            onDone: () => loadItems({ search: searchTerm, reset: true }),
          })
        }
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#0D9488",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#0D9488",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={reportModalState.visible}
        transparent
        animationType="fade"
        onRequestClose={closeReportModal}
        statusBarTranslucent
      >
        <Pressable
          onPress={closeReportModal}
          style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.55)" }}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 24,
            shadowColor: "#0F172A",
            shadowOpacity: 0.12,
            shadowRadius: 16,
            elevation: 6,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Laporan Barang</Text>
            <TouchableOpacity onPress={closeReportModal} disabled={reportGenerating}>
              <Ionicons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <Text style={{ color: "#64748B", marginTop: 6 }}>
            Pilih rentang tanggal untuk membuat laporan barang dan riwayat stok dalam format PDF.
          </Text>
          <View style={{ marginTop: 18 }}>
            <DatePickerField
              label="Tanggal Mulai"
              value={reportModalState.startDate}
              onChange={value => setReportModalState(prev => ({ ...prev, startDate: value }))}
            />
            <DatePickerField
              label="Tanggal Akhir"
              value={reportModalState.endDate}
              onChange={value => setReportModalState(prev => ({ ...prev, endDate: value }))}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              onPress={handleGenerateReport}
              disabled={reportGenerating || csvExporting}
              style={{
                flex: 1,
                backgroundColor: reportGenerating ? "#99F6E4" : "#0D9488",
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              {reportGenerating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Ekspor PDF</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleExportCsv}
              disabled={reportGenerating || csvExporting}
              style={{
                flex: 1,
                backgroundColor: csvExporting ? "#A7F3D0" : "#10B981",
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              {csvExporting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Ekspor Excel (CSV)</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export function ItemDetailScreen({ route, navigation }) {
  const selectedItemIdParam = route.params?.itemId;
  const onDone = route.params?.onDone;
  const initialItemParam = route.params?.initialItem;

  const normalizeItem = data => {
    if (!data) return null;
    return {
      id: data.id,
      name: data.name || "",
      category: data.category || null,
      price: Number(data.price ?? 0),
      costPrice: Number(data.costPrice ?? data.cost_price ?? 0),
      stock: Number(data.stock ?? 0),
    };
  };

  const [item, setItem] = useState(() => normalizeItem(initialItemParam));
  const [history, setHistory] = useState([]);
  const [profitSummary, setProfitSummary] = useState({ totalProfit: 0, totalQty: 0, lastSaleAt: null });
  const [loading, setLoading] = useState(() => !initialItemParam);
  const [reportGenerating, setReportGenerating] = useState(false);
  const reportShotRef = useRef(null);
  const selectedItemId = Number(selectedItemIdParam);
  const HISTORY_LIMIT = 20;

  const load = useCallback(async () => {
    if (!Number.isFinite(selectedItemId)) {
      setItem(null);
      setHistory([]);
      setProfitSummary({ totalProfit: 0, totalQty: 0, lastSaleAt: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await exec(
        `SELECT id, name, category, price, cost_price, stock FROM items WHERE id = ?`,
        [selectedItemId],
      );
      if (!res.rows.length) {
        setItem(null);
        setHistory([]);
        setProfitSummary({ totalProfit: 0, totalQty: 0, lastSaleAt: null });
        return;
      }
      const row = res.rows.item(0);
      const nextItem = {
        id: row.id,
        name: row.name || "",
        category: row.category || null,
        price: Number(row.price ?? 0),
        costPrice: Number(row.cost_price ?? 0),
        stock: Number(row.stock ?? 0),
      };
      setItem(nextItem);
      const historyRes = await exec(
        `
          SELECT id, type, qty, note, created_at, unit_price, unit_cost, profit_amount
          FROM stock_history
          WHERE item_id = ?
          ORDER BY id DESC
          LIMIT ?
        `,
        [selectedItemId, HISTORY_LIMIT],
      );
      const historyRows = [];
      for (let i = 0; i < historyRes.rows.length; i++) {
        const historyRow = historyRes.rows.item(i);
        historyRows.push({
          id: historyRow.id,
          type: historyRow.type,
          qty: Number(historyRow.qty ?? 0),
          note: historyRow.note,
          createdAt: historyRow.created_at,
          unitPrice: Number(historyRow.unit_price ?? 0),
          unitCost: Number(historyRow.unit_cost ?? 0),
          profitAmount: Number(historyRow.profit_amount ?? 0),
        });
      }
      setHistory(historyRows);
      const profitRes = await exec(
        `
          SELECT
            IFNULL(SUM(profit_amount), 0) as total_profit,
            IFNULL(SUM(qty), 0) as total_qty,
            MAX(created_at) as last_sale_at
          FROM stock_history
          WHERE item_id = ? AND type = 'OUT'
        `,
        [selectedItemId],
      );
      const profitRow = profitRes.rows.length ? profitRes.rows.item(0) : {};
      setProfitSummary({
        totalProfit: Number(profitRow.total_profit ?? 0),
        totalQty: Number(profitRow.total_qty ?? 0),
        lastSaleAt: profitRow.last_sale_at || null,
      });
    } catch (error) {
      console.log("ITEM DETAIL LOAD ERROR:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedItemId]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshParent = useCallback(() => {
    if (typeof onDone === "function") {
      onDone();
    }
  }, [onDone]);

  const handleGenerateReportImage = useCallback(async () => {
    if (!item) return;
    const viewShot = reportShotRef.current;
    if (!viewShot || typeof viewShot.capture !== "function") {
      Alert.alert("Gagal", "Pratinjau laporan belum siap.");
      return;
    }
    try {
      setReportGenerating(true);
      const tempUri = await viewShot.capture({ format: "png", quality: 1 });
      const fileBase = buildItemImageFileBase(item);
      const fileName = `${fileBase}.png`;
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } =
        await saveFileToStorage(tempUri, fileName, "image/png");
      if (await Sharing.isAvailableAsync()) {
        const shareUri = await resolveShareableUri(`${fileBase}-share.png`, tempUri, savedUri);
        if (shareUri) {
          await Sharing.shareAsync(shareUri, {
            mimeType: "image/png",
            dialogTitle: "Bagikan Laporan Barang (PNG)",
          });
        }
      }
      const locationMessage = savedDisplayPath
        ? `File tersimpan di ${savedDisplayPath}.`
        : savedLocation === "external"
        ? "File tersimpan di folder yang kamu pilih."
        : `File tersimpan di ${savedUri}.`;
      const alertMessage = savedNotice ? `${savedNotice}\n\n${locationMessage}` : locationMessage;
      Alert.alert("Gambar Disimpan", alertMessage);
    } catch (error) {
      console.log("ITEM REPORT IMAGE ERROR:", error);
      Alert.alert("Gagal", "Gambar laporan tidak dapat dibuat.");
    } finally {
      setReportGenerating(false);
    }
  }, [item]);

  const handleEdit = useCallback(() => {
    if (!item) return;
    navigation.navigate("AddItem", {
      item,
      onDone: () => {
        load();
        refreshParent();
      },
    });
  }, [item, navigation, load, refreshParent]);

  const handleStockMove = useCallback(
    mode => {
      if (!item) return;
      navigation.navigate("StockMove", {
        item,
        mode,
        onDone: () => {
          load();
          refreshParent();
        },
      });
    },
    [item, navigation, load, refreshParent],
  );

  const confirmDelete = useCallback(() => {
    if (!item) return;
    Alert.alert(
      "Hapus Barang",
      `Yakin ingin menghapus ${item.name || "barang ini"}? Data riwayat stok juga akan dihapus.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await exec(`DELETE FROM stock_history WHERE item_id = ?`, [item.id]);
              await exec(`DELETE FROM items WHERE id = ?`, [item.id]);
              refreshParent();
              navigation.goBack();
            } catch (error) {
              console.log("ITEM DELETE ERROR:", error);
              Alert.alert("Gagal", "Barang tidak dapat dihapus. Silakan coba lagi.");
            }
          },
        },
      ],
    );
  }, [item, navigation, refreshParent]);

  const handleViewHistory = useCallback(() => {
    navigation.navigate("Tabs", { screen: "History" });
  }, [navigation]);

  if (loading && !item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#2563EB" />
        <Text style={{ marginTop: 12, color: "#64748B" }}>Memuat detail…</Text>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Ionicons name="cube-outline" size={42} color="#CBD5F5" />
        <Text style={{ marginTop: 12, color: "#94A3B8", textAlign: "center" }}>Barang tidak ditemukan.</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: "#2563EB" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Kembali</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const categoryDisplay = item.category && item.category.trim() ? item.category : "Tanpa kategori";
  const priceDisplay = formatCurrencyValue(item.price ?? 0);
  const costDisplay = formatCurrencyValue(item.costPrice ?? 0);
  const stockDisplay = `${formatNumberValue(item.stock ?? 0)} pcs`;
  const totalDisplay = formatCurrencyValue((item.price ?? 0) * (item.stock ?? 0));
  const unitProfit = Number(item.price ?? 0) - Number(item.costPrice ?? 0);
  const unitProfitLabel = `${unitProfit >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(unitProfit))}`;
  const totalProfit = Number(profitSummary.totalProfit ?? 0);
  const totalProfitLabel = `${totalProfit >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(totalProfit))}`;
  const totalQtyDisplay = `${formatNumberValue(profitSummary.totalQty ?? 0)} pcs`;
  const lastSaleDisplay = profitSummary.lastSaleAt ? formatDateTimeDisplay(profitSummary.lastSaleAt) : "-";
  const isRefreshing = loading;
  const windowWidth = Dimensions.get("window").width;
  const reportWidth = Math.max(windowWidth - 48, 640);
  const historyPreview = history.slice(0, 6);
  const historyPreviewNotice = history.length > historyPreview.length
    ? `Menampilkan ${historyPreview.length} dari ${history.length} riwayat terbaru`
    : history.length
    ? `Menampilkan ${historyPreview.length} riwayat`
    : "Tidak ada riwayat";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F1F5F9" }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View
          style={{
            backgroundColor: "#fff",
            padding: 20,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#F1F5F9",
            marginBottom: 16,
            shadowColor: "#0F172A",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.03,
            shadowRadius: 12,
            elevation: 1,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A" }}>{item.name}</Text>
          <Text style={{ color: "#64748B", marginTop: 6 }}>{categoryDisplay}</Text>
          <View style={{ marginTop: 18, gap: 12 }}>
            <DetailRow label="Kategori" value={categoryDisplay} />
            <DetailRow label="Harga Jual" value={priceDisplay} />
            <DetailRow label="Harga Modal" value={costDisplay} />
            <DetailRow label="Stok" value={stockDisplay} />
            <DetailRow label="Nilai Persediaan" value={totalDisplay} bold />
          </View>
        </View>
        <View
          style={{
            backgroundColor: "#fff",
            padding: 18,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Ringkasan Profit</Text>
          <View style={{ marginTop: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#64748B" }}>Profit Total</Text>
              <Text style={{ color: totalProfit >= 0 ? "#16A34A" : "#DC2626", fontWeight: "700" }}>{totalProfitLabel}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#64748B" }}>Barang Terjual</Text>
              <Text style={{ color: "#0F172A", fontWeight: "600" }}>{totalQtyDisplay}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#64748B" }}>Profit per pcs</Text>
              <Text style={{ color: unitProfit >= 0 ? "#16A34A" : "#DC2626", fontWeight: "600" }}>{unitProfitLabel}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#64748B" }}>Penjualan Terakhir</Text>
              <Text style={{ color: "#0F172A", fontWeight: "500" }}>{lastSaleDisplay}</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, rowGap: 18, marginBottom: 20 }}>
          <IconActionButton
            icon="image-outline"
            label="PNG"
            backgroundColor="#E0F2FE"
            iconColor="#0284C7"
            onPress={handleGenerateReportImage}
          />
          <IconActionButton
            icon="arrow-down-circle-outline"
            label="Masuk"
            backgroundColor="#DCFCE7"
            iconColor="#15803D"
            onPress={() => handleStockMove("IN")}
          />
          <IconActionButton
            icon="arrow-up-circle-outline"
            label="Keluar"
            backgroundColor="#FEE2E2"
            iconColor="#DC2626"
            onPress={() => handleStockMove("OUT")}
          />
          <IconActionButton
            icon="create-outline"
            label="Edit"
            backgroundColor="#E0E7FF"
            iconColor="#4338CA"
            onPress={handleEdit}
          />
          <IconActionButton
            icon="trash-outline"
            label="Hapus"
            backgroundColor="#FFE4E6"
            iconColor="#E11D48"
            onPress={confirmDelete}
          />
        </View>
        <View style={{ backgroundColor: "#fff", padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Riwayat Stok</Text>
            {isRefreshing ? <ActivityIndicator size="small" color="#2563EB" /> : null}
          </View>
          {history.length ? (
            <Text style={{ color: "#94A3B8", marginTop: 4, fontSize: 12 }}>
              Menampilkan {Math.min(history.length, HISTORY_LIMIT)} riwayat terbaru
            </Text>
          ) : null}
          {history.length ? (
            <View style={{ marginTop: 12, gap: 12 }}>
              {history.map(entry => (
                <View key={entry.id} style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: entry.type === "IN" ? "#0F766E" : "#DC2626", fontWeight: "700" }}>
                      {entry.type === "IN" ? "Barang Masuk" : "Barang Keluar"}
                    </Text>
                    <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                      {formatDateTimeDisplay(entry.createdAt)}
                    </Text>
                  </View>
                  <Text style={{ color: "#0F172A", fontWeight: "600", marginTop: 6 }}>
                    Qty {formatNumberValue(entry.qty)} pcs
                  </Text>
                  {entry.type === "OUT" ? (
                    <View style={{ marginTop: 8, gap: 4 }}>
                      <Text style={{ color: "#0F172A" }}>
                        Harga jual: {formatCurrencyValue(entry.unitPrice ?? item.price)}
                      </Text>
                      <Text style={{ color: "#0F172A" }}>
                        Harga modal: {formatCurrencyValue(entry.unitCost ?? item.costPrice)}
                      </Text>
                      <Text
                        style={{
                          color: (entry.profitAmount ?? 0) >= 0 ? "#16A34A" : "#DC2626",
                          fontWeight: "700",
                        }}
                      >
                        Profit: {`${(entry.profitAmount ?? 0) >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(entry.profitAmount ?? 0))}`}
                      </Text>
                    </View>
                  ) : entry.unitCost ? (
                    <Text style={{ color: "#0F172A", marginTop: 8 }}>
                      Harga modal: {formatCurrencyValue(entry.unitCost)}
                    </Text>
                  ) : null}
                  {entry.note ? <Text style={{ color: "#64748B", marginTop: 6 }}>{entry.note}</Text> : null}
                </View>
              ))}
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 28 }}>
              <Ionicons name="time-outline" size={28} color="#CBD5F5" />
              <Text style={{ color: "#94A3B8", marginTop: 8 }}>Belum ada riwayat stok.</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={handleViewHistory}
            style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}
          >
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Lihat semua riwayat</Text>
            <Ionicons name="arrow-forward" size={18} color="#2563EB" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={{ position: "absolute", top: -9999, left: -9999 }}>
        <ViewShot ref={reportShotRef} collapsable={false} style={{ width: reportWidth }}>
          <View style={{ backgroundColor: "#F8FAFC", padding: 24, gap: 16 }}>
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ color: "#0EA5E9", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.08, fontSize: 12 }}>
                Laporan Barang
              </Text>
              <Text style={{ color: "#0F172A", fontWeight: "700", fontSize: 26 }}>{item.name}</Text>
              <Text style={{ color: "#64748B" }}>{categoryDisplay}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                {[
                  { label: "Stok", value: stockDisplay },
                  { label: "Nilai persediaan", value: totalDisplay },
                  { label: "Harga jual", value: priceDisplay },
                  { label: "Harga modal", value: costDisplay },
                ].map(stat => (
                  <View
                    key={stat.label}
                    style={{
                      backgroundColor: "#F1F5F9",
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      minWidth: 180,
                    }}
                  >
                    <Text style={{ color: "#64748B", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.08 }}>
                      {stat.label}
                    </Text>
                    <Text style={{ color: "#0F172A", fontWeight: "700", marginTop: 4 }}>{stat.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ color: "#0F172A", fontWeight: "700", fontSize: 18 }}>Ringkasan Profit</Text>
              <View style={{ gap: 8 }}>
                {[
                  { label: "Profit total", value: totalProfitLabel, color: totalProfit >= 0 ? "#16A34A" : "#DC2626" },
                  { label: "Barang terjual", value: totalQtyDisplay },
                  { label: "Profit per pcs", value: unitProfitLabel, color: unitProfit >= 0 ? "#16A34A" : "#DC2626" },
                  { label: "Penjualan terakhir", value: lastSaleDisplay },
                ].map(stat => (
                  <View key={stat.label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: "#64748B" }}>{stat.label}</Text>
                    <Text style={{ color: stat.color || "#0F172A", fontWeight: "600" }}>{stat.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ color: "#0F172A", fontWeight: "700", fontSize: 18 }}>Riwayat Stok Terbaru</Text>
              <Text style={{ color: "#94A3B8", fontSize: 12 }}>{historyPreviewNotice}</Text>
              {historyPreview.length ? (
                <View style={{ gap: 12 }}>
                  {historyPreview.map(entry => {
                    const typeLabel = entry.type === "IN" ? "Barang Masuk" : "Barang Keluar";
                    const typeColor = entry.type === "IN" ? "#0F766E" : "#DC2626";
                    const qtyLabel = `${formatNumberValue(entry.qty)} pcs`;
                    return (
                      <View key={entry.id} style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, padding: 16, gap: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View>
                            <Text style={{ color: typeColor, fontWeight: "700" }}>{typeLabel}</Text>
                            <Text style={{ color: "#64748B", fontSize: 12 }}>{qtyLabel}</Text>
                          </View>
                          <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                            {formatDateTimeDisplay(entry.createdAt)}
                          </Text>
                        </View>
                        {entry.type === "OUT" ? (
                          <View style={{ gap: 4 }}>
                            <Text style={{ color: "#0F172A" }}>
                              Harga jual: {formatCurrencyValue(entry.unitPrice || item.price)}
                            </Text>
                            <Text style={{ color: "#0F172A" }}>
                              Harga modal: {formatCurrencyValue(entry.unitCost || item.costPrice)}
                            </Text>
                            <Text style={{ color: entry.profitAmount >= 0 ? "#16A34A" : "#DC2626", fontWeight: "600" }}>
                              Profit: {`${entry.profitAmount >= 0 ? "+" : "-"} ${formatCurrencyValue(
                                Math.abs(entry.profitAmount ?? 0),
                              )}`}
                            </Text>
                          </View>
                        ) : entry.unitCost ? (
                          <Text style={{ color: "#0F172A" }}>
                            Harga modal: {formatCurrencyValue(entry.unitCost)}
                          </Text>
                        ) : null}
                        {entry.note ? <Text style={{ color: "#475569" }}>Catatan: {entry.note}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <Ionicons name="time-outline" size={28} color="#CBD5F5" />
                  <Text style={{ color: "#94A3B8", marginTop: 8 }}>Belum ada riwayat stok.</Text>
                </View>
              )}
            </View>
          </View>
        </ViewShot>
      </View>
    </SafeAreaView>
  );
}

export function AddItemScreen({ route, navigation }) {
  const onDone = route.params?.onDone;
  const initialItem = route.params?.item || null;
  const [itemId, setItemId] = useState(initialItem?.id ?? null);
  const [name, setName] = useState(initialItem?.name ?? "");
  const [category, setCategory] = useState(initialItem?.category ?? "");
  const [price, setPrice] = useState(initialItem ? formatNumberInput(String(initialItem.price ?? "")) : "");
  const [costPrice, setCostPrice] = useState(
    initialItem ? formatNumberInput(String(initialItem.costPrice ?? "")) : "",
  );
  const [stock, setStock] = useState(initialItem ? formatNumberInput(String(initialItem.stock ?? "")) : "");

  useEffect(() => {
    if (initialItem) {
      setItemId(initialItem.id);
      setName(initialItem.name || "");
      setCategory(initialItem.category || "");
      setPrice(formatNumberInput(String(initialItem.price ?? "")));
      setCostPrice(formatNumberInput(String(initialItem.costPrice ?? "")));
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
    setCostPrice("");
    setStock("");
    navigation.setOptions({ title: "Tambah Barang" });
  }

  const isEdit = Boolean(itemId);

  async function save() {
    if (!name) return Alert.alert("Validasi", "Nama barang wajib diisi.");
    const p = parseNumberInput(price);
    const c = parseNumberInput(costPrice);
    const s = parseNumberInput(stock);
    if (isEdit) {
      await exec(
        `UPDATE items SET name = ?, category = ?, price = ?, cost_price = ?, stock = ? WHERE id = ?`,
        [name, category, p, c, s, itemId],
      );
    } else {
      const insertRes = await exec(
        `INSERT INTO items(name, category, price, cost_price, stock) VALUES (?,?,?,?,?)`,
        [name, category, p, c, s],
      );
      if (s > 0) {
        const id = insertRes.insertId;
        if (id) {
          await exec(
            `INSERT INTO stock_history(item_id, type, qty, note, unit_price, unit_cost, profit_amount) VALUES (?,?,?,?,?,?,?)`,
            [id, "IN", s, "Init stock", null, c || 0, 0],
          );
        }
      }
    }
    onDone && onDone();
    navigation.goBack();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F1F5F9" }}>
      <FormScrollContainer contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>{isEdit ? "Edit Barang" : "Tambah Barang"}</Text>
        <Input label="Nama" value={name} onChangeText={setName} placeholder="contoh: Kardus 40x40" />
        <Input label="Kategori" value={category} onChangeText={setCategory} placeholder="contoh: Kemasan" />
        <Input
          label="Harga (Rp)"
          value={price}
          onChangeText={text => setPrice(formatNumberInput(text))}
          keyboardType="numeric"
          placeholder="contoh: 125000"
        />
        <Input
          label="Harga Modal (Rp)"
          value={costPrice}
          onChangeText={text => setCostPrice(formatNumberInput(text))}
          keyboardType="numeric"
          placeholder="contoh: 90000"
        />
        <Input
          label="Stok"
          value={stock}
          onChangeText={text => setStock(formatNumberInput(text))}
          keyboardType="numeric"
          placeholder="contoh: 100"
        />
        <TouchableOpacity
          onPress={save}
          activeOpacity={0.7}
          style={{
            marginTop: 20,
            backgroundColor: "#2563EB",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            shadowColor: "#2563EB",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>{isEdit ? "Simpan Perubahan" : "Simpan"}</Text>
        </TouchableOpacity>
        {isEdit ? (
          <TouchableOpacity
            onPress={resetForm}
            activeOpacity={0.7}
            style={{
              marginTop: 12,
              paddingVertical: 12,
              borderRadius: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Buat Item Baru</Text>
          </TouchableOpacity>
        ) : null}
      </FormScrollContainer>
    </SafeAreaView>
  );
}

export function StockMoveScreen({ route, navigation }) {
  const { item, mode, onDone } = route.params;
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const unitProfit = Number(item.price ?? 0) - Number(item.costPrice ?? 0);

  async function commit() {
    const q = parseInt(qty || "0", 10);
    if (q <= 0) return Alert.alert("Validasi", "Qty harus > 0.");
    if (mode === "OUT" && q > item.stock) return Alert.alert("Stok Tidak Cukup", `Stok tersedia ${item.stock}`);
    const unitPrice = Number(item.price ?? 0);
    const unitCost = Number(item.costPrice ?? 0);
    const profitAmount = mode === "OUT" ? (unitPrice - unitCost) * q : 0;
    await exec(
      `INSERT INTO stock_history(item_id, type, qty, note, unit_price, unit_cost, profit_amount) VALUES (?,?,?,?,?,?,?)`,
      [
        item.id,
        mode,
        q,
        note || null,
        mode === "OUT" ? unitPrice : null,
        unitCost,
        profitAmount,
      ],
    );
    if (mode === "IN") await exec(`UPDATE items SET stock = stock + ? WHERE id = ?`, [q, item.id]);
    else await exec(`UPDATE items SET stock = stock - ? WHERE id = ?`, [q, item.id]);
    onDone && onDone();
    navigation.goBack();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F1F5F9" }}>
      <FormScrollContainer contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 6 }}>{mode === "IN" ? "Barang Masuk" : "Barang Keluar"}</Text>
        <Text style={{ color: "#64748B" }}>
          {item.name} • Stok: {formatNumberValue(item.stock)}
        </Text>
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: "#0F172A" }}>Harga jual: {formatCurrencyValue(item.price)}</Text>
          <Text style={{ color: "#0F172A", marginTop: 4 }}>
            Harga modal: {formatCurrencyValue(item.costPrice)}
          </Text>
          {mode === "OUT" ? (
            <Text
              style={{
                color: unitProfit >= 0 ? "#16A34A" : "#DC2626",
                fontWeight: "600",
                marginTop: 4,
              }}
            >
              Profit/pcs: {`${unitProfit >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(unitProfit))}`}
            </Text>
          ) : null}
        </View>
        <Input label="Qty" value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="contoh: 5" />
        <Input label="Catatan (opsional)" value={note} onChangeText={setNote} placeholder="contoh: Rak gudang A" />
        <TouchableOpacity
          onPress={commit}
          style={{
            marginTop: 16,
            backgroundColor: mode === "IN" ? "#2563EB" : "#EF4444",
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>{mode === "IN" ? "Simpan Masuk" : "Simpan Keluar"}</Text>
        </TouchableOpacity>
      </FormScrollContainer>
    </SafeAreaView>
  );
}
