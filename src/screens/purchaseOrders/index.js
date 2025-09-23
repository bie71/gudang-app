import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import FormScrollContainer from "../../components/FormScrollContainer";
import DatePickerField from "../../components/DatePickerField";
import Input from "../../components/Input";
import IconActionButton from "../../components/IconActionButton";
import DetailRow from "../../components/DetailRow";
import { exec } from "../../services/database";
import { saveFileToStorage, resolveShareableUri } from "../../services/files";
import {
  buildPOFileBase,
  formatCurrencyValue,
  formatDateDisplay,
  formatDateInputValue,
  formatNumberInput,
  formatNumberValue,
  parseNumberInput,
} from "../../utils/format";
import { getPOStatusStyle, PO_STATUS_OPTIONS, PO_STATUS_STYLES } from "../../constants";

export function PurchaseOrdersScreen({ navigation }) {
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
        [
          normalizedSearch,
          `%${normalizedSearch}%`,
          `%${normalizedSearch}%`,
          `%${normalizedSearch}%`,
          `%${normalizedSearch}%`,
          limit,
          offset,
        ],
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
        onPress={() =>
          navigation.navigate("PurchaseOrderDetail", {
            orderId: item.id,
            onDone: () => loadOrders({ search: searchTerm, reset: true }),
          })
        }
        style={{ backgroundColor: "#fff", padding: 16, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontWeight: "700", fontSize: 16, color: "#0F172A" }}>{item.itemName}</Text>
          <View style={{ backgroundColor: statusStyle.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: statusStyle.color }}>{statusStyle.label}</Text>
          </View>
        </View>
        <Text style={{ color: "#64748B", marginTop: 4 }}>
          {item.ordererName && item.ordererName.trim() ? item.ordererName : "Tanpa pemesan"}
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
            onPress={() =>
              navigation.navigate("AddPurchaseOrder", {
                onDone: () => loadOrders({ search: searchTerm, reset: true }),
              })
            }
            style={{ backgroundColor: "#14B8A6", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>+ PO</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          placeholder="Cari nama barang, pemasok, atau catatan..."
          value={searchTerm}
          onChangeText={setSearchTerm}
          style={{
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: "#E5E7EB",
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
            marginBottom: 12,
          }}
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

export function AddPurchaseOrderScreen({ route, navigation }) {
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
        `INSERT INTO purchase_orders (supplier_name, orderer_name, item_name, quantity, price, order_date, status, note)
         VALUES (?,?,?,?,?,?,?,?)`,
        [supplierName || null, ordererName || null, itemName, qty, priceValue, trimmedDate, status, note || null],
      );
      onDone && onDone();
      navigation.goBack();
    } catch (error) {
      console.log("PO INSERT ERROR:", error);
      Alert.alert("Gagal", "Purchase order tidak dapat disimpan.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <FormScrollContainer contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Tambah Purchase Order</Text>
        <Input label="Nama Pemasok" value={supplierName} onChangeText={setSupplierName} placeholder="contoh: PT ABC" />
        <Input label="Nama Pemesan" value={ordererName} onChangeText={setOrdererName} placeholder="contoh: Budi Hartono" />
        <Input label="Nama Barang" value={itemName} onChangeText={setItemName} placeholder="contoh: Kardus 40x40" />
        <Input
          label="Qty"
          value={quantity}
          onChangeText={text => setQuantity(formatNumberInput(text))}
          keyboardType="numeric"
          placeholder="contoh: 50"
        />
        <Input
          label="Harga Satuan"
          value={price}
          onChangeText={text => setPrice(formatNumberInput(text))}
          keyboardType="numeric"
          placeholder="contoh: 125000"
        />
        <DatePickerField label="Tanggal PO" value={orderDate} onChange={setOrderDate} />
        <View style={{ marginBottom: 12 }}>
          <Text style={{ marginBottom: 6, color: "#475569" }}>Status</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PO_STATUS_OPTIONS.map(option => {
              const active = status === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => setStatus(option)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? "#0EA5E9" : "#E2E8F0",
                    backgroundColor: active ? "#E0F2FE" : "#fff",
                  }}
                >
                  <Text style={{ color: active ? "#0F766E" : "#475569", fontWeight: "600" }}>
                    {PO_STATUS_STYLES[option]?.label || option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ marginBottom: 6, color: "#475569" }}>Catatan (opsional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="contoh: Kirim pekan depan"
            multiline
            style={{
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />
        </View>
        <TouchableOpacity
          onPress={save}
          style={{ marginTop: 8, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Simpan</Text>
        </TouchableOpacity>
      </FormScrollContainer>
    </SafeAreaView>
  );
}

export function EditPurchaseOrderScreen({ route, navigation }) {
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
        setLoading(true);
        const res = await exec(`SELECT * FROM purchase_orders WHERE id = ?`, [orderId]);
        if (res.rows.length) {
          const row = res.rows.item(0);
          setSupplierName(row.supplier_name || "");
          setOrdererName(row.orderer_name || "");
          setItemName(row.item_name || "");
          setQuantity(formatNumberInput(String(row.quantity ?? "")));
          setPrice(formatNumberInput(String(row.price ?? "")));
          setOrderDate(formatDateInputValue(row.order_date));
          setStatus(row.status || "PROGRESS");
          setNote(row.note || "");
        } else {
          Alert.alert("Tidak ditemukan", "Purchase order tidak ditemukan.");
          navigation.goBack();
        }
      } catch (error) {
        console.log("PO DETAIL LOAD ERROR:", error);
        Alert.alert("Gagal", "Tidak dapat memuat purchase order.");
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
        `UPDATE purchase_orders SET supplier_name = ?, orderer_name = ?, item_name = ?, quantity = ?, price = ?, order_date = ?, status = ?, note = ?
         WHERE id = ?`,
        [supplierName || null, ordererName || null, itemName, qty, priceValue, trimmedDate, status, note || null, orderId],
      );
      onDone && onDone();
      navigation.goBack();
    } catch (error) {
      console.log("PO UPDATE ERROR:", error);
      Alert.alert("Gagal", "Purchase order tidak dapat diperbarui.");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#2563EB" />
        <Text style={{ marginTop: 12, color: "#64748B" }}>Memuat…</Text>
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
        <Input
          label="Qty"
          value={quantity}
          onChangeText={text => setQuantity(formatNumberInput(text))}
          keyboardType="numeric"
          placeholder="contoh: 50"
        />
        <Input
          label="Harga Satuan"
          value={price}
          onChangeText={text => setPrice(formatNumberInput(text))}
          keyboardType="numeric"
          placeholder="contoh: 125000"
        />
        <DatePickerField label="Tanggal PO" value={orderDate} onChange={setOrderDate} />
        <View style={{ marginBottom: 12 }}>
          <Text style={{ marginBottom: 6, color: "#475569" }}>Status</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PO_STATUS_OPTIONS.map(option => {
              const active = status === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => setStatus(option)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? "#0EA5E9" : "#E2E8F0",
                    backgroundColor: active ? "#E0F2FE" : "#fff",
                  }}
                >
                  <Text style={{ color: active ? "#0F766E" : "#475569", fontWeight: "600" }}>
                    {PO_STATUS_STYLES[option]?.label || option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ marginBottom: 6, color: "#475569" }}>Catatan (opsional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="contoh: Kirim pekan depan"
            multiline
            style={{
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />
        </View>
        <TouchableOpacity
          onPress={save}
          style={{ marginTop: 8, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Simpan Perubahan</Text>
        </TouchableOpacity>
      </FormScrollContainer>
    </SafeAreaView>
  );
}

export function PurchaseOrderDetailScreen({ route, navigation }) {
  const { orderId, onDone } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const invoicePreviewRef = useRef(null);
  const actionHintTimeout = useRef(null);
  const [actionHint, setActionHint] = useState("");

  const computeAmountAwareWidth = (baseWidth, maxWidth, values = []) => {
    const base = Math.max(Math.round(baseWidth || 0), 0);
    const safeMax = Math.max(Math.round(maxWidth || base), base);
    const items = (values || [])
      .map(value => (value == null ? "" : String(value)))
      .filter(Boolean);
    if (!items.length) return base;
    const longest = items.reduce((len, text) => Math.max(len, text.length), 0);
    const threshold = 11;
    const perChar = 18;
    if (longest <= threshold) {
      return base;
    }
    const extraWidth = (longest - threshold) * perChar;
    return Math.min(base + extraWidth, safeMax);
  };

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
    Alert.alert("Hapus Purchase Order", "Yakin ingin menghapus purchase order ini?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: deleteOrder,
      },
    ]);
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
    actionHintTimeout.current = setTimeout(() => setActionHint(""), 1200);
  }

  async function generateInvoicePdf() {
    try {
      const fileBaseName = buildPOFileBase(order);
      const escapeHtml = text => (text ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const formattedDate = formatDateDisplay(order.orderDate);
      const createdDate = formatDateDisplay(order.createdAt);
      const qtyFormatted = formatNumberValue(order.quantity);
      const priceFormatted = formatCurrencyValue(order.price);
      const totalFormatted = formatCurrencyValue(totalValue);
      const noteHtml = order.note ? escapeHtml(order.note).replace(/\n/g, "<br/>") : "";
      const statusStyle = getPOStatusStyle(order.status);
      const cardWidth = computeAmountAwareWidth(640, 900, [priceFormatted, totalFormatted]);
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body {
                margin: 0;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
                padding: 32px;
                color: #0f172a;
                display: flex;
                justify-content: center;
                align-items: flex-start;
              }
              .card {
                width: ${cardWidth}px;
                max-width: 100%;
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
                table-layout: auto;
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
              th.numeric {
                text-align: right;
              }
              th.numeric--qty,
              td.numeric--qty {
                min-width: 96px;
              }
              th.numeric--price,
              td.numeric--price {
                min-width: 150px;
              }
              th.numeric--total,
              td.numeric--total {
                min-width: 170px;
              }
              td {
                padding: 16px;
                border-bottom: 1px solid #e2e8f0;
                font-size: 15px;
                color: #0f172a;
                vertical-align: middle;
              }
              td.item {
                width: 100%;
              }
              td.numeric {
                text-align: right;
                white-space: nowrap;
                font-variant-numeric: tabular-nums;
              }
              td.numeric .value {
                display: inline-block;
                font-weight: 500;
                vertical-align: baseline;
              }
              td.numeric--qty .value {
                font-weight: 600;
              }
              td.numeric .unit {
                display: inline-block;
                margin-left: 6px;
                font-size: 12px;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                vertical-align: baseline;
              }
              td.numeric--total .value {
                font-weight: 600;
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
                    <th class="numeric numeric--qty">Qty</th>
                    <th class="numeric numeric--price">Harga</th>
                    <th class="numeric numeric--total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="item">${escapeHtml(order.itemName)}</td>
                    <td class="numeric numeric--qty">
                      <span class="value">${qtyFormatted}</span>
                      <span class="unit">pcs</span>
                    </td>
                    <td class="numeric numeric--price">
                      <span class="value">${priceFormatted}</span>
                    </td>
                    <td class="numeric numeric--total">
                      <span class="value">${totalFormatted}</span>
                    </td>
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
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } = await saveFileToStorage(
        uri,
        `${fileBaseName}.pdf`,
        "application/pdf",
      );
      if (await Sharing.isAvailableAsync()) {
        const resolvedShareUri = await resolveShareableUri(`${fileBaseName}-share.pdf`, uri, savedUri);
        if (resolvedShareUri) {
          await Sharing.shareAsync(resolvedShareUri, {
            mimeType: "application/pdf",
            dialogTitle: "Bagikan Invoice Purchase Order",
            UTI: "com.adobe.pdf",
          });
        } else {
          console.log("SHARE URI NOT AVAILABLE FOR PDF");
        }
      }
      const locationMessage = savedDisplayPath
        ? `File tersimpan di ${savedDisplayPath}.`
        : savedLocation === "external"
        ? "File tersimpan di folder yang kamu pilih."
        : `File tersimpan di ${savedUri}.`;
      const alertMessage = savedNotice ? `${savedNotice}\n\n${locationMessage}` : locationMessage;
      Alert.alert("Invoice Disimpan", alertMessage);
    } catch (error) {
      console.log("PO PDF ERROR:", error);
      Alert.alert("Gagal", "Invoice tidak dapat dibuat saat ini.");
    }
  }

  async function generateInvoiceImage() {
    try {
      if (!invoicePreviewRef.current) {
        Alert.alert("Gagal", "Pratinjau invoice belum siap.");
        return;
      }
      const tempUri = await captureRef(invoicePreviewRef.current, {
        format: "png",
        quality: 1,
      });
      const fileBaseName = buildPOFileBase(order);
      const fileName = `${fileBaseName}.png`;
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } = await saveFileToStorage(
        tempUri,
        fileName,
        "image/png",
      );
      if (await Sharing.isAvailableAsync()) {
        const resolvedShareUri = await resolveShareableUri(`${fileBaseName}-share.png`, tempUri, savedUri);
        if (resolvedShareUri) {
          await Sharing.shareAsync(resolvedShareUri, {
            mimeType: "image/png",
            dialogTitle: "Bagikan Invoice PO (PNG)",
          });
        } else {
          console.log("SHARE URI NOT AVAILABLE FOR IMAGE");
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
      console.log("PO IMAGE ERROR:", error);
      Alert.alert("Gagal", "Gambar invoice tidak dapat dibuat.");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#2563EB" />
        <Text style={{ marginTop: 12, color: "#64748B" }}>Memuat detail…</Text>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Ionicons name="cart-outline" size={42} color="#CBD5F5" />
        <Text style={{ marginTop: 12, color: "#94A3B8", textAlign: "center" }}>Purchase order tidak ditemukan.</Text>
      </SafeAreaView>
    );
  }

  const totalValue = order.quantity * order.price;
  const statusStyle = getPOStatusStyle(order.status);
  const quantityDisplay = formatNumberValue(order.quantity);
  const priceDisplay = formatCurrencyValue(order.price);
  const totalDisplay = formatCurrencyValue(totalValue);
  const windowWidth = Dimensions.get("window").width;
  const previewBaseWidth = Math.max(windowWidth - 48, 640);
  const previewWidth = computeAmountAwareWidth(previewBaseWidth, 900, [priceDisplay, totalDisplay]);

  const actionButtons = [
    {
      key: "pdf",
      icon: "document-text-outline",
      label: "PDF",
      backgroundColor: "#EEF2FF",
      iconColor: "#6366F1",
      onPress: generateInvoicePdf,
      tooltip: "Generate Invoice (PDF)",
    },
    {
      key: "png",
      icon: "image-outline",
      label: "PNG",
      backgroundColor: "#E0F2FE",
      iconColor: "#0284C7",
      onPress: generateInvoiceImage,
      tooltip: "Simpan sebagai Gambar",
    },
    {
      key: "edit",
      icon: "create-outline",
      label: "Edit",
      backgroundColor: "#E0E7FF",
      iconColor: "#4338CA",
      onPress: () =>
        navigation.navigate("EditPurchaseOrder", {
          orderId,
          onDone: () => {
            onDone && onDone();
            load();
          },
        }),
      tooltip: "Edit Purchase Order",
    },
  ];

  if (order.status !== "DONE") {
    actionButtons.push({
      key: "done",
      icon: "checkmark-done-outline",
      label: "Done",
      backgroundColor: "#DCFCE7",
      iconColor: "#15803D",
      onPress: () => updateStatus("DONE"),
      tooltip: "Tandai selesai",
    });
  }
  if (order.status !== "PROGRESS") {
    actionButtons.push({
      key: "progress",
      icon: "sync-outline",
      label: "Progress",
      backgroundColor: "#DBEAFE",
      iconColor: "#2563EB",
      onPress: () => updateStatus("PROGRESS"),
      tooltip: "Kembalikan ke progress",
    });
  }
  if (order.status !== "CANCELLED") {
    actionButtons.push({
      key: "cancel",
      icon: "close-circle-outline",
      label: "Cancel",
      backgroundColor: "#FEE2E2",
      iconColor: "#DC2626",
      onPress: () => updateStatus("CANCELLED"),
      tooltip: "Batalkan PO",
    });
  }
  actionButtons.push({
    key: "delete",
    icon: "trash-outline",
    label: "Hapus",
    backgroundColor: "#FFE4E6",
    iconColor: "#E11D48",
    onPress: confirmDelete,
    tooltip: "Hapus PO",
  });

  const InvoicePreview = () => (
    <View
      style={{
        width: previewWidth,
        padding: 20,
        backgroundColor: "#fff",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        shadowColor: "#0F172A",
        shadowOpacity: 0.08,
        shadowRadius: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A" }}>Invoice Purchase Order</Text>
          <Text style={{ color: "#64748B", marginTop: 4 }}>No. PO #{order.id}</Text>
        </View>
        <View style={{ backgroundColor: statusStyle.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
          <Text style={{ color: statusStyle.color, fontWeight: "700", fontSize: 12 }}>{statusStyle.label}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: "#F8FAFC", padding: 16, borderRadius: 16, marginBottom: 16 }}>
        <Text style={{ color: "#0F172A", fontWeight: "600" }}>{order.itemName}</Text>
        <Text style={{ color: "#64748B", marginTop: 6 }}>Pemesan: {order.ordererName || "-"}</Text>
        <Text style={{ color: "#64748B", marginTop: 4 }}>Tanggal: {formatDateDisplay(order.orderDate)}</Text>
      </View>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: "#F1F5F9",
            paddingVertical: 10,
            paddingHorizontal: 12,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontWeight: "600", color: "#475569" }}>Deskripsi</Text>
          </View>
          <View style={{ minWidth: 96, alignItems: "flex-end", flexShrink: 0 }}>
            <Text style={{ fontWeight: "600", color: "#475569" }}>Qty</Text>
          </View>
          <View style={{ minWidth: 150, alignItems: "flex-end", flexShrink: 0 }}>
            <Text style={{ fontWeight: "600", color: "#475569" }}>Harga</Text>
          </View>
          <View style={{ minWidth: 170, alignItems: "flex-end", flexShrink: 0 }}>
            <Text style={{ fontWeight: "600", color: "#475569" }}>Total</Text>
          </View>
        </View>
        <View
          style={{ flexDirection: "row", paddingVertical: 12, paddingHorizontal: 12, alignItems: "center" }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: "#0F172A" }}>{order.itemName}</Text>
          </View>
          <View
            style={{
              minWidth: 96,
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "baseline",
              flexShrink: 0,
            }}
          >
            <Text
              style={{
                color: "#0F172A",
                fontVariant: ["tabular-nums"],
                fontWeight: "600",
              }}
            >
              {quantityDisplay}
            </Text>
            <Text
              style={{
                color: "#94A3B8",
                fontSize: 12,
                marginLeft: 4,
                textTransform: "uppercase",
                letterSpacing: 0.08,
              }}
            >
              pcs
            </Text>
          </View>
          <View style={{ minWidth: 150, alignItems: "flex-end", flexShrink: 0 }}>
            <Text style={{ color: "#0F172A", fontVariant: ["tabular-nums"] }}>{priceDisplay}</Text>
          </View>
          <View style={{ minWidth: 170, alignItems: "flex-end", flexShrink: 0 }}>
            <Text
              style={{
                color: "#0F172A",
                fontVariant: ["tabular-nums"],
                fontWeight: "600",
              }}
            >
              {totalDisplay}
            </Text>
          </View>
        </View>
      </View>
      {order.note ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: "#0F172A", fontWeight: "600", marginBottom: 6 }}>Catatan</Text>
          <Text style={{ color: "#64748B", lineHeight: 20 }}>{order.note}</Text>
        </View>
      ) : null}
      <View style={{ marginTop: 16 }}>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>Dibuat pada {formatDateDisplay(order.createdAt)}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View style={{ backgroundColor: "#fff", padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A" }}>{order.itemName}</Text>
            <View style={{ backgroundColor: statusStyle.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
              <Text style={{ color: statusStyle.color, fontWeight: "600" }}>{statusStyle.label}</Text>
            </View>
          </View>
          <View style={{ marginTop: 16, gap: 12 }}>
            <DetailRow label="Pemasok" value={order.supplierName || "-"} />
            <DetailRow label="Pemesan" value={order.ordererName || "-"} />
            <DetailRow label="Tanggal PO" value={formatDateDisplay(order.orderDate)} />
            <DetailRow label="Qty" value={`${quantityDisplay} pcs`} />
            <DetailRow label="Harga Satuan" value={priceDisplay} />
            <DetailRow label="Nilai Total" value={totalDisplay} bold />
            <DetailRow label="Dibuat" value={formatDateDisplay(order.createdAt)} />
            <DetailRow label="Catatan" value={order.note || "-"} multiline />
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, rowGap: 18 }}>
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
      <View style={{ position: "absolute", top: -9999, left: -9999 }}>
        <View ref={invoicePreviewRef} collapsable={false}>
          {order ? <InvoicePreview /> : null}
        </View>
      </View>
      {actionHint ? (
        <View style={{ position: "absolute", bottom: 24, left: 0, right: 0, alignItems: "center", pointerEvents: "none" }}>
          <View style={{ backgroundColor: "rgba(15,23,42,0.92)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 }}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>{actionHint}</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
