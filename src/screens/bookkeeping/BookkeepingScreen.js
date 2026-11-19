import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useBookkeeping } from "../../hooks/useBookkeeping";
import BookkeepingCard from "./components/BookkeepingCard";
import { Card, SearchBar, EmptyState } from "../../components/ui";
import { formatCurrencyValue, formatNumberValue } from "../../utils/format";
import { exportBookkeepingCsv } from "../../services/export";

export default function BookkeepingScreen({ navigation }) {
  const {
    entries,
    summary,
    searchTerm,
    setSearchTerm,
    loading,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    deleteEntry,
  } = useBookkeeping();

  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const res = await exportBookkeepingCsv();
      Alert.alert("Sukses", `Data pembukuan berhasil diekspor: ${res.fileName}`);
    } catch (e) {
      console.log("EXPORT BOOKKEEPING CSV ERROR:", e);
      Alert.alert("Gagal", "Gagal mengekspor data pembukuan ke CSV.");
    } finally {
      setExporting(false);
    }
  };

  const renderItem = ({ item }) => (
    <BookkeepingCard
      entry={item}
      onPress={() => navigation.navigate("BookkeepingDetail", { id: item.id })}
      onDelete={() => deleteEntry(item.id)}
    />
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Pembukuan & Kas</Text>
          <Text style={styles.headerSubtitle}>Catatan keuangan, dompet & kas toko</Text>
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
            onPress={() => navigation.navigate("AddBookkeeping")}
            activeOpacity={0.7}
            style={[styles.iconBtn, styles.primaryBtn]}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryContainer}>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Total Saldo Terkumpul</Text>
              <Text style={styles.summaryBalance}>
                {formatCurrencyValue(summary.totalBalance)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.summaryLabel}>Total Akun / Rek</Text>
              <Text style={styles.summaryCount}>
                {formatNumberValue(summary.totalEntries)} akun
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Cari nama pos kas atau catatan..."
        />
      </View>

      {/* Main List */}
      <FlatList
        data={entries}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
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
              icon="wallet-outline"
              title={searchTerm ? "Pos Kas Tidak Ditemukan" : "Belum Ada Pos Kas"}
              description={
                searchTerm
                  ? `Tidak ada catatan pembukuan yang cocok dengan "${searchTerm}".`
                  : "Mulai pencatatan kas toko dengan menambahkan pos kas pertama."
              }
              actionLabel="Tambah Pos Kas"
              onAction={() => navigation.navigate("AddBookkeeping")}
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
  summaryContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  summaryCard: {
    backgroundColor: "#0D9488",
    borderColor: "#0F766E",
    padding: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "600",
  },
  summaryBalance: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 4,
    letterSpacing: -0.4,
  },
  summaryCount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
