import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  StyleSheet,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useBookkeepingDetail } from "../../hooks/useBookkeepingDetail";
import { Card, SectionHeader } from "../../components/ui";
import Input from "../../components/Input";
import ActionButton from "../../components/ActionButton";
import {
  formatCurrencyValue,
  formatDateDisplay,
  formatDateTimeDisplay,
  formatNumberInput,
  parseNumberInput,
} from "../../utils/format";

export default function BookkeepingDetailScreen({ route, navigation }) {
  const entryId = route?.params?.id;
  const { entry, loading, adjustAmount, deleteEntry } = useBookkeepingDetail(entryId);

  const [modalVisible, setModalVisible] = useState(false);
  const [adjustType, setAdjustType] = useState("IN"); // "IN" | "OUT"
  const [changeAmount, setChangeAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  if (loading && !entry) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={styles.loadingText}>Memuat detail pembukuan...</Text>
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Pos kas tidak ditemukan atau telah dihapus.</Text>
      </View>
    );
  }

  const handleDelete = async () => {
    const success = await deleteEntry();
    if (success) {
      navigation.goBack();
    }
  };

  const handleOpenAdjust = type => {
    setAdjustType(type);
    setChangeAmount("");
    setAdjustNote("");
    setModalVisible(true);
  };

  const handleSaveAdjust = async () => {
    const parsed = parseNumberInput(changeAmount);
    if (!parsed || parsed <= 0) {
      Alert.alert("Validasi Gagal", "Nominal perubahan harus lebih dari 0.");
      return;
    }

    setAdjusting(true);
    const ok = await adjustAmount({
      type: adjustType,
      changeAmount: parsed,
      note: adjustNote,
    });
    setAdjusting(false);
    if (ok) {
      setModalVisible(false);
      Alert.alert("Sukses", `Saldo berhasil ${adjustType === "IN" ? "ditambahkan" : "dikurangkan"}.`);
    }
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Main Balance Card */}
        <Card style={styles.mainCard}>
          <Text style={styles.entryName}>{entry.name}</Text>
          <Text style={styles.entryDate}>
            Dibuat: {formatDateDisplay(entry.entry_date)}
          </Text>

          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>Saldo Saat Ini</Text>
            <Text style={styles.balanceValue}>
              {formatCurrencyValue(entry.amount)}
            </Text>
            {Boolean(entry.note) && (
              <Text style={styles.entryNote}>{entry.note}</Text>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => handleOpenAdjust("IN")}
              activeOpacity={0.7}
              style={[styles.btn, styles.inBtn]}
            >
              <Ionicons name="add-circle-outline" size={18} color="#15803D" />
              <Text style={styles.inBtnText}>Tambah Saldo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleOpenAdjust("OUT")}
              activeOpacity={0.7}
              style={[styles.btn, styles.outBtn]}
            >
              <Ionicons name="remove-circle-outline" size={18} color="#B91C1C" />
              <Text style={styles.outBtnText}>Tarik Saldo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDelete}
              activeOpacity={0.7}
              style={[styles.btn, styles.deleteBtn]}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Change History */}
        <SectionHeader
          title="Riwayat Mutasi Saldo"
          subtitle={`${entry.history?.length || 0} mutasi tercatat`}
          style={{ marginTop: 8 }}
        />

        {!entry.history || entry.history.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptySubText}>Belum ada riwayat mutasi pada pos kas ini.</Text>
          </Card>
        ) : (
          entry.history.map(item => {
            const isEntry = item.type === "IN";
            return (
              <Card key={String(item.id)} style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: isEntry ? "#DCFCE7" : "#FEE2E2" },
                    ]}
                  >
                    <Ionicons
                      name={isEntry ? "arrow-down" : "arrow-up"}
                      size={16}
                      color={isEntry ? "#15803D" : "#B91C1C"}
                    />
                  </View>

                  <View>
                    <Text style={styles.historyType}>
                      {isEntry ? "Pemasukan / Setor" : "Pengeluaran / Tarik"}
                    </Text>
                    <Text style={styles.historyDate}>
                      {formatDateTimeDisplay(item.created_at)}
                    </Text>
                    {Boolean(item.note) && (
                      <Text style={styles.historyNoteText}>{item.note}</Text>
                    )}
                  </View>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.historyAmount,
                      { color: isEntry ? "#15803D" : "#B91C1C" },
                    ]}
                  >
                    {isEntry ? "+" : "-"}
                    {formatCurrencyValue(item.change_amount)}
                  </Text>
                  <Text style={styles.afterBalanceText}>
                    Saldo: {formatCurrencyValue(item.new_amount)}
                  </Text>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Adjust Amount Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.dialog} onPress={e => e.stopPropagation()}>
            <Text style={styles.dialogTitle}>
              {adjustType === "IN" ? "Tambah Saldo Kas" : "Tarik / Kurang Saldo Kas"}
            </Text>

            <Input
              label="Nominal (Rp) *"
              placeholder="0"
              keyboardType="numeric"
              value={changeAmount}
              onChangeText={val => setChangeAmount(formatNumberInput(val))}
            />

            <Input
              label="Catatan Mutasi"
              placeholder="Contoh: Setoran harian, Biaya operasional"
              value={adjustNote}
              onChangeText={setAdjustNote}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <ActionButton
                label="Simpan"
                onPress={handleSaveAdjust}
                loading={adjusting}
                color={adjustType === "IN" ? "#16A34A" : "#DC2626"}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    backgroundColor: "#F8FAFC",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
  },
  emptyText: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
  },
  mainCard: {
    marginBottom: 20,
    padding: 20,
  },
  entryName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  entryDate: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
  },
  balanceContainer: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  balanceLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0D9488",
    marginTop: 4,
    letterSpacing: -0.4,
  },
  entryNote: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  inBtn: {
    flex: 2,
    backgroundColor: "#DCFCE7",
  },
  inBtnText: {
    color: "#15803D",
    fontSize: 13,
    fontWeight: "700",
  },
  outBtn: {
    flex: 2,
    backgroundColor: "#FEE2E2",
  },
  outBtnText: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "700",
  },
  deleteBtn: {
    width: 44,
    backgroundColor: "#F1F5F9",
  },
  historyCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    padding: 14,
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  historyType: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  historyDate: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  historyNoteText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: "800",
  },
  afterBalanceText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  emptyCard: {
    padding: 24,
    alignItems: "center",
  },
  emptySubText: {
    color: "#94A3B8",
    fontSize: 13,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 16,
    textAlign: "center",
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
  },
});
