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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ActionButton from "../../components/ActionButton";
import DetailRow from "../../components/DetailRow";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import { exec } from "../../services/database";
import {
  formatCurrencyValue,
  formatDateTimeDisplay,
  formatNumberInput,
  formatNumberValue,
  parseNumberInput,
} from "../../utils/format";

export function ItemsScreen({ navigation }) {
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <View style={{ padding: 16, flex: 1 }}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TextInput
            placeholder="Cari nama/kategori…"
            value={searchTerm}
            onChangeText={setSearchTerm}
            style={{
              flex: 1,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 12,
              paddingHorizontal: 12,
              height: 44,
            }}
          />
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("AddItem", {
                onDone: () => loadItems({ search: searchTerm, reset: true }),
              })
            }
            style={{
              backgroundColor: "#10B981",
              paddingHorizontal: 16,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>+ Barang</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={items}
          keyExtractor={it => String(it.id)}
          renderItem={({ item }) => {
            const unitProfit = Number(item.price ?? 0) - Number(item.costPrice ?? 0);
            const profitColor = unitProfit >= 0 ? "#16A34A" : "#DC2626";
            const profitLabel = `${unitProfit >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(unitProfit))}`;
            return (
              <View
                style={{
                  backgroundColor: "#fff",
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  marginBottom: 10,
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate("ItemDetail", {
                      itemId: item.id,
                      initialItem: item,
                      onDone: () => loadItems({ search: searchTerm, reset: true }),
                    })
                  }
                >
                  <Text style={{ fontWeight: "700", color: "#0F172A" }}>{item.name}</Text>
                  <Text style={{ color: "#64748B" }}>{item.category || "-"}</Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                    <Text style={{ color: "#0F172A" }}>Harga jual: {formatCurrencyValue(item.price)}</Text>
                    <Text style={{ color: "#0F172A" }}>Modal: {formatCurrencyValue(item.costPrice)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                    <Text>Stok: {formatNumberValue(item.stock)}</Text>
                    <Text style={{ color: profitColor, fontWeight: "600" }}>Profit/pcs: {profitLabel}</Text>
                  </View>
                </TouchableOpacity>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <ActionButton
                    onPress={() =>
                      navigation.navigate("StockMove", {
                        item,
                        mode: "IN",
                        onDone: () => loadItems({ search: searchTerm, reset: true }),
                      })
                    }
                    label="Masuk"
                    color="#2563EB"
                  />
                  <ActionButton
                    onPress={() =>
                      navigation.navigate("StockMove", {
                        item,
                        mode: "OUT",
                        onDone: () => loadItems({ search: searchTerm, reset: true }),
                      })
                    }
                    label="Keluar"
                    color="#EF4444"
                  />
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate("AddItem", {
                        item,
                        onDone: () => loadItems({ search: searchTerm, reset: true }),
                      })
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#3B82F6",
                      backgroundColor: "#fff",
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color="#3B82F6" style={{ marginRight: 6 }} />
                    <Text style={{ color: "#3B82F6", fontWeight: "700" }}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDelete(item)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#F87171",
                      backgroundColor: "#fff",
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#F87171" style={{ marginRight: 6 }} />
                    <Text style={{ color: "#F87171", fontWeight: "700" }}>Hapus</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
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
                <Ionicons name="cube-outline" size={32} color="#CBD5F5" />
                <Text style={{ color: "#94A3B8", marginTop: 8 }}>
                  {searchTerm.trim() ? "Tidak ada barang yang cocok." : "Belum ada barang tersimpan."}
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View style={{ backgroundColor: "#fff", padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 }}>
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
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, rowGap: 12, marginBottom: 20 }}>
          <ActionButton label="Barang Masuk" onPress={() => handleStockMove("IN")} color="#2563EB" />
          <ActionButton label="Barang Keluar" onPress={() => handleStockMove("OUT")} color="#EF4444" />
          <ActionButton label="Edit Barang" onPress={handleEdit} color="#4F46E5" />
          <ActionButton label="Hapus" onPress={confirmDelete} color="#E11D48" />
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
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
          style={{ marginTop: 16, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>{isEdit ? "Simpan Perubahan" : "Simpan"}</Text>
        </TouchableOpacity>
        {isEdit ? (
          <TouchableOpacity
            onPress={resetForm}
            style={{ marginTop: 12, paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#CBD5F5" }}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
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
