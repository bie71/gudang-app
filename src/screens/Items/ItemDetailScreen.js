import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useItemDetail } from "../../hooks/useItemDetail";
import { Card, Badge, SectionHeader } from "../../components/ui";
import {
  formatCurrencyValue,
  formatNumberValue,
  formatDateTimeDisplay,
} from "../../utils/format";

export default function ItemDetailScreen({ route, navigation }) {
  const itemId = route?.params?.id;
  const { item, history, loading, refresh, deleteItem } = useItemDetail(itemId);

  useFocusEffect(
    useCallback(() => {
      if (refresh) refresh();
    }, [refresh])
  );

  const handleDelete = async () => {
    const success = await deleteItem();
    if (success) {
      navigation.goBack();
    }
  };

  if (loading && !item) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={styles.loadingText}>Memuat detail barang...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Barang tidak ditemukan atau telah dihapus.</Text>
      </View>
    );
  }

  const isLowStock = Number(item.stock) <= 5;
  const isOutOfStock = Number(item.stock) === 0;
  let stockBadgeVariant = "success";
  if (isOutOfStock) stockBadgeVariant = "danger";
  else if (isLowStock) stockBadgeVariant = "warning";

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Main Info Card */}
        <Card style={styles.mainCard}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <View style={styles.badgesRow}>
                {Boolean(item.category) && (
                  <Badge label={item.category} variant="primary" />
                )}
                {Boolean(item.size) && (
                  <Badge label={`Ukuran: ${item.size}`} variant="neutral" />
                )}
              </View>
            </View>

            <Badge
              label={isOutOfStock ? "Habis" : `${formatNumberValue(item.stock)} pcs`}
              variant={stockBadgeVariant}
            />
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Harga Jual</Text>
              <Text style={styles.statValue}>{formatCurrencyValue(item.price)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Harga Modal</Text>
              <Text style={styles.statValue}>
                {formatCurrencyValue(item.cost_price || 0)}
              </Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate("StockMove", { item })}
              activeOpacity={0.7}
              style={[styles.btn, styles.primaryBtn]}
            >
              <Ionicons name="swap-vertical" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Mutasi Stok</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate("AddItem", { item })}
              activeOpacity={0.7}
              style={[styles.btn, styles.outlineBtn]}
            >
              <Ionicons name="create-outline" size={18} color="#0D9488" />
              <Text style={styles.outlineBtnText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDelete}
              activeOpacity={0.7}
              style={[styles.btn, styles.dangerBtn]}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Stock Movements History */}
        <SectionHeader
          title="Riwayat Pergerakan Stok"
          subtitle={`${history.length} mutasi terakhir`}
          style={{ marginTop: 8 }}
        />

        {history.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptySubText}>Belum ada riwayat pergerakan stok.</Text>
          </Card>
        ) : (
          history.map(move => {
            const isEntry = move.type === "IN";
            return (
              <Card key={String(move.id)} style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <View
                    style={[
                      styles.moveIconCircle,
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
                      {isEntry ? "Stok Masuk" : "Stok Keluar"}
                    </Text>
                    <Text style={styles.historyDate}>
                      {formatDateTimeDisplay(move.created_at)}
                    </Text>
                    {Boolean(move.note) && (
                      <Text style={styles.historyNote}>{move.note}</Text>
                    )}
                  </View>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.historyQty,
                      { color: isEntry ? "#15803D" : "#B91C1C" },
                    ]}
                  >
                    {isEntry ? "+" : "-"}
                    {formatNumberValue(move.qty)}
                  </Text>
                  {!isEntry && Boolean(move.profit_amount > 0) && (
                    <Text style={styles.profitText}>
                      +{formatCurrencyValue(move.profit_amount)}
                    </Text>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
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
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#F8FAFC",
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
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  itemName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    flexWrap: "wrap",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  primaryBtn: {
    flex: 2,
    backgroundColor: "#0D9488",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  outlineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#0D9488",
    backgroundColor: "#FFFFFF",
  },
  outlineBtnText: {
    color: "#0D9488",
    fontSize: 14,
    fontWeight: "700",
  },
  dangerBtn: {
    width: 46,
    backgroundColor: "#FEE2E2",
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
  moveIconCircle: {
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
  historyNote: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  historyQty: {
    fontSize: 16,
    fontWeight: "800",
  },
  profitText: {
    fontSize: 11,
    color: "#15803D",
    fontWeight: "600",
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
});
