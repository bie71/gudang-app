import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Input from "../../../components/Input";
import { formatNumberInput, parseNumberInput, formatCurrencyValue } from "../../../utils/format";

export default function POItemRow({
  item,
  index,
  itemSuggestions = [],
  onChange,
  onRemove,
  canRemove = true,
}) {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.price) || 0;
  const cost = Number(item.costPrice || item.cost_price) || 0;
  const subtotal = qty * price;
  const totalCost = qty * cost;
  const profit = subtotal - totalCost;

  const filteredSuggestions = useMemo(() => {
    const q = (item.name || "").trim().toLowerCase();
    if (!q || !itemSuggestions.length) return [];
    return itemSuggestions.filter(
      s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q
    );
  }, [item.name, itemSuggestions]);

  const handleSelectSuggestion = suggestion => {
    onChange({
      ...item,
      name: suggestion.name,
      price: suggestion.default_price ? Number(suggestion.default_price) : item.price,
      costPrice: suggestion.default_cost_price ? Number(suggestion.default_cost_price) : item.costPrice,
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.itemIndex}>Item #{index + 1}</Text>
        {canRemove && (
          <TouchableOpacity
            onPress={onRemove}
            activeOpacity={0.7}
            style={styles.removeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      <Input
        label="Nama Barang *"
        placeholder="Contoh: Kardus 40x40"
        value={item.name}
        onChangeText={val => onChange({ ...item, name: val })}
      />

      {filteredSuggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.suggestionScroll}
        >
          {filteredSuggestions.map((s, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => handleSelectSuggestion(s)}
              activeOpacity={0.7}
              style={styles.suggestionChip}
            >
              <Text style={styles.suggestionText}>📦 {s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputsRow}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Input
            label="Jumlah (pcs) *"
            placeholder="1"
            keyboardType="numeric"
            value={item.quantity ? String(item.quantity) : ""}
            onChangeText={val => onChange({ ...item, quantity: parseNumberInput(val) })}
          />
        </View>

        <View style={{ flex: 1.2, marginHorizontal: 3 }}>
          <Input
            label="Harga Jual (Rp) *"
            placeholder="0"
            keyboardType="numeric"
            value={item.price ? formatNumberInput(String(item.price)) : ""}
            onChangeText={val => onChange({ ...item, price: parseNumberInput(val) })}
          />
        </View>

        <View style={{ flex: 1.2, marginLeft: 6 }}>
          <Input
            label="Modal (Rp)"
            placeholder="0"
            keyboardType="numeric"
            value={item.costPrice ? formatNumberInput(String(item.costPrice)) : ""}
            onChangeText={val => onChange({ ...item, costPrice: parseNumberInput(val) })}
          />
        </View>
      </View>

      <View style={styles.subtotalRow}>
        <View>
          <Text style={styles.subtotalLabel}>Subtotal Penjualan</Text>
          <Text style={styles.subtotalValue}>{formatCurrencyValue(subtotal)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.subtotalLabel}>Perkiraan Profit</Text>
          <Text
            style={[
              styles.profitValue,
              { color: profit >= 0 ? "#16A34A" : "#DC2626" },
            ]}
          >
            {profit >= 0 ? "+" : "-"} {formatCurrencyValue(Math.abs(profit))}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  itemIndex: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  removeBtn: {
    padding: 4,
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
  inputsRow: {
    flexDirection: "row",
  },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  subtotalLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  subtotalValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 2,
  },
  profitValue: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
});
