import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDateDisplay } from "../utils/format";

const MONTHS = [
  { label: "Januari", short: "Jan", value: "01" },
  { label: "Februari", short: "Feb", value: "02" },
  { label: "Maret", short: "Mar", value: "03" },
  { label: "April", short: "Apr", value: "04" },
  { label: "Mei", short: "Mei", value: "05" },
  { label: "Juni", short: "Jun", value: "06" },
  { label: "Juli", short: "Jul", value: "07" },
  { label: "Agustus", short: "Ags", value: "08" },
  { label: "September", short: "Sep", value: "09" },
  { label: "Oktober", short: "Okt", value: "10" },
  { label: "November", short: "Nov", value: "11" },
  { label: "Desember", short: "Des", value: "12" },
];

export default function MonthYearPickerField({ label, value, onChange }) {
  const [modalVisible, setModalVisible] = useState(false);
  const currentYear = new Date().getFullYear();

  // Extract selected year and month from value (format: YYYY-MM)
  const initialYear = value && /^\d{4}-\d{2}$/.test(value) ? parseInt(value.split("-")[0], 10) : currentYear;
  const initialMonth = value && /^\d{4}-\d{2}$/.test(value) ? value.split("-")[1] : "";

  const [selectedYear, setSelectedYear] = useState(initialYear);

  const handleSelectMonth = monthValue => {
    const nextValue = `${selectedYear}-${monthValue}`;
    onChange(nextValue);
    setModalVisible(false);
  };

  const handleClear = () => {
    onChange("");
    setModalVisible(false);
  };

  const openPicker = () => {
    if (value && /^\d{4}-\d{2}$/.test(value)) {
      setSelectedYear(parseInt(value.split("-")[0], 10));
    } else {
      setSelectedYear(currentYear);
    }
    setModalVisible(true);
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ marginBottom: 8, color: "#475569", fontWeight: "600", fontSize: 13, letterSpacing: 0.1 }}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={openPicker}
        activeOpacity={0.7}
        style={{
          backgroundColor: "#fff",
          borderWidth: 1.5,
          borderColor: "#E2E8F0",
          borderRadius: 16,
          paddingHorizontal: 16,
          height: 52,
          justifyContent: "space-between",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Text style={{ color: value ? "#0F172A" : "#94A3B8", fontSize: 15 }}>
          {value ? formatDateDisplay(value) : "Pilih bulan & tahun"}
        </Text>
        <Ionicons name="calendar-outline" size={20} color="#64748B" />
      </TouchableOpacity>

      <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pilih Bulan & Tahun Ready</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Year Selector */}
            <View style={styles.yearRow}>
              <TouchableOpacity
                onPress={() => setSelectedYear(prev => prev - 1)}
                style={styles.yearBtn}
              >
                <Ionicons name="chevron-back" size={20} color="#2563EB" />
              </TouchableOpacity>
              <Text style={styles.yearText}>{selectedYear}</Text>
              <TouchableOpacity
                onPress={() => setSelectedYear(prev => prev + 1)}
                style={styles.yearBtn}
              >
                <Ionicons name="chevron-forward" size={20} color="#2563EB" />
              </TouchableOpacity>
            </View>

            {/* Month Grid */}
            <View style={styles.monthGrid}>
              {MONTHS.map(m => {
                const isSelected = value === `${selectedYear}-${m.value}`;
                return (
                  <TouchableOpacity
                    key={m.value}
                    onPress={() => handleSelectMonth(m.value)}
                    style={[styles.monthItem, isSelected && styles.monthItemSelected]}
                  >
                    <Text style={[styles.monthText, isSelected && styles.monthTextSelected]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Kosongkan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Batal</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  yearRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  yearBtn: {
    padding: 6,
    borderRadius: 8,
  },
  yearText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 16,
  },
  monthItem: {
    width: "31%",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  monthItemSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  monthText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  monthTextSelected: {
    color: "#fff",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearBtnText: {
    color: "#EF4444",
    fontWeight: "600",
    fontSize: 14,
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeBtnText: {
    color: "#64748B",
    fontWeight: "600",
    fontSize: 14,
  },
});
