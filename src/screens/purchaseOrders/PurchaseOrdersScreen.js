import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { usePurchaseOrders } from "../../hooks/usePurchaseOrders";
import POCard from "./components/POCard";
import { SearchBar, FilterChip, EmptyState } from "../../components/ui";
import { exportPurchaseOrdersCsv } from "../../services/export";
import { formatCurrencyValue, formatNumberValue } from "../../utils/format";

const STATUS_FILTERS = [
  { key: "ALL", label: "Semua" },
  { key: "PROGRESS", label: "Diproses" },
  { key: "DONE", label: "Selesai" },
  { key: "CANCELLED", label: "Dibatalkan" },
];

export default function PurchaseOrdersScreen({ navigation }) {
  const {
    orders,
    statusFilter,
    setStatusFilter,
    searchTerm,
    setSearchTerm,
    loading,
    refreshing,
    loadingMore,
    metrics,
    refresh,
    loadMore,
    changeStatus,
    cancelOrder,
    deleteOrder,
  } = usePurchaseOrders();

  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const res = await exportPurchaseOrdersCsv();
      Alert.alert("Sukses", `Data PO berhasil diekspor: ${res.fileName}`);
    } catch (e) {
      console.log("EXPORT PO CSV ERROR:", e);
      Alert.alert("Gagal", "Gagal mengekspor data PO ke CSV.");
    } finally {
      setExporting(false);
    }
  };

  const renderItem = ({ item }) => (
    <POCard
      order={item}
      onPress={() => navigation.navigate("PurchaseOrderDetail", { id: item.id })}
      onStatusChange={changeStatus}
      onCancel={cancelOrder}
      onDelete={() => deleteOrder(item.id)}
    />
  );

  const renderHeader = () => (
    <View style={styles.summaryContainer}>
      <View style={styles.summaryTopRow}>
        <View style={styles.summaryBox}>
          <View style={styles.summaryLabelRow}>
            <Ionicons name="wallet-outline" size={14} color="#10B981" />
            <Text style={styles.summaryLabel}>Profit Bersih (Selesai)</Text>
          </View>
          <Text style={[styles.summaryValue, { color: "#10B981" }]}>
            {formatCurrencyValue(metrics?.doneProfit || 0)}
          </Text>
          <Text style={styles.summaryNote}>*setelah potongan marketer</Text>
        </View>

        <View style={[styles.summaryBox, styles.summaryBoxRight]}>
          <View style={styles.summaryLabelRow}>
            <Ionicons name="trending-up-outline" size={14} color="#0EA5E9" />
            <Text style={styles.summaryLabel}>Estimasi Profit (Progress)</Text>
          </View>
          <Text style={[styles.summaryValue, { color: "#0EA5E9" }]}>
            {formatCurrencyValue(metrics?.progressProfit || 0)}
          </Text>
          <Text style={styles.summaryNote}>*potensi dari PO berjalan</Text>
        </View>
      </View>

      <View style={styles.summaryBottomRow}>
        <View style={styles.statPill}>
          <Text style={styles.statPillLabel}>Total Belanja PO</Text>
          <Text style={styles.statPillValue}>
            {formatCurrencyValue(metrics?.totalValue || 0)}
          </Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statPillLabel}>Total Pesanan</Text>
          <Text style={styles.statPillValue}>
            {formatNumberValue(metrics?.totalCount || 0)} PO
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Purchase Orders</Text>
          <Text style={styles.headerSubtitle}>Pantau pesanan & pengadaan barang</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleExportCsv}
            activeOpacity={0.7}
            disabled={exporting}
            style={styles.iconBtn}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={20} color="#fff" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("AddPurchaseOrder")}
            activeOpacity={0.7}
            style={[styles.iconBtn, styles.primaryBtn]}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter and Search Container */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Cari ID, pemesan, pemasok, atau item..."
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {STATUS_FILTERS.map(tab => (
            <FilterChip
              key={tab.key}
              label={tab.label}
              selected={statusFilter === tab.key}
              onPress={() => setStatusFilter(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={orders}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={refresh}
        onEndReached={loadMore}
        onEndReachedThreshold={0.2}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="document-text-outline"
              title={searchTerm ? "PO Tidak Ditemukan" : "Belum Ada PO"}
              description={
                searchTerm
                  ? `Tidak ada order yang cocok dengan "${searchTerm}".`
                  : "Mulai pencatatan pengadaan dengan membuat pesanan baru."
              }
              actionLabel="Tambah PO"
              onAction={() => navigation.navigate("AddPurchaseOrder")}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#0D9488" />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    backgroundColor: "#0D9488",
  },
  searchContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  summaryContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryBox: {
    flex: 1,
  },
  summaryBoxRight: {
    borderLeftWidth: 1,
    borderLeftColor: "#F1F5F9",
    paddingLeft: 12,
  },
  summaryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
  },
  summaryNote: {
    fontSize: 9,
    color: "#94A3B8",
    fontStyle: "italic",
    marginTop: 2,
  },
  summaryBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statPillLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  statPillValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  filterScroll: {
    paddingVertical: 10,
    gap: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
