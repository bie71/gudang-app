import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Badge, SectionHeader } from "../../components/ui";
import { formatCurrencyValue, formatDateDisplay } from "../../utils/format";

export default function DashboardRecentOrders({
  orders = [],
  onNavigatePO,
  onOrderPress,
}) {
  if (orders.length === 0) return null;

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Purchase Orders Terbaru"
        subtitle="5 pesanan pengadaan terkini"
        actionLabel="Lihat Semua"
        onAction={onNavigatePO}
      />

      {orders.map(order => {
        const total = Number(order.computed_total) || Number(order.price) || 0;
        const isDone = order.status === "DONE";

        return (
          <Card
            key={String(order.id)}
            style={styles.card}
            onPress={() => onOrderPress && onOrderPress(order)}
          >
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={styles.headerRow}>
                  <Text style={styles.poId}>PO #{order.id}</Text>
                  <Badge
                    label={isDone ? "Selesai" : "Diproses"}
                    variant={isDone ? "success" : "warning"}
                    size="small"
                  />
                </View>
                <Text style={styles.itemNames} numberOfLines={1}>
                  {order.item_name}
                </Text>
                <Text style={styles.date}>
                  {formatDateDisplay(order.order_date)}
                </Text>
              </View>

              <Text style={styles.total}>{formatCurrencyValue(total)}</Text>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  card: {
    marginBottom: 8,
    padding: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  poId: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  itemNames: {
    fontSize: 13,
    color: "#475569",
    marginTop: 3,
    fontWeight: "500",
  },
  date: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  total: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
});
