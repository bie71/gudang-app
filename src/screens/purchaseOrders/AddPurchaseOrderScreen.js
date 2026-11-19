import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import DatePickerField from "../../components/DatePickerField";
import ActionButton from "../../components/ActionButton";
import POItemRow from "./components/POItemRow";
import {
  createPurchaseOrder,
  getDistinctSuppliers,
} from "../../repositories/purchaseOrderRepository";
import {
  ensureMasterOrdererExists,
  ensureMasterPoItemExists,
  ensureMasterMarketerExists,
  getMasterSuggestions,
} from "../../repositories/masterDataRepository";
import {
  formatDateInputValue,
  formatCurrencyValue,
  formatNumberInput,
  parseNumberInput,
} from "../../utils/format";

export default function AddPurchaseOrderScreen({ navigation }) {
  const [ordererName, setOrdererName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [marketerName, setMarketerName] = useState("");
  const [marketerFee, setMarketerFee] = useState("");
  const [orderDate, setOrderDate] = useState(formatDateInputValue(new Date()));
  const [closePoDate, setClosePoDate] = useState("");
  const [estimatedReadyDate, setEstimatedReadyDate] = useState("");
  const [note, setNote] = useState("");

  const [items, setItems] = useState([
    { name: "", quantity: 1, price: 0, costPrice: 0 },
  ]);

  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState({ orderers: [], items: [], marketers: [] });
  const [supplierList, setSupplierList] = useState([]);

  useEffect(() => {
    getMasterSuggestions().then(setSuggestions);
    getDistinctSuppliers().then(setSupplierList);
  }, []);

  const filteredOrdererSuggestions = useMemo(() => {
    const q = (ordererName || "").trim().toLowerCase();
    if (!q || !suggestions.orderers?.length) return [];
    return suggestions.orderers.filter(
      name => name.toLowerCase().includes(q) && name.toLowerCase() !== q
    );
  }, [ordererName, suggestions.orderers]);

  const filteredSupplierSuggestions = useMemo(() => {
    const q = (supplierName || "").trim().toLowerCase();
    if (!q || !supplierList?.length) return [];
    return supplierList.filter(
      name => name.toLowerCase().includes(q) && name.toLowerCase() !== q
    );
  }, [supplierName, supplierList]);

  const filteredMarketerSuggestions = useMemo(() => {
    const q = (marketerName || "").trim().toLowerCase();
    if (!q || !suggestions.marketers?.length) return [];
    return suggestions.marketers.filter(
      item => item.name.toLowerCase().includes(q) && item.name.toLowerCase() !== q
    );
  }, [marketerName, suggestions.marketers]);

  const handleAddItem = () => {
    setItems(prev => [...prev, { name: "", quantity: 1, price: 0, costPrice: 0 }]);
  };

  const handleUpdateItem = (index, updatedItem) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = updatedItem;
      return next;
    });
  };

  const handleRemoveItem = index => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const totalPrice = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0),
    0
  );
  const totalCost = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.costPrice || it.cost_price) || 0),
    0
  );
  const feeNumber = parseNumberInput(marketerFee);
  const estimatedProfit = totalPrice - totalCost - feeNumber;

  const handleSubmit = async () => {
    const validItems = items.filter(it => it.name.trim().length > 0);
    if (validItems.length === 0) {
      Alert.alert("Validasi Gagal", "Harap isi minimal 1 item barang pesanan.");
      return;
    }

    setSaving(true);
    try {
      const parsedFee = parseNumberInput(marketerFee);

      await createPurchaseOrder({
        supplierName,
        ordererName,
        marketerName,
        marketerFee: parsedFee,
        orderDate,
        closePoDate: closePoDate || null,
        estimatedReadyDate: estimatedReadyDate || null,
        note,
        items: validItems,
      });

      // Simpan ke master data secara background jika belum ada
      if (ordererName) ensureMasterOrdererExists(ordererName);
      if (marketerName) ensureMasterMarketerExists(marketerName, parsedFee);
      for (const item of validItems) {
        ensureMasterPoItemExists(item.name, item.price, item.costPrice);
      }

      Alert.alert("Sukses", "Purchase Order baru berhasil dibuat.");
      navigation.goBack();
    } catch (e) {
      console.log("CREATE PO ERROR:", e);
      Alert.alert("Gagal", "Terjadi kesalahan saat menyimpan Purchase Order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      <FormScrollContainer contentContainerStyle={styles.content}>
        {/* Order Info */}
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Data Pemesan & Pemasok</Text>

          <Input
            label="Nama Pemesan / Pembeli"
            placeholder="Contoh: Toko Berkah"
            value={ordererName}
            onChangeText={setOrdererName}
          />

          {filteredOrdererSuggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.suggestionScroll}
            >
              {filteredOrdererSuggestions.map((name, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setOrdererName(name)}
                  activeOpacity={0.7}
                  style={styles.suggestionChip}
                >
                  <Text style={styles.suggestionText}>👤 {name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Input
            label="Nama Supplier / Pemasok"
            placeholder="Contoh: Konveksi Bandung"
            value={supplierName}
            onChangeText={setSupplierName}
          />

          {filteredSupplierSuggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.suggestionScroll}
            >
              {filteredSupplierSuggestions.map((name, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setSupplierName(name)}
                  activeOpacity={0.7}
                  style={[styles.suggestionChip, styles.supplierChip]}
                >
                  <Text style={[styles.suggestionText, styles.supplierText]}>🏭 {name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.row}>
            <View style={{ flex: 1.5, marginRight: 8 }}>
              <Input
                label="Marketer / Reseller"
                placeholder="Nama perantara"
                value={marketerName}
                onChangeText={setMarketerName}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Input
                label="Komisi (Rp)"
                placeholder="0"
                keyboardType="numeric"
                value={marketerFee}
                onChangeText={val => setMarketerFee(formatNumberInput(val))}
              />
            </View>
          </View>

          {filteredMarketerSuggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.suggestionScroll}
            >
              {filteredMarketerSuggestions.map((m, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    setMarketerName(m.name);
                    if (m.default_fee) {
                      setMarketerFee(formatNumberInput(String(m.default_fee)));
                    }
                  }}
                  activeOpacity={0.7}
                  style={[styles.suggestionChip, styles.marketerChip]}
                >
                  <Text style={[styles.suggestionText, styles.marketerText]}>
                    📢 {m.name} {m.default_fee ? `(${formatCurrencyValue(m.default_fee)})` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Dates */}
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Jadwal PO</Text>

          <DatePickerField
            label="Tanggal Order *"
            value={orderDate}
            onChange={setOrderDate}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <DatePickerField
                label="Tanggal Close PO"
                value={closePoDate}
                onChange={setClosePoDate}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <DatePickerField
                label="Estimasi Ready"
                value={estimatedReadyDate}
                onChange={setEstimatedReadyDate}
              />
            </View>
          </View>

          <Input
            label="Catatan Tambahan"
            placeholder="Keterangan DP, pengiriman, dsb"
            value={note}
            onChangeText={setNote}
          />
        </View>

        {/* PO Items */}
        <View style={styles.formCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Daftar Item Pesanan</Text>
            <TouchableOpacity
              onPress={handleAddItem}
              activeOpacity={0.7}
              style={styles.addItemBtn}
            >
              <Ionicons name="add" size={16} color="#0D9488" />
              <Text style={styles.addItemText}>Tambah Item</Text>
            </TouchableOpacity>
          </View>

          {items.map((item, index) => (
            <POItemRow
              key={index}
              item={item}
              index={index}
              itemSuggestions={suggestions.items}
              canRemove={items.length > 1}
              onChange={updated => handleUpdateItem(index, updated)}
              onRemove={() => handleRemoveItem(index)}
            />
          ))}

          {/* Total Summary */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Item</Text>
              <Text style={styles.summaryValue}>{totalQty} pcs</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Nilai PO</Text>
              <Text style={styles.totalPriceValue}>
                {formatCurrencyValue(totalPrice)}
              </Text>
            </View>
            <View style={[styles.summaryRow, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#E2E8F0" }]}>
              <Text style={styles.summaryLabel}>Estimasi Profit Bersih</Text>
              <Text
                style={[
                  styles.totalPriceValue,
                  { color: estimatedProfit >= 0 ? "#16A34A" : "#DC2626" },
                ]}
              >
                {estimatedProfit >= 0 ? "+" : "-"} {formatCurrencyValue(Math.abs(estimatedProfit))}
              </Text>
            </View>
          </View>
        </View>

        <ActionButton
          label="Simpan Purchase Order"
          onPress={handleSubmit}
          loading={saving}
          color="#0D9488"
          style={styles.submitBtn}
        />
      </FormScrollContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  suggestionScroll: {
    flexDirection: "row",
    marginTop: -4,
    marginBottom: 12,
  },
  suggestionChip: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  suggestionText: {
    color: "#4F46E5",
    fontSize: 12,
    fontWeight: "600",
  },
  supplierChip: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  supplierText: {
    color: "#16A34A",
  },
  marketerChip: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  marketerText: {
    color: "#D97706",
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(13, 148, 136, 0.1)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  addItemText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D9488",
  },
  row: {
    flexDirection: "row",
  },
  summaryBox: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  totalPriceValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0D9488",
  },
  submitBtn: {
    marginTop: 8,
  },
});
