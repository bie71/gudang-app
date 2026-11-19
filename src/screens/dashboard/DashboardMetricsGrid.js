import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../components/ui";
import { formatCurrencyValue, formatNumberValue } from "../../utils/format";

export default function DashboardMetricsGrid({
  metrics,
  onNavigateItems,
  onNavigatePO,
  onNavigateBookkeeping,
}) {
  return (
    <View style={styles.grid}>
      {/* 1. Total Stok */}
      <Card style={styles.metricCard} onPress={onNavigateItems}>
        <View style={[styles.iconBox, { backgroundColor: "#E0F2FE" }]}>
          <Ionicons name="cube" size={22} color="#0284C7" />
        </View>
        <Text style={styles.cardLabel}>TOTAL STOK GUDANG</Text>
        <Text style={styles.cardValue}>
          {formatNumberValue(metrics.totalStock)}{" "}
          <Text style={styles.unitText}>pcs</Text>
        </Text>
        <Text style={styles.cardSub}>
          {formatNumberValue(metrics.totalItems)} macam barang
        </Text>
      </Card>

      {/* 2. Valuasi Inventaris */}
      <Card style={styles.metricCard} onPress={onNavigateItems}>
        <View style={[styles.iconBox, { backgroundColor: "#FEF3C7" }]}>
          <Ionicons name="pricetags" size={22} color="#D97706" />
        </View>
        <Text style={styles.cardLabel}>VALUASI INVENTARIS</Text>
        <Text style={styles.cardValue}>
          {formatCurrencyValue(metrics.totalValue)}
        </Text>
        <Text style={styles.cardSub}>
          {metrics.totalCategories} kategori aktif
        </Text>
      </Card>

      {/* 3. PO Berjalan & Estimasi Profit */}
      <Card style={styles.metricCard} onPress={onNavigatePO}>
        <View style={[styles.iconBox, { backgroundColor: "#F3E8FF" }]}>
          <Ionicons name="document-text" size={22} color="#9333EA" />
        </View>
        <Text style={styles.cardLabel}>PO BERJALAN & PROFIT</Text>
        <Text style={styles.cardValue}>
          {formatNumberValue(metrics.poProgress)}{" "}
          <Text style={styles.unitText}>order</Text>
        </Text>
        <Text style={styles.cardSub}>
          Est. Profit: {formatCurrencyValue(metrics.poProgressProfit || 0)}
        </Text>
      </Card>

      {/* 4. Total Kas Toko */}
      <Card style={styles.metricCard} onPress={onNavigateBookkeeping}>
        <View style={[styles.iconBox, { backgroundColor: "#DCFCE7" }]}>
          <Ionicons name="wallet" size={22} color="#16A34A" />
        </View>
        <Text style={styles.cardLabel}>SALDO KAS & BANK</Text>
        <Text style={[styles.cardValue, { color: "#16A34A" }]}>
          {formatCurrencyValue(metrics.bookkeepingTotal)}
        </Text>
        <Text style={styles.cardSub}>
          {metrics.bookkeepingCount} pos akun tercatat
        </Text>
      </Card>

      {/* 5. Banner Profit Akumulasi PO Selesai */}
      <TouchableOpacity
        onPress={onNavigatePO}
        activeOpacity={0.7}
        style={styles.profitBanner}
      >
        <View style={styles.profitBannerLeft}>
          <View style={styles.profitIconCircle}>
            <Ionicons name="trending-up" size={18} color="#15803D" />
          </View>
          <View>
            <Text style={styles.profitBannerTitle}>Akumulasi Profit PO Selesai</Text>
            <Text style={styles.profitBannerSub}>
              {formatNumberValue(metrics.poDone || 0)} PO selesai diproses
            </Text>
          </View>
        </View>
        <Text style={styles.profitBannerAmount}>
          {formatCurrencyValue(metrics.poDoneProfit || 0)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  metricCard: {
    width: "48%",
    flexGrow: 1,
    padding: 16,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 4,
    letterSpacing: -0.3,
  },
  unitText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  cardSub: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 4,
    fontWeight: "500",
  },
  profitBanner: {
    width: "100%",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  profitBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profitIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  profitBannerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
  },
  profitBannerSub: {
    fontSize: 10,
    color: "#15803D",
    marginTop: 1,
  },
  profitBannerAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: "#15803D",
  },
});
