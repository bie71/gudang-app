import React, { useState } from "react";
import { View, Text, Alert, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import DatePickerField from "../../components/DatePickerField";
import ActionButton from "../../components/ActionButton";
import { createBookkeepingEntry } from "../../repositories/bookkeepingRepository";
import { formatDateInputValue, formatNumberInput, parseNumberInput } from "../../utils/format";

export default function AddBookkeepingScreen({ navigation }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(formatDateInputValue(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Validasi Gagal", "Nama pos kas atau rekening wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      await createBookkeepingEntry({
        name,
        amount: parseNumberInput(amount),
        entryDate,
        note,
      });

      Alert.alert("Sukses", "Pos kas berhasil ditambahkan.");
      navigation.goBack();
    } catch (e) {
      console.log("CREATE BOOKKEEPING ERROR:", e);
      Alert.alert("Gagal", "Terjadi kesalahan saat menyimpan pos kas.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      <FormScrollContainer contentContainerStyle={styles.content}>
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Informasi Pos Kas / Rekening</Text>

          <Input
            label="Nama Pos Kas / Rekening *"
            placeholder="Contoh: Kas Toko, Rekening BCA, Dompet Tunai"
            value={name}
            onChangeText={setName}
          />

          <Input
            label="Saldo Awal (Rp)"
            placeholder="0"
            keyboardType="numeric"
            value={amount}
            onChangeText={val => setAmount(formatNumberInput(val))}
          />

          <DatePickerField
            label="Tanggal Pencatatan *"
            value={entryDate}
            onChange={setEntryDate}
          />

          <Input
            label="Catatan / Keterangan"
            placeholder="Keterangan pos kas (opsional)"
            value={note}
            onChangeText={setNote}
          />
        </View>

        <ActionButton
          label="Simpan Pos Kas"
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
  submitBtn: {
    marginTop: 8,
  },
});
