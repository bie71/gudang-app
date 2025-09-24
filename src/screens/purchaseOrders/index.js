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
import { buildOrderItemLabel } from "../../utils/purchaseOrders";
import { getPOStatusStyle, PO_STATUS_OPTIONS, PO_STATUS_STYLES } from "../../constants";

const ITEM_TABLE_MIN_WIDTH = 640;

const ITEM_TABLE_CONTAINER_STYLE = {
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "#E2E8F0",
  overflow: "hidden",
  minWidth: ITEM_TABLE_MIN_WIDTH,
};

const ITEM_TABLE_HEADER_ROW = {
  flexDirection: "row",
  backgroundColor: "#F1F5F9",
  paddingVertical: 10,
  paddingHorizontal: 12,
  minWidth: ITEM_TABLE_MIN_WIDTH,
};

const ITEM_TABLE_ROW_BASE = {
  flexDirection: "row",
  paddingVertical: 12,
  paddingHorizontal: 12,
  alignItems: "flex-start",
  minWidth: ITEM_TABLE_MIN_WIDTH,
};

const ITEM_TABLE_ROW_DIVIDER = {
  borderTopWidth: 1,
  borderColor: "#E2E8F0",
};

const ITEM_TABLE_COLUMNS = {
  name: { flexGrow: 1, flexShrink: 0, flexBasis: 240, paddingRight: 12, minWidth: 220 },
  qty: { flexGrow: 0, flexShrink: 0, flexBasis: 110, alignItems: "flex-end", minWidth: 110 },
  price: { flexGrow: 0, flexShrink: 0, flexBasis: 150, alignItems: "flex-end", minWidth: 150 },
  total: { flexGrow: 0, flexShrink: 0, flexBasis: 160, alignItems: "flex-end", minWidth: 160 },
};

const ITEM_TABLE_NUMERIC_TEXT = {
  color: "#0F172A",
  fontVariant: ["tabular-nums"],
  textAlign: "right",
  flexShrink: 1,
};

const ITEM_TABLE_NUMERIC_TEXT_STRONG = {
  ...ITEM_TABLE_NUMERIC_TEXT,
  fontWeight: "600",
};

const ITEM_TABLE_QTY_CONTAINER = {
  flexDirection: "row",
  alignItems: "baseline",
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const ITEM_TABLE_QTY_UNIT_TEXT = {
  color: "#94A3B8",
  fontSize: 12,
  marginLeft: 4,
  textTransform: "uppercase",
  letterSpacing: 0.08,
  flexShrink: 0,
};

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
          SELECT
            po.id,
            po.supplier_name,
            po.orderer_name,
            po.status,
            po.order_date,
            po.note,
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
              SELECT 1
              FROM purchase_order_items search_items
              WHERE search_items.order_id = po.id AND LOWER(search_items.name) LIKE ?
            )
          )
          GROUP BY po.id
          ORDER BY po.order_date DESC, po.id DESC
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
      const pageOrders = rowsArray.slice(0, PAGE_SIZE).map(row => {
        const itemCount = Number(row.item_count ?? 0);
        const totalQuantity = Number(row.total_quantity ?? 0);
        const totalValue = Number(row.total_value ?? 0);
        const primaryItemName = row.primary_item_name || "";
        const itemName = buildOrderItemLabel(primaryItemName, itemCount || (primaryItemName ? 1 : 0));
        return {
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
          note: row.note,
        };
      });
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
    const statusStyle = getPOStatusStyle(item.status);
    const totalValue = item.totalValue ?? 0;
    const totalQuantity = item.totalQuantity ?? 0;
    const itemsCount = item.itemsCount ?? (item.primaryItemName ? 1 : 0);
    const quantityLabel = formatNumberValue(totalQuantity);
    const itemsLabel = formatNumberValue(itemsCount || (totalQuantity > 0 ? 1 : 0));
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
            <Text style={{ color: "#94A3B8", fontSize: 12 }}>{`${itemsLabel} barang • ${quantityLabel} pcs`}</Text>
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
  const itemKeyRef = useRef(0);
  const createEmptyItem = () => ({
    key: `temp-${++itemKeyRef.current}`,
    name: "",
    quantity: "",
    price: "",
  });
  const [supplierName, setSupplierName] = useState("");
  const [ordererName, setOrdererName] = useState("");
  const [orderDate, setOrderDate] = useState(formatDateInputValue(new Date()));
  const [status, setStatus] = useState("PROGRESS");
  const [note, setNote] = useState("");
  const [items, setItems] = useState([createEmptyItem()]);

  const updateItemField = (index, field, value) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItem = index => {
    setItems(prev => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  async function save() {
    const trimmedDate = (orderDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      return Alert.alert("Validasi", "Tanggal harus dalam format YYYY-MM-DD.");
    }

    const preparedItems = items.map(item => {
      const name = (item.name || "").trim();
      const quantityValue = parseNumberInput(item.quantity);
      const priceValue = parseNumberInput(item.price);
      const hasValue = Boolean(name) || quantityValue > 0 || priceValue > 0;
      return { key: item.key, name, quantity: quantityValue, price: priceValue, hasValue };
    });

    const activeItems = preparedItems.filter(item => item.hasValue);
    if (!activeItems.length) {
      return Alert.alert("Validasi", "Minimal satu barang harus diisi.");
    }

    for (let i = 0; i < activeItems.length; i++) {
      const entry = activeItems[i];
      if (!entry.name) {
        return Alert.alert("Validasi", `Nama barang pada baris ${i + 1} wajib diisi.`);
      }
      if (entry.quantity <= 0) {
        return Alert.alert("Validasi", `Qty pada baris ${i + 1} harus lebih besar dari 0.`);
      }
    }

    const firstItem = activeItems[0];
    const summaryName = buildOrderItemLabel(firstItem.name, activeItems.length);

    try {
      await exec("BEGIN TRANSACTION");
      const insertRes = await exec(
        `INSERT INTO purchase_orders (supplier_name, orderer_name, item_name, quantity, price, order_date, status, note)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          supplierName || null,
          ordererName || null,
          summaryName,
          firstItem.quantity,
          firstItem.price,
          trimmedDate,
          status,
          note || null,
        ],
      );
      const orderId = insertRes.insertId;
      if (!orderId) {
        throw new Error("Gagal mendapatkan ID purchase order");
      }
      for (const entry of activeItems) {
        await exec(
          `INSERT INTO purchase_order_items (order_id, name, quantity, price) VALUES (?,?,?,?)`,
          [orderId, entry.name, entry.quantity, entry.price],
        );
      }
      await exec("COMMIT");
      onDone && onDone();
      navigation.goBack();
    } catch (error) {
      try {
        await exec("ROLLBACK");
      } catch (rollbackError) {
        console.log("PO INSERT ROLLBACK ERROR:", rollbackError);
      }
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
        <View style={{ marginBottom: 12 }}>
          <Text style={{ marginBottom: 6, color: "#475569" }}>Daftar Barang</Text>
          {items.map((item, index) => {
            const lineTotal = parseNumberInput(item.quantity) * parseNumberInput(item.price);
            return (
              <View
                key={item.key}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  padding: 16,
                  marginBottom: index === items.length - 1 ? 0 : 12,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={{ fontWeight: "600", color: "#0F172A" }}>{`Barang ${index + 1}`}</Text>
                  {items.length > 1 ? (
                    <TouchableOpacity onPress={() => removeItem(index)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Input
                  label="Nama Barang"
                  value={item.name}
                  onChangeText={text => updateItemField(index, "name", text)}
                  placeholder="contoh: Kardus 40x40"
                />
                <Input
                  label="Qty"
                  value={item.quantity}
                  onChangeText={text => updateItemField(index, "quantity", formatNumberInput(text))}
                  keyboardType="numeric"
                  placeholder="contoh: 50"
                />
                <Input
                  label="Harga Satuan"
                  value={item.price}
                  onChangeText={text => updateItemField(index, "price", formatNumberInput(text))}
                  keyboardType="numeric"
                  placeholder="contoh: 125000"
                />
                {lineTotal > 0 ? (
                  <Text style={{ color: "#64748B", fontSize: 12 }}>
                    Perkiraan total: {formatCurrencyValue(lineTotal)}
                  </Text>
                ) : null}
              </View>
            );
          })}
          <TouchableOpacity
            onPress={addItem}
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: "#E0F2FE",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#0284C7" style={{ marginRight: 6 }} />
            <Text style={{ color: "#0369A1", fontWeight: "600" }}>Tambah Barang</Text>
          </TouchableOpacity>
        </View>
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
  const [orderDate, setOrderDate] = useState(formatDateInputValue(new Date()));
  const [status, setStatus] = useState("PROGRESS");
  const [note, setNote] = useState("");
  const itemKeyRef = useRef(0);
  const createEmptyItem = () => ({
    key: `temp-${++itemKeyRef.current}`,
    name: "",
    quantity: "",
    price: "",
  });
  const [items, setItems] = useState([createEmptyItem()]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const orderRes = await exec(`SELECT * FROM purchase_orders WHERE id = ?`, [orderId]);
        if (!orderRes.rows.length) {
          Alert.alert("Tidak ditemukan", "Purchase order tidak ditemukan.");
          navigation.goBack();
          return;
        }
        const orderRow = orderRes.rows.item(0);
        setSupplierName(orderRow.supplier_name || "");
        setOrdererName(orderRow.orderer_name || "");
        setOrderDate(formatDateInputValue(orderRow.order_date));
        setStatus(orderRow.status || "PROGRESS");
        setNote(orderRow.note || "");

        const itemsRes = await exec(
          `SELECT id, name, quantity, price FROM purchase_order_items WHERE order_id = ? ORDER BY id`,
          [orderId],
        );
        const loadedItems = [];
        for (let i = 0; i < itemsRes.rows.length; i++) {
          const row = itemsRes.rows.item(i);
          loadedItems.push({
            key: `item-${row.id}`,
            name: row.name || "",
            quantity: formatNumberInput(String(row.quantity ?? "")),
            price: formatNumberInput(String(row.price ?? "")),
          });
        }
        itemKeyRef.current = 0;
        if (!loadedItems.length) {
          setItems([createEmptyItem()]);
        } else {
          setItems(loadedItems);
        }
      } catch (error) {
        console.log("PO DETAIL LOAD ERROR:", error);
        Alert.alert("Gagal", "Tidak dapat memuat purchase order.");
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId, navigation]);

  const updateItemField = (index, field, value) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItem = index => {
    setItems(prev => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  async function save() {
    const trimmedDate = (orderDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      return Alert.alert("Validasi", "Tanggal harus dalam format YYYY-MM-DD.");
    }

    const preparedItems = items.map(item => {
      const name = (item.name || "").trim();
      const quantityValue = parseNumberInput(item.quantity);
      const priceValue = parseNumberInput(item.price);
      const hasValue = Boolean(name) || quantityValue > 0 || priceValue > 0;
      return { key: item.key, name, quantity: quantityValue, price: priceValue, hasValue };
    });

    const activeItems = preparedItems.filter(item => item.hasValue);
    if (!activeItems.length) {
      return Alert.alert("Validasi", "Minimal satu barang harus diisi.");
    }

    for (let i = 0; i < activeItems.length; i++) {
      const entry = activeItems[i];
      if (!entry.name) {
        return Alert.alert("Validasi", `Nama barang pada baris ${i + 1} wajib diisi.`);
      }
      if (entry.quantity <= 0) {
        return Alert.alert("Validasi", `Qty pada baris ${i + 1} harus lebih besar dari 0.`);
      }
    }

    const firstItem = activeItems[0];
    const summaryName = buildOrderItemLabel(firstItem.name, activeItems.length);

    try {
      await exec("BEGIN TRANSACTION");
      await exec(
        `UPDATE purchase_orders SET supplier_name = ?, orderer_name = ?, item_name = ?, quantity = ?, price = ?, order_date = ?, status = ?, note = ?
         WHERE id = ?`,
        [
          supplierName || null,
          ordererName || null,
          summaryName,
          firstItem.quantity,
          firstItem.price,
          trimmedDate,
          status,
          note || null,
          orderId,
        ],
      );
      await exec(`DELETE FROM purchase_order_items WHERE order_id = ?`, [orderId]);
      for (const entry of activeItems) {
        await exec(
          `INSERT INTO purchase_order_items (order_id, name, quantity, price) VALUES (?,?,?,?)`,
          [orderId, entry.name, entry.quantity, entry.price],
        );
      }
      await exec("COMMIT");
      onDone && onDone();
      navigation.goBack();
    } catch (error) {
      try {
        await exec("ROLLBACK");
      } catch (rollbackError) {
        console.log("PO UPDATE ROLLBACK ERROR:", rollbackError);
      }
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
        <View style={{ marginBottom: 12 }}>
          <Text style={{ marginBottom: 6, color: "#475569" }}>Daftar Barang</Text>
          {items.map((item, index) => {
            const lineTotal = parseNumberInput(item.quantity) * parseNumberInput(item.price);
            return (
              <View
                key={item.key}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  padding: 16,
                  marginBottom: index === items.length - 1 ? 0 : 12,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <Text style={{ fontWeight: "600", color: "#0F172A" }}>{`Barang ${index + 1}`}</Text>
                  {items.length > 1 ? (
                    <TouchableOpacity onPress={() => removeItem(index)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Input
                  label="Nama Barang"
                  value={item.name}
                  onChangeText={text => updateItemField(index, "name", text)}
                  placeholder="contoh: Kardus 40x40"
                />
                <Input
                  label="Qty"
                  value={item.quantity}
                  onChangeText={text => updateItemField(index, "quantity", formatNumberInput(text))}
                  keyboardType="numeric"
                  placeholder="contoh: 50"
                />
                <Input
                  label="Harga Satuan"
                  value={item.price}
                  onChangeText={text => updateItemField(index, "price", formatNumberInput(text))}
                  keyboardType="numeric"
                  placeholder="contoh: 125000"
                />
                {lineTotal > 0 ? (
                  <Text style={{ color: "#64748B", fontSize: 12 }}>
                    Perkiraan total: {formatCurrencyValue(lineTotal)}
                  </Text>
                ) : null}
              </View>
            );
          })}
          <TouchableOpacity
            onPress={addItem}
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: "#E0F2FE",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#0284C7" style={{ marginRight: 6 }} />
            <Text style={{ color: "#0369A1", fontWeight: "600" }}>Tambah Barang</Text>
          </TouchableOpacity>
        </View>
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
      if (!res.rows.length) {
        setOrder(null);
        return;
      }
      const row = res.rows.item(0);
      const itemsRes = await exec(
        `SELECT id, name, quantity, price FROM purchase_order_items WHERE order_id = ? ORDER BY id`,
        [orderId],
      );
      const items = [];
      for (let i = 0; i < itemsRes.rows.length; i++) {
        const itemRow = itemsRes.rows.item(i);
        items.push({
          id: itemRow.id,
          name: itemRow.name || "",
          quantity: Number(itemRow.quantity ?? 0),
          price: Number(itemRow.price ?? 0),
        });
      }
      const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const totalValue = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0);
      const primaryItemName = items.length ? items[0].name : row.item_name || "";
      const itemName = buildOrderItemLabel(primaryItemName, items.length || (primaryItemName ? 1 : 0));
      setOrder({
        id: row.id,
        supplierName: row.supplier_name,
        ordererName: row.orderer_name,
        itemName,
        primaryItemName,
        items,
        itemsCount: items.length,
        totalQuantity,
        totalValue,
        status: row.status,
        orderDate: row.order_date,
        note: row.note,
        createdAt: row.created_at,
      });
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
      const totalValue = order.totalValue ?? 0;
      const totalQuantity = order.totalQuantity ?? 0;
      const totalFormatted = formatCurrencyValue(totalValue);
      const totalQuantityFormatted = formatNumberValue(totalQuantity);
      const invoiceItems = order.items && order.items.length
        ? order.items
        : [
            {
              id: order.id,
              name: order.primaryItemName || order.itemName || "Tanpa barang",
              quantity: totalQuantity || 0,
              price: totalQuantity > 0 ? Math.round(totalValue / totalQuantity) : totalValue,
            },
          ];
      const noteHtml = order.note ? escapeHtml(order.note).replace(/\n/g, "<br/>") : "";
      const statusStyle = getPOStatusStyle(order.status);
      const priceStrings = invoiceItems.map(item => formatCurrencyValue(item.price));
      const rowTotalStrings = invoiceItems.map(item => formatCurrencyValue((item.quantity || 0) * (item.price || 0)));
      const cardWidth = computeAmountAwareWidth(640, 900, [...priceStrings, ...rowTotalStrings, totalFormatted]);
      const itemsHtml = invoiceItems
        .map(item => {
          const qtyFormatted = formatNumberValue(item.quantity);
          const priceFormatted = formatCurrencyValue(item.price);
          const rowTotalFormatted = formatCurrencyValue((item.quantity || 0) * (item.price || 0));
          return `
                  <tr>
                    <td class="item col-item">${escapeHtml(item.name || '-')}</td>
                    <td class="numeric numeric--qty col-qty">
                      <span class="value">${qtyFormatted}</span>
                      <span class="unit">pcs</span>
                    </td>
                    <td class="numeric numeric--price col-price">
                      <span class="value">${priceFormatted}</span>
                    </td>
                    <td class="numeric numeric--total col-total">
                      <span class="value">${rowTotalFormatted}</span>
                    </td>
                  </tr>`;
        })
        .join("\n");
      const itemCountFormatted = formatNumberValue(order.itemsCount ?? invoiceItems.length);
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
              th,
              td {
                padding: 14px 16px;
              }
              th {
                text-align: left;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #475569;
              }
              th.numeric {
                text-align: right;
              }
              th.col-item,
              td.col-item {
                width: 46%;
              }
              th.col-qty,
              td.col-qty {
                width: 14%;
              }
              th.col-price,
              td.col-price,
              th.col-total,
              td.col-total {
                width: 20%;
              }
              td {
                border-bottom: 1px solid #e2e8f0;
                font-size: 15px;
                color: #0f172a;
                vertical-align: top;
              }
              td.col-item {
                word-break: break-word;
              }
              td.numeric {
                display: flex;
                justify-content: flex-end;
                align-items: baseline;
                flex-wrap: wrap;
                font-variant-numeric: tabular-nums;
              }
              td.numeric .value {
                font-weight: 500;
                text-align: right;
                flex: 0 1 auto;
                min-width: 0;
              }
              td.numeric--qty .value {
                font-weight: 600;
              }
              td.numeric .unit {
                margin-left: 6px;
                font-size: 12px;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                flex: 0 0 auto;
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
                <p><strong>Jumlah Barang</strong>${itemCountFormatted} item</p>
                <p><strong>Total Qty</strong>${totalQuantityFormatted} pcs</p>
                <p><strong>Nilai Total</strong>${totalFormatted}</p>
              </div>
              <table>
                <thead>
                  <tr>
                    <th class="col-item">Barang</th>
                    <th class="numeric numeric--qty col-qty">Qty</th>
                    <th class="numeric numeric--price col-price">Harga</th>
                    <th class="numeric numeric--total col-total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
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

  const invoiceItems = order.items && order.items.length
    ? order.items
    : [
        {
          id: `fallback-${order.id}`,
          name: order.primaryItemName || order.itemName || "Tanpa barang",
          quantity: order.totalQuantity ?? 0,
          price:
            (order.totalQuantity ?? 0) > 0
              ? Math.round((order.totalValue ?? 0) / Math.max(order.totalQuantity ?? 1, 1))
              : order.totalValue ?? 0,
        },
      ];
  const totalValue = order.totalValue ?? 0;
  const totalQuantity = order.totalQuantity ?? 0;
  const itemsCount = order.itemsCount ?? invoiceItems.length;
  const statusStyle = getPOStatusStyle(order.status);
  const quantityDisplay = formatNumberValue(totalQuantity);
  const itemCountDisplay = formatNumberValue(itemsCount);
  const totalDisplay = formatCurrencyValue(totalValue);
  const windowWidth = Dimensions.get("window").width;
  const previewBaseWidth = Math.max(windowWidth - 48, 640);
  const previewWidth = computeAmountAwareWidth(
    previewBaseWidth,
    900,
    [
      ...invoiceItems.map(item => formatCurrencyValue(item.price)),
      ...invoiceItems.map(item => formatCurrencyValue((item.quantity || 0) * (item.price || 0))),
      totalDisplay,
    ],
  );

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
        <Text style={{ color: "#0F172A", fontWeight: "600", marginTop: 12 }}>
          Total {itemCountDisplay} barang • {quantityDisplay} pcs
        </Text>
        <Text style={{ color: "#0F172A", fontWeight: "700", marginTop: 4 }}>{totalDisplay}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 0 }}>
        <View style={ITEM_TABLE_CONTAINER_STYLE}>
          <View style={ITEM_TABLE_HEADER_ROW}>
            <View style={ITEM_TABLE_COLUMNS.name}>
              <Text style={{ fontWeight: "600", color: "#475569" }}>Deskripsi</Text>
            </View>
            <View style={ITEM_TABLE_COLUMNS.qty}>
              <Text style={{ fontWeight: "600", color: "#475569", textAlign: "right" }}>Qty</Text>
            </View>
            <View style={ITEM_TABLE_COLUMNS.price}>
              <Text style={{ fontWeight: "600", color: "#475569", textAlign: "right" }}>Harga</Text>
            </View>
            <View style={ITEM_TABLE_COLUMNS.total}>
              <Text style={{ fontWeight: "600", color: "#475569", textAlign: "right" }}>Total</Text>
            </View>
          </View>
          {invoiceItems.map((item, index) => {
            const rowQuantity = formatNumberValue(item.quantity);
            const rowPrice = formatCurrencyValue(item.price);
            const rowTotal = formatCurrencyValue((item.quantity || 0) * (item.price || 0));
            return (
              <View
                key={item.id ?? `item-${index}`}
                style={[ITEM_TABLE_ROW_BASE, index === 0 ? null : ITEM_TABLE_ROW_DIVIDER]}
              >
                <View style={ITEM_TABLE_COLUMNS.name}>
                  <Text style={{ color: "#0F172A", flexShrink: 0 }}>{item.name || "-"}</Text>
                </View>
                <View style={[ITEM_TABLE_COLUMNS.qty, ITEM_TABLE_QTY_CONTAINER]}>
                  <Text style={ITEM_TABLE_NUMERIC_TEXT_STRONG}>{rowQuantity}</Text>
                  <Text style={ITEM_TABLE_QTY_UNIT_TEXT}>pcs</Text>
                </View>
                <View style={ITEM_TABLE_COLUMNS.price}>
                  <Text style={ITEM_TABLE_NUMERIC_TEXT}>{rowPrice}</Text>
                </View>
                <View style={ITEM_TABLE_COLUMNS.total}>
                  <Text style={ITEM_TABLE_NUMERIC_TEXT_STRONG}>{rowTotal}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
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
            <DetailRow label="Jumlah Barang" value={`${itemCountDisplay} barang`} />
            <DetailRow label="Total Qty" value={`${quantityDisplay} pcs`} />
            <DetailRow label="Nilai Total" value={totalDisplay} bold />
            <DetailRow label="Dibuat" value={formatDateDisplay(order.createdAt)} />
            <DetailRow label="Catatan" value={order.note || "-"} multiline />
          </View>
          <View style={{ marginTop: 20 }}>
            <Text style={{ color: "#0F172A", fontWeight: "600", marginBottom: 10 }}>Daftar Barang</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 0 }}>
              <View style={ITEM_TABLE_CONTAINER_STYLE}>
                <View style={ITEM_TABLE_HEADER_ROW}>
                  <View style={ITEM_TABLE_COLUMNS.name}>
                    <Text style={{ fontWeight: "600", color: "#475569" }}>Barang</Text>
                  </View>
                  <View style={ITEM_TABLE_COLUMNS.qty}>
                    <Text style={{ fontWeight: "600", color: "#475569", textAlign: "right" }}>Qty</Text>
                  </View>
                  <View style={ITEM_TABLE_COLUMNS.price}>
                    <Text style={{ fontWeight: "600", color: "#475569", textAlign: "right" }}>Harga</Text>
                  </View>
                  <View style={ITEM_TABLE_COLUMNS.total}>
                    <Text style={{ fontWeight: "600", color: "#475569", textAlign: "right" }}>Total</Text>
                  </View>
                </View>
                {invoiceItems.map((item, index) => {
                  const rowQuantity = formatNumberValue(item.quantity);
                  const rowPrice = formatCurrencyValue(item.price);
                  const rowTotal = formatCurrencyValue((item.quantity || 0) * (item.price || 0));
                  return (
                    <View
                      key={item.id ?? `summary-item-${index}`}
                      style={[ITEM_TABLE_ROW_BASE, index === 0 ? null : ITEM_TABLE_ROW_DIVIDER]}
                    >
                      <View style={ITEM_TABLE_COLUMNS.name}>
                        <Text style={{ color: "#0F172A", flexShrink: 0 }}>{item.name || "-"}</Text>
                      </View>
                      <View style={[ITEM_TABLE_COLUMNS.qty, ITEM_TABLE_QTY_CONTAINER]}>
                        <Text style={ITEM_TABLE_NUMERIC_TEXT_STRONG}>{rowQuantity}</Text>
                        <Text style={ITEM_TABLE_QTY_UNIT_TEXT}>pcs</Text>
                      </View>
                      <View style={ITEM_TABLE_COLUMNS.price}>
                        <Text style={ITEM_TABLE_NUMERIC_TEXT}>{rowPrice}</Text>
                      </View>
                      <View style={ITEM_TABLE_COLUMNS.total}>
                        <Text style={ITEM_TABLE_NUMERIC_TEXT_STRONG}>{rowTotal}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
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
