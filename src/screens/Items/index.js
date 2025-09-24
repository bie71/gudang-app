import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ActionButton from "../../components/ActionButton";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import { exec } from "../../services/database";
import {
  formatCurrencyValue,
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
          renderItem={({ item }) => (
            <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 10 }}>
              <Text style={{ fontWeight: "700" }}>{item.name}</Text>
              <Text style={{ color: "#64748B" }}>{item.category || "-"}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text>Harga: {formatCurrencyValue(item.price)}</Text>
                <Text>Stok: {formatNumberValue(item.stock)}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
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
          )}
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

export function AddItemScreen({ route, navigation }) {
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

  async function commit() {
    const q = parseInt(qty || "0", 10);
    if (q <= 0) return Alert.alert("Validasi", "Qty harus > 0.");
    if (mode === "OUT" && q > item.stock) return Alert.alert("Stok Tidak Cukup", `Stok tersedia ${item.stock}`);
    await exec(`INSERT INTO stock_history(item_id, type, qty, note) VALUES (?,?,?,?)`, [item.id, mode, q, note || null]);
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
