import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Badge } from "../../../components/ui";
import { formatCurrencyValue, formatNumberValue } from "../../../utils/format";

export default function ItemCard({
  item,
  onPress,
  onStockMove,
  onDelete,
}) {
  const isLowStock = Number(item.stock) <= 5;
  const isOutOfStock = Number(item.stock) === 0;

  let stockBadgeVariant = "success";
  if (isOutOfStock) stockBadgeVariant = "danger";
  else if (isLowStock) stockBadgeVariant = "warning";

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.tagsRow}>
            {Boolean(item.category) && (
              <Badge label={item.category} variant="primary" size="small" />
            )}
            {Boolean(item.size) && (
              <Badge label={`Ukuran: ${item.size}`} variant="neutral" size="small" />
            )}
          </View>
        </View>

        <Badge
          label={isOutOfStock ? "Habis" : `${formatNumberValue(item.stock)} pcs`}
          variant={stockBadgeVariant}
        />
      </View>

      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.priceLabel}>Harga Jual</Text>
          <Text style={styles.priceValue}>
            {formatCurrencyValue(item.price)}
          </Text>
          {Boolean(item.cost_price > 0) && (
            <Text style={styles.costPriceValue}>
              Modal: {formatCurrencyValue(item.cost_price)}
            </Text>
          )}
        </View>

        <View style={styles.actionsRow}>
          {Boolean(onStockMove) && (
            <TouchableOpacity
              onPress={() => onStockMove(item)}
              activeOpacity={0.7}
              style={styles.moveBtn}
            >
              <Ionicons name="swap-vertical" size={16} color="#0D9488" />
              <Text style={styles.moveBtnText}>Mutasi</Text>
            </TouchableOpacity>
          )}

          {Boolean(onDelete) && (
            <TouchableOpacity
              onPress={() => onDelete(item)}
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
    marginBottom: 12,
    padding: 16,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  tagsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  priceLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  costPriceValue: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  moveBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(13, 148, 136, 0.1)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  moveBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D9488",
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
});
