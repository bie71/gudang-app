import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../../components/ui";
import { formatCurrencyValue, formatDateDisplay } from "../../../utils/format";

export default function BookkeepingCard({
  entry,
  onPress,
  onDelete,
}) {
  const isPositive = Number(entry.amount) >= 0;

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.contentRow}>
        <View style={styles.iconCircle}>
          <Ionicons
            name="wallet-outline"
            size={20}
            color="#0D9488"
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={styles.date}>
            {formatDateDisplay(entry.entry_date)}
          </Text>
          {Boolean(entry.note) && (
            <Text style={styles.note} numberOfLines={1}>
              {entry.note}
            </Text>
          )}
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={[
              styles.amount,
              { color: isPositive ? "#0D9488" : "#EF4444" },
            ]}
          >
            {formatCurrencyValue(entry.amount)}
          </Text>

          {Boolean(onDelete) && (
            <TouchableOpacity
              onPress={() => onDelete(entry.id)}
              activeOpacity={0.7}
              style={styles.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    padding: 14,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(13, 148, 136, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  date: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  note: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: "800",
  },
  deleteBtn: {
    marginTop: 6,
    padding: 4,
  },
});
