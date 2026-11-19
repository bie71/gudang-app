import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Badge, SectionHeader } from "../../components/ui";
import { formatDateDisplay, formatNumberValue } from "../../utils/format";

export default function DashboardPriorityAlerts({
  lowStockItems = [],
  urgentPOs = [],
  onNavigateItems,
  onNavigatePO,
  onItemPress,
  onPOPress,
}) {
  if (lowStockItems.length === 0 && urgentPOs.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* 1. Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title="Perhatian Stok Menipis"
            subtitle={`${lowStockItems.length} barang butuh restock`}
            actionLabel="Lihat Semua"
            onAction={onNavigateItems}
          />

          {lowStockItems.slice(0, 3).map(item => (
            <Card
              key={String(item.id)}
              style={styles.alertCard}
              onPress={() => onItemPress && onItemPress(item)}
            >
              <View style={styles.alertLeft}>
                <View style={styles.warningIconCircle}>
                  <Ionicons name="alert-circle" size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.alertCategory}>
                    {item.category || "Tanpa Kategori"}
                  </Text>
                </View>
              </View>

              <Badge
                label={Number(item.stock) === 0 ? "Habis" : `Sisa ${formatNumberValue(item.stock)} pcs`}
                variant={Number(item.stock) === 0 ? "danger" : "warning"}
              />
            </Card>
          ))}
        </View>
      )}

      {/* 2. Urgent POs */}
      {urgentPOs.length > 0 && (
        <View style={[styles.section, { marginTop: lowStockItems.length > 0 ? 16 : 0 }]}>
          <SectionHeader
            title="PO Perlu Tindakan"
            subtitle={`${urgentPOs.length} pesanan sedang diproses`}
            actionLabel="Lihat Semua"
            onAction={onNavigatePO}
          />

          {urgentPOs.slice(0, 3).map(order => (
            <Card
              key={String(order.id)}
              style={styles.alertCard}
              onPress={() => onPOPress && onPOPress(order)}
            >
              <View style={styles.alertLeft}>
                <View style={[styles.warningIconCircle, { backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="time" size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle} numberOfLines={1}>
                    PO #{order.id} • {order.item_name}
                  </Text>
                  <Text style={styles.alertCategory}>
                    Pemasok: {order.supplier_name || "-"}
                  </Text>
                </View>
              </View>

              {Boolean(order.close_po_date) && (
                <Badge
                  label={`Close: ${formatDateDisplay(order.close_po_date)}`}
                  variant="warning"
                  size="small"
                />
              )}
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  section: {},
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    marginBottom: 8,
  },
  alertLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  warningIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  alertCategory: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
});
