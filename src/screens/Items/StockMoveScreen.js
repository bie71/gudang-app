import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import ActionButton from "../../components/ActionButton";
import { addStockMovement } from "../../repositories/itemRepository";
import { formatNumberInput, parseNumberInput } from "../../utils/format";

export default function StockMoveScreen({ route, navigation }) {
  const item = route?.params?.item;
  const [type, setType] = useState("OUT"); // "IN" | "OUT"
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!item) {
    return (
      <View style={styles.center}>
        <Text>Pilih barang terlebih dahulu.</Text>
      </View>
    );
  }

  const handleSubmit = async () => {
    const parsedQty = parseNumberInput(qty);
    if (!parsedQty || parsedQty <= 0) {
      Alert.alert("Validasi Gagal", "Jumlah mutasi harus lebih dari 0.");
      return;
    }

    if (type === "OUT" && parsedQty > Number(item.stock)) {
      Alert.alert(
        "Stok Tidak Cukup",
        `Stok saat ini hanya ${item.stock} pcs, tidak dapat mengeluarkan ${parsedQty} pcs.`
      );
      return;
    }

    const unitPrice = Number(item.price) || 0;
    const unitCost = Number(item.cost_price) || 0;
    const profitAmount = type === "OUT" ? Math.max(0, (unitPrice - unitCost) * parsedQty) : 0;

    setSaving(true);
    try {
      await addStockMovement({
        itemId: item.id,
        type,
        qty: parsedQty,
        note,
        unitPrice,
        unitCost,
        profitAmount,
      });

      Alert.alert(
        "Mutasi Berhasil",
        `Stok ${type === "IN" ? "masuk" : "keluar"} sebanyak ${parsedQty} pcs berhasil dicatat.`
      );
      navigation.goBack();
    } catch (e) {
      console.log("STOCK MOVE ERROR:", e);
      Alert.alert("Gagal", "Terjadi kesalahan saat memproses mutasi stok.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      <FormScrollContainer contentContainerStyle={styles.content}>
        {/* Item Summary Banner */}
        <View style={styles.itemBanner}>
          <Text style={styles.bannerName}>{item.name}</Text>
          <Text style={styles.bannerStock}>
            Stok Tersedia: <Text style={{ fontWeight: "800", color: "#0F172A" }}>{item.stock} pcs</Text>
          </Text>
        </View>

        {/* Type Selector Tabs */}
        <View style={styles.typeSelector}>
          <TouchableOpacity
            onPress={() => setType("OUT")}
            activeOpacity={0.7}
            style={[styles.typeBtn, type === "OUT" && styles.typeBtnOutActive]}
          >
            <Ionicons
              name="arrow-up-circle-outline"
              size={18}
              color={type === "OUT" ? "#DC2626" : "#64748B"}
            />
            <Text style={[styles.typeText, type === "OUT" && styles.typeTextOutActive]}>
              Stok Keluar (Terjual)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setType("IN")}
            activeOpacity={0.7}
            style={[styles.typeBtn, type === "IN" && styles.typeBtnInActive]}
          >
            <Ionicons
              name="arrow-down-circle-outline"
              size={18}
              color={type === "IN" ? "#16A34A" : "#64748B"}
            />
            <Text style={[styles.typeText, type === "IN" && styles.typeTextInActive]}>
              Stok Masuk (Kulakan)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form Fields */}
        <View style={styles.formCard}>
          <Input
            label="Jumlah (pcs) *"
            placeholder="0"
            keyboardType="numeric"
            value={qty}
            onChangeText={val => setQty(formatNumberInput(val))}
          />

          <Input
            label="Catatan / Keterangan"
            placeholder="Contoh: Terjual di Toko A, Retur, dsb"
            value={note}
            onChangeText={setNote}
          />
        </View>

        <ActionButton
          label={`Simpan Stok ${type === "IN" ? "Masuk" : "Keluar"}`}
          onPress={handleSubmit}
          loading={saving}
          color={type === "IN" ? "#16A34A" : "#0D9488"}
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  itemBanner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  bannerName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  bannerStock: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
  },
  typeSelector: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    gap: 6,
  },
  typeBtnOutActive: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  typeBtnInActive: {
    borderColor: "#16A34A",
    backgroundColor: "#F0FDF4",
  },
  typeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  typeTextOutActive: {
    color: "#DC2626",
  },
  typeTextInActive: {
    color: "#16A34A",
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  submitBtn: {
    marginTop: 8,
  },
});
