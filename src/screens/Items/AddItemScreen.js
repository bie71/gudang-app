import React, { useState } from "react";
import { View, Text, Alert, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import ActionButton from "../../components/ActionButton";
import { createItem, updateItem } from "../../repositories/itemRepository";
import { formatNumberInput, parseNumberInput } from "../../utils/format";

export default function AddItemScreen({ route, navigation }) {
  const itemToEdit = route?.params?.item;
  const isEditing = Boolean(itemToEdit);

  const [name, setName] = useState(itemToEdit?.name || "");
  const [category, setCategory] = useState(itemToEdit?.category || "");
  const [size, setSize] = useState(itemToEdit?.size || "");
  const [price, setPrice] = useState(itemToEdit?.price ? formatNumberInput(String(itemToEdit.price)) : "");
  const [costPrice, setCostPrice] = useState(itemToEdit?.cost_price ? formatNumberInput(String(itemToEdit.cost_price)) : "");
  const [stock, setStock] = useState(itemToEdit?.stock != null ? formatNumberInput(String(itemToEdit.stock)) : "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Validasi Gagal", "Nama barang wajib diisi.");
      return;
    }

    const parsedPrice = parseNumberInput(price);
    const parsedCostPrice = parseNumberInput(costPrice);
    const parsedStock = parseNumberInput(stock);

    setSaving(true);
    try {
      if (isEditing) {
        await updateItem(itemToEdit.id, {
          name,
          category,
          size,
          price: parsedPrice,
          costPrice: parsedCostPrice,
          stock: parsedStock,
        });
        Alert.alert("Sukses", "Data barang berhasil diperbarui.");
      } else {
        await createItem({
          name,
          category,
          size,
          price: parsedPrice,
          costPrice: parsedCostPrice,
          stock: parsedStock,
        });
        Alert.alert("Sukses", "Barang baru berhasil ditambahkan.");
      }
      navigation.goBack();
    } catch (e) {
      console.log("SAVE ITEM ERROR:", e);
      Alert.alert("Gagal", "Terjadi kesalahan saat menyimpan barang.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      <FormScrollContainer contentContainerStyle={styles.content}>
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Informasi Barang</Text>
          
          <Input
            label="Nama Barang *"
            placeholder="Contoh: Kemeja Flanel Kotak"
            value={name}
            onChangeText={setName}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Input
                label="Kategori"
                placeholder="Pakaian, dsb"
                value={category}
                onChangeText={setCategory}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Input
                label="Ukuran / Varian"
                placeholder="M, L, XL, All Size"
                value={size}
                onChangeText={setSize}
              />
            </View>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Harga & Inventaris</Text>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Input
                label="Harga Jual (Rp) *"
                placeholder="0"
                keyboardType="numeric"
                value={price}
                onChangeText={val => setPrice(formatNumberInput(val))}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Input
                label="Harga Modal (Rp)"
                placeholder="0"
                keyboardType="numeric"
                value={costPrice}
                onChangeText={val => setCostPrice(formatNumberInput(val))}
              />
            </View>
          </View>

          <Input
            label="Jumlah Stok Awal"
            placeholder="0"
            keyboardType="numeric"
            value={stock}
            onChangeText={val => setStock(formatNumberInput(val))}
          />
        </View>

        <ActionButton
          label={isEditing ? "Perbarui Barang" : "Simpan Barang"}
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
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
  },
  submitBtn: {
    marginTop: 8,
  },
});
