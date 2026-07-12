import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";

import { exec } from "../services/database";
import { saveFileToStorage, resolveShareableUri } from "../services/files";
import IconActionButton from "../components/IconActionButton";
import {
  formatCurrencyValue,
  formatDateDisplay,
  formatNumberInput,
  parseNumberInput,
} from "../utils/format";

export function CalculatorScreen() {
  const [entries, setEntries] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Form Modal State
  const [formVisible, setFormVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  
  // Multiple Items State
  const [formItems, setFormItems] = useState([
    { id: Date.now(), name: "", price: "", qty: "1" }
  ]);
  const [shippingFee, setShippingFee] = useState("");
  const [taxFee, setTaxFee] = useState("");
  const [otherFee, setOtherFee] = useState("");
  const [note, setNote] = useState("");

  // Detail Modal State
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [exporting, setExporting] = useState(false);
  const invoicePreviewRef = useRef(null);

  // Load Data
  const loadEntries = useCallback(async (searchVal = searchTerm) => {
    setLoading(true);
    try {
      let query = "SELECT * FROM calculator_entries";
      let params = [];
      if (searchVal.trim()) {
        query += " WHERE item_name LIKE ? OR note LIKE ? OR items_json LIKE ?";
        const p = `%${searchVal}%`;
        params = [p, p, p];
      }
      query += " ORDER BY id DESC";
      const res = await exec(query, params);
      const rows = [];
      for (let i = 0; i < res.rows.length; i++) {
        rows.push(res.rows.item(i));
      }
      setEntries(rows);
    } catch (error) {
      console.log("LOAD CALCULATOR ENTRIES ERROR:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    loadEntries();
  }, []);

  // Search debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      loadEntries(searchTerm);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadEntries();
  };

  // Multiple Items Helpers
  const addFormItem = () => {
    setFormItems([
      ...formItems,
      { id: Date.now() + Math.random(), name: "", price: "", qty: "1" }
    ]);
  };

  const removeFormItem = (id) => {
    if (formItems.length > 1) {
      setFormItems(formItems.filter(item => item.id !== id));
    } else {
      Alert.alert("Info", "Minimal harus ada 1 barang.");
    }
  };

  const updateFormItem = (id, field, value) => {
    setFormItems(
      formItems.map(item => {
        if (item.id === id) {
          if (field === "price" || field === "qty") {
            return { ...item, [field]: formatNumberInput(value) };
          }
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const getFormSubtotal = () => {
    return formItems.reduce((sum, item) => {
      const price = parseNumberInput(item.price) || 0;
      const qty = parseNumberInput(item.qty) || 0;
      return sum + (price * qty);
    }, 0);
  };

  const getFormTotalQty = () => {
    return formItems.reduce((sum, item) => {
      return sum + (parseNumberInput(item.qty) || 0);
    }, 0);
  };

  // Open Form for Add
  const openAddForm = () => {
    setEditingEntry(null);
    setFormItems([{ id: Date.now(), name: "", price: "", qty: "1" }]);
    setShippingFee("");
    setTaxFee("");
    setOtherFee("");
    setNote("");
    setFormVisible(true);
  };

  // Open Form for Edit
  const openEditForm = (entry) => {
    setEditingEntry(entry);
    setShippingFee(formatNumberInput(String(entry.shipping_fee)));
    setTaxFee(formatNumberInput(String(entry.tax_fee)));
    setOtherFee(formatNumberInput(String(entry.other_fee)));
    setNote(entry.note || "");

    // Parse items_json or build default from single item columns
    let parsedItems = [];
    if (entry.items_json) {
      try {
        const list = JSON.parse(entry.items_json);
        parsedItems = list.map((it, idx) => ({
          id: Date.now() + idx,
          name: it.name,
          price: formatNumberInput(String(it.price)),
          qty: formatNumberInput(String(it.qty))
        }));
      } catch (e) {
        parsedItems = [];
      }
    }
    
    if (parsedItems.length === 0) {
      parsedItems = [{
        id: Date.now(),
        name: entry.item_name,
        price: formatNumberInput(String(entry.base_price)),
        qty: "1"
      }];
    }

    setFormItems(parsedItems);
    setFormVisible(true);
  };

  // Save Entry
  const handleSave = async () => {
    // Validate items
    const invalidItem = formItems.find(it => !it.name.trim() || !it.price);
    if (invalidItem) {
      Alert.alert("Validasi", "Nama barang dan harga wajib diisi untuk semua baris.");
      return;
    }

    const subtotal = getFormSubtotal();
    const totalQty = getFormTotalQty();
    const ship = parseNumberInput(shippingFee) || 0;
    const tax = parseNumberInput(taxFee) || 0;
    const other = parseNumberInput(otherFee) || 0;
    const grandTotal = subtotal + ship + tax + other;

    // Create a descriptive item_name for legacy compatibility
    let titleName = formItems[0].name.trim();
    if (formItems.length > 1) {
      titleName += ` (+${formItems.length - 1} barang)`;
    }

    // Serialize items to JSON
    const itemsJson = JSON.stringify(
      formItems.map(it => ({
        name: it.name.trim(),
        price: parseNumberInput(it.price) || 0,
        qty: parseNumberInput(it.qty) || 0
      }))
    );

    try {
      if (editingEntry) {
        await exec(
          `UPDATE calculator_entries 
           SET item_name = ?, base_price = ?, shipping_fee = ?, tax_fee = ?, other_fee = ?, total_price = ?, note = ?, items_json = ? 
           WHERE id = ?`,
          [titleName, subtotal, ship, tax, other, grandTotal, note.trim(), itemsJson, editingEntry.id]
        );
      } else {
        await exec(
          `INSERT INTO calculator_entries (item_name, base_price, shipping_fee, tax_fee, other_fee, total_price, note, items_json) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [titleName, subtotal, ship, tax, other, grandTotal, note.trim(), itemsJson]
        );
      }
      setFormVisible(false);
      loadEntries();
    } catch (error) {
      console.log("SAVE CALCULATOR ENTRY ERROR:", error);
      Alert.alert("Gagal", "Tidak dapat menyimpan data kalkulasi.");
    }
  };

  // Delete Entry
  const handleDelete = (entry) => {
    Alert.alert("Hapus Kalkulasi", `Yakin ingin menghapus kalkulasi ${entry.item_name}?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await exec("DELETE FROM calculator_entries WHERE id = ?", [entry.id]);
            loadEntries();
          } catch (error) {
            console.log("DELETE CALCULATOR ENTRY ERROR:", error);
            Alert.alert("Gagal", "Tidak dapat menghapus data.");
          }
        },
      },
    ]);
  };

  // Export PNG
  const handleExportPng = async () => {
    if (!selectedEntry) return;
    setExporting(true);
    try {
      const viewShot = invoicePreviewRef.current;
      if (!viewShot || typeof viewShot.capture !== "function") {
        Alert.alert("Gagal", "Pratinjau gambar belum siap.");
        return;
      }
      const tempUri = await viewShot.capture({ format: "png", quality: 1 });
      const fileBase = `kalkulasi-${selectedEntry.id}-${Date.now()}`;
      const fileName = `${fileBase}.png`;
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } = await saveFileToStorage(
        tempUri,
        fileName,
        "image/png"
      );
      if (await Sharing.isAvailableAsync()) {
        const resolvedShareUri = await resolveShareableUri(`${fileBase}-share.png`, tempUri, savedUri);
        if (resolvedShareUri) {
          await Sharing.shareAsync(resolvedShareUri, {
            mimeType: "image/png",
            dialogTitle: "Bagikan Kalkulasi Biaya (PNG)",
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
      console.log("EXPORT PNG ERROR:", error);
      Alert.alert("Gagal", "Gambar tidak dapat diekspor.");
    } finally {
      setExporting(false);
    }
  };

  // Parse items list for display
  const getItemList = (item) => {
    if (item.items_json) {
      try {
        return JSON.parse(item.items_json);
      } catch (e) {
        // Fallback
      }
    }
    return [{ name: item.item_name, price: item.base_price, qty: 1 }];
  };

  const renderItem = ({ item }) => {
    const list = getItemList(item);
    const totalItemsQty = list.reduce((sum, it) => sum + (it.qty || 1), 0);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          setSelectedEntry(item);
          setDetailVisible(true);
        }}
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
        {/* Title & Date */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>
              {list.length === 1 ? list[0].name : `${list[0].name} (+${list.length - 1} barang)`}
            </Text>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{formatDateDisplay(item.created_at)}</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#0D9488" }}>{formatCurrencyValue(item.total_price)}</Text>
        </View>

        {/* Dynamic Items List */}
        <View style={{ marginTop: 10, gap: 4 }}>
          {list.map((it, idx) => (
            <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: "#475569", flex: 1 }} numberOfLines={1}>
                • {it.name}
              </Text>
              <Text style={{ fontSize: 11, color: "#64748B", width: 45, textAlign: "right" }}>
                {it.qty}x
              </Text>
              <Text style={{ fontSize: 12, color: "#0F172A", fontWeight: "500", width: 90, textAlign: "right" }}>
                {formatCurrencyValue(it.price * it.qty)}
              </Text>
            </View>
          ))}
        </View>

        {/* Breakdown Details */}
        <View style={{ backgroundColor: "#F8FAFC", borderRadius: 10, padding: 10, marginTop: 12, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 11, color: "#64748B" }}>Total Barang</Text>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{totalItemsQty} Unit</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 11, color: "#64748B" }}>Subtotal Barang</Text>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{formatCurrencyValue(item.base_price)}</Text>
          </View>
          {item.shipping_fee > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, color: "#64748B" }}>Ongkir</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{formatCurrencyValue(item.shipping_fee)}</Text>
            </View>
          )}
          {item.tax_fee > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, color: "#64748B" }}>Pajak</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{formatCurrencyValue(item.tax_fee)}</Text>
            </View>
          )}
          {item.other_fee > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, color: "#64748B" }}>Biaya Lain-lain</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{formatCurrencyValue(item.other_fee)}</Text>
            </View>
          )}
          {item.note ? (
            <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, fontStyle: "italic" }}>
              * Catatan: {item.note}
            </Text>
          ) : null}
        </View>

        {/* Row Actions */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {/* Lihat Detail */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setSelectedEntry(item);
              setDetailVisible(true);
            }}
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

          {/* Edit */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => openEditForm(item)}
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

          {/* Hapus */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleDelete(item)}
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
  };

  const formSubtotal = getFormSubtotal();
  const formTotalQty = getFormTotalQty();

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#0F172A" }}>
      {/* Header */}
      <View style={{ backgroundColor: "#0F172A", padding: 20, paddingBottom: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700", letterSpacing: -0.5 }}>
            Kalkulator Biaya
          </Text>
        </View>

        {/* Search row */}
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
              placeholder="Cari kalkulasi barang..."
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

      {/* Main List */}
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <FlatList
          data={entries}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingVertical: 40 }}>
                <ActivityIndicator color="#0D9488" />
              </View>
            ) : (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Ionicons name="calculator-outline" size={36} color="#CBD5F5" />
                <Text style={{ color: "#94A3B8", marginTop: 8 }}>
                  {searchTerm.trim() ? "Tidak ada hasil kalkulasi." : "Belum ada catatan kalkulasi."}
                </Text>
              </View>
            )
          }
        />
      </View>

      {/* FAB */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openAddForm}
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

      {/* Add/Edit Modal */}
      <Modal visible={formVisible} transparent animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.55)" }}
        >
          <Pressable onPress={() => setFormVisible(false)} style={{ flex: 1 }} />
          <View
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: Platform.OS === "ios" ? 34 : 24,
              maxHeight: "85%",
              shadowColor: "#0F172A",
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 6,
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>
                  {editingEntry ? "Edit Kalkulasi" : "Kalkulasi Biaya Baru"}
                </Text>
                <TouchableOpacity onPress={() => setFormVisible(false)}>
                  <Ionicons name="close" size={22} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Multiple Items Sections */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>Daftar Barang</Text>
                  <TouchableOpacity
                    onPress={addFormItem}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#F0FDFA",
                      borderColor: "#0D9488",
                      borderWidth: 1,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      gap: 4
                    }}
                  >
                    <Ionicons name="add-circle" size={14} color="#0D9488" />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#0D9488" }}>Tambah</Text>
                  </TouchableOpacity>
                </View>

                {formItems.map((item, index) => (
                  <View
                    key={item.id}
                    style={{
                      backgroundColor: "#F8FAFC",
                      borderRadius: 12,
                      padding: 10,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B" }}>Barang #{index + 1}</Text>
                      {formItems.length > 1 && (
                        <TouchableOpacity onPress={() => removeFormItem(item.id)}>
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TextInput
                      placeholder="Nama Barang"
                      value={item.name}
                      onChangeText={(val) => updateFormItem(item.id, "name", val)}
                      style={{
                        backgroundColor: "#fff",
                        borderWidth: 1,
                        borderColor: "#CBD5E1",
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        fontSize: 13,
                        color: "#0F172A",
                      }}
                      placeholderTextColor="#94A3B8"
                    />

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 2 }}>
                        <TextInput
                          placeholder="Harga Satuan (Rp)"
                          keyboardType="numeric"
                          value={item.price}
                          onChangeText={(val) => updateFormItem(item.id, "price", val)}
                          style={{
                            backgroundColor: "#fff",
                            borderWidth: 1,
                            borderColor: "#CBD5E1",
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            fontSize: 13,
                            color: "#0F172A",
                          }}
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          placeholder="Qty"
                          keyboardType="numeric"
                          value={item.qty}
                          onChangeText={(val) => updateFormItem(item.id, "qty", val)}
                          style={{
                            backgroundColor: "#fff",
                            borderWidth: 1,
                            borderColor: "#CBD5E1",
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            fontSize: 13,
                            color: "#0F172A",
                            textAlign: "center"
                          }}
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* Additional Fees Fields */}
              <View style={{ borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingTop: 14, gap: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>Biaya Tambahan</Text>

                <View>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569", marginBottom: 4 }}>Ongkos Kirim (Rp)</Text>
                  <TextInput
                    placeholder="0"
                    keyboardType="numeric"
                    value={shippingFee}
                    onChangeText={text => setShippingFee(formatNumberInput(text))}
                    style={{
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: "#0F172A",
                    }}
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <View>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569", marginBottom: 4 }}>Pajak (Rp)</Text>
                  <TextInput
                    placeholder="0"
                    keyboardType="numeric"
                    value={taxFee}
                    onChangeText={text => setTaxFee(formatNumberInput(text))}
                    style={{
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: "#0F172A",
                    }}
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <View>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569", marginBottom: 4 }}>Biaya Tambahan Lainnya (Rp)</Text>
                  <TextInput
                    placeholder="0"
                    keyboardType="numeric"
                    value={otherFee}
                    onChangeText={text => setOtherFee(formatNumberInput(text))}
                    style={{
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: "#0F172A",
                    }}
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <View>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569", marginBottom: 4 }}>Catatan Tambahan</Text>
                  <TextInput
                    placeholder="Contoh: Pengiriman via Cargo Darat"
                    value={note}
                    onChangeText={setNote}
                    style={{
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: "#0F172A",
                    }}
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Dynamic Totals Preview */}
              <View
                style={{
                  backgroundColor: "#F0FDFA",
                  borderColor: "#CCFBF1",
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 12,
                  marginTop: 18,
                  gap: 4
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: "#115E59" }}>Subtotal ({formTotalQty} Unit)</Text>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#115E59" }}>{formatCurrencyValue(formSubtotal)}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: "#99F6E4", paddingTop: 4, marginTop: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#0F766E" }}>ESTIMASI GRAND TOTAL</Text>
                  <Text style={{ fontSize: 14, fontWeight: "900", color: "#0F766E" }}>
                    {formatCurrencyValue(
                      formSubtotal +
                      (parseNumberInput(shippingFee) || 0) +
                      (parseNumberInput(taxFee) || 0) +
                      (parseNumberInput(otherFee) || 0)
                    )}
                  </Text>
                </View>
              </View>

              {/* Form buttons */}
              <TouchableOpacity
                onPress={handleSave}
                style={{
                  backgroundColor: "#0D9488",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: 16,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Simpan</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Detail / PNG Export Modal */}
      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={() => setDetailVisible(false)}>
        <Pressable
          onPress={() => setDetailVisible(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(15,23,42,0.65)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <Pressable
            style={{
              width: "100%",
              backgroundColor: "#fff",
              borderRadius: 24,
              padding: 20,
              alignItems: "center",
              shadowColor: "#0F172A",
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 8,
              maxHeight: "85%",
            }}
          >
            {/* Header */}
            <View style={{ width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Pratinjau Estimasi</Text>
              <TouchableOpacity onPress={() => setDetailVisible(false)} disabled={exporting}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Receipt Area */}
            <ScrollView style={{ width: "100%" }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {/* Receipt ViewShot */}
              <ViewShot
                ref={invoicePreviewRef}
                options={{ format: "png", quality: 1 }}
                style={{
                  width: "100%",
                  backgroundColor: "#fff",
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 16,
                  padding: 16,
                  shadowColor: "#0F172A",
                  shadowOpacity: 0.02,
                  shadowRadius: 10,
                }}
              >
                {selectedEntry && (() => {
                  const list = getItemList(selectedEntry);
                  const totalItemsQty = list.reduce((sum, it) => sum + (it.qty || 1), 0);

                  return (
                    <View>
                      {/* Title */}
                      <View style={{ alignItems: "center", marginBottom: 14 }}>
                        <Ionicons name="receipt-outline" size={32} color="#0D9488" />
                        <Text style={{ fontSize: 15, fontWeight: "800", color: "#0F172A", marginTop: 4, letterSpacing: 0.5 }}>
                          ESTIMASI BIAYA BARANG
                        </Text>
                        <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>
                          Dibuat: {formatDateDisplay(selectedEntry.created_at)}
                        </Text>
                      </View>

                      {/* Divider */}
                      <View style={{ borderStyle: "dashed", borderWidth: 0.5, borderColor: "#CBD5E1", marginBottom: 12 }} />

                      {/* Items Table */}
                      <View style={{ gap: 6, marginBottom: 12 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", paddingBottom: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#475569", flex: 1.8 }}>Nama Barang</Text>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#475569", width: 40, textAlign: "right" }}>Qty</Text>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#475569", width: 85, textAlign: "right" }}>Total</Text>
                        </View>
                        
                        {list.map((it, idx) => (
                          <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                            <Text style={{ fontSize: 12, color: "#0F172A", flex: 1.8 }} numberOfLines={2}>
                              {it.name}
                            </Text>
                            <Text style={{ fontSize: 11, color: "#64748B", width: 40, textAlign: "right" }}>
                              {it.qty}x
                            </Text>
                            <Text style={{ fontSize: 12, fontWeight: "500", color: "#0F172A", width: 85, textAlign: "right" }}>
                              {formatCurrencyValue(it.price * it.qty)}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Divider */}
                      <View style={{ borderStyle: "dashed", borderWidth: 0.5, borderColor: "#CBD5E1", marginBottom: 12 }} />

                      {/* Costs Breakdown */}
                      <View style={{ gap: 5 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 11, color: "#64748B" }}>Total Barang ({totalItemsQty} Unit)</Text>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{formatCurrencyValue(selectedEntry.base_price)}</Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 11, color: "#64748B" }}>Ongkos Kirim</Text>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{formatCurrencyValue(selectedEntry.shipping_fee)}</Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 11, color: "#64748B" }}>Pajak</Text>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{formatCurrencyValue(selectedEntry.tax_fee)}</Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 11, color: "#64748B" }}>Biaya Lainnya</Text>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569" }}>{formatCurrencyValue(selectedEntry.other_fee)}</Text>
                        </View>

                        {/* Divider */}
                        <View style={{ borderStyle: "dashed", borderWidth: 0.7, borderColor: "#94A3B8", marginVertical: 6 }} />

                        {/* Grand Total */}
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ fontSize: 12, fontWeight: "800", color: "#0F172A" }}>GRAND TOTAL</Text>
                          <Text style={{ fontSize: 16, fontWeight: "900", color: "#0D9488" }}>{formatCurrencyValue(selectedEntry.total_price)}</Text>
                        </View>
                      </View>

                      {selectedEntry.note ? (
                        <View style={{ marginTop: 12, backgroundColor: "#F8FAFC", borderRadius: 8, padding: 8 }}>
                          <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "600" }}>Catatan:</Text>
                          <Text style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{selectedEntry.note}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })()}
              </ViewShot>
            </ScrollView>

            {/* Export Action */}
            <TouchableOpacity
              onPress={handleExportPng}
              disabled={exporting}
              style={{
                width: "100%",
                backgroundColor: exporting ? "#99F6E4" : "#0D9488",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                marginTop: 14,
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {exporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="image-outline" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Ekspor PNG</Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
