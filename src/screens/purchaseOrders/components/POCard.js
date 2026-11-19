import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Badge } from "../../../components/ui";
import {
  formatCurrencyValue,
  formatDateDisplay,
  formatNumberValue,
} from "../../../utils/format";

export default function POCard({
  order,
  onPress,
  onStatusChange,
  onCancel,
  onDelete,
}) {
  const statusVariant =
    order.status === "DONE"
      ? "success"
      : order.status === "CANCELLED"
      ? "danger"
      : "warning";

  const statusLabel =
    order.status === "DONE"
      ? "Selesai"
      : order.status === "CANCELLED"
      ? "Dibatalkan"
      : "Diproses";

  const totalAmount = Number(order.computed_total) || Number(order.price) || 0;
  const totalQty = Number(order.computed_quantity) || Number(order.quantity) || 0;

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.idRow}>
            <Text style={styles.poId}>PO #{order.id}</Text>
            <Badge label={statusLabel} variant={statusVariant} size="small" />
          </View>
          <Text style={styles.dateText}>
            Tgl Order: {formatDateDisplay(order.order_date)}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.totalAmount}>{formatCurrencyValue(totalAmount)}</Text>
          <Text style={styles.qtyText}>{formatNumberValue(totalQty)} pcs</Text>
        </View>
      </View>

      {/* Info Rows */}
      <View style={styles.detailsContainer}>
        {Boolean(order.orderer_name) && (
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={14} color="#64748B" />
            <Text style={styles.infoText}>
              Pemesan: <Text style={styles.infoBold}>{order.orderer_name}</Text>
            </Text>
          </View>
        )}

        {Boolean(order.supplier_name) && (
          <View style={styles.infoRow}>
            <Ionicons name="business-outline" size={14} color="#64748B" />
            <Text style={styles.infoText}>
              Pemasok: <Text style={styles.infoBold}>{order.supplier_name}</Text>
            </Text>
          </View>
        )}

        {Boolean(order.marketer_name) && (
          <View style={styles.infoRow}>
            <Ionicons name="megaphone-outline" size={14} color="#D97706" />
            <Text style={styles.infoText}>
              Marketer: <Text style={[styles.infoBold, { color: "#D97706" }]}>{order.marketer_name}</Text>
              {Boolean(order.marketer_fee) && (
                <Text style={{ color: "#92400E", fontSize: 11 }}> ({formatCurrencyValue(order.marketer_fee)})</Text>
              )}
            </Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Ionicons name="cube-outline" size={14} color="#64748B" />
          <Text style={styles.infoText} numberOfLines={1}>
            Barang: <Text style={styles.infoBold}>{order.item_names || order.item_name}</Text>
          </Text>
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomRow}>
        <View style={{ flex: 1 }}>
          {Boolean(order.close_po_date) && (
            <Text style={styles.deadlineText}>
              Close PO: {formatDateDisplay(order.close_po_date)}
            </Text>
          )}
        </View>

        <View style={styles.actionButtons}>
          {order.status === "PROGRESS" && Boolean(onCancel) && (
            <TouchableOpacity
              onPress={() => onCancel(order.id)}
              activeOpacity={0.7}
              style={styles.cancelBtn}
            >
              <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
          )}

          {order.status === "PROGRESS" && Boolean(onStatusChange) && (
            <TouchableOpacity
              onPress={() => onStatusChange(order.id, "DONE")}
              activeOpacity={0.7}
              style={styles.doneBtn}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#15803D" />
              <Text style={styles.doneBtnText}>Selesai</Text>
            </TouchableOpacity>
          )}

          {Boolean(onDelete) && (
            <TouchableOpacity
              onPress={() => onDelete(order.id)}
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
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  poId: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  dateText: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  qtyText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "600",
  },
  detailsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    gap: 6,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: "#64748B",
    flex: 1,
  },
  infoBold: {
    fontWeight: "700",
    color: "#334155",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  deadlineText: {
    fontSize: 11,
    color: "#F59E0B",
    fontWeight: "700",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC2626",
  },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#15803D",
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
});
