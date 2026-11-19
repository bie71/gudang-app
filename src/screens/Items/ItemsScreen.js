import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  StyleSheet,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useItems } from "../../hooks/useItems";
import ItemCard from "./components/ItemCard";
import { SearchBar, EmptyState } from "../../components/ui";
import { exportItemsCsv } from "../../services/export";

export default function ItemsScreen({ navigation }) {
  const {
    items,
    searchTerm,
    setSearchTerm,
    loading,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    deleteItem,
  } = useItems();

  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const res = await exportItemsCsv();
      Alert.alert("Sukses", `Data barang berhasil diekspor: ${res.fileName}`);
    } catch (e) {
      console.log("EXPORT CSV ERROR:", e);
      Alert.alert("Gagal", "Gagal mengekspor data barang ke CSV.");
    } finally {
      setExporting(false);
    }
  };

  const renderItem = ({ item }) => (
    <ItemCard
      item={item}
      onPress={() => navigation.navigate("ItemDetail", { id: item.id })}
      onStockMove={() => navigation.navigate("StockMove", { item })}
      onDelete={() => deleteItem(item.id, item.name)}
    />
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Daftar Barang</Text>
          <Text style={styles.headerSubtitle}>Kelola stok & data master barang</Text>
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
            onPress={() => navigation.navigate("AddItem")}
            activeOpacity={0.7}
            style={[styles.iconBtn, styles.primaryBtn]}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <SearchBar
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Cari nama barang atau kategori..."
        />
      </View>

      {/* Main List */}
      <FlatList
        data={items}
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
              icon="cube-outline"
              title={searchTerm ? "Barang Tidak Ditemukan" : "Belum Ada Barang"}
              description={
                searchTerm
                  ? `Tidak ada barang yang cocok dengan "${searchTerm}".`
                  : "Mulai kelola inventaris dengan menambahkan barang pertama Anda."
              }
              actionLabel="Tambah Barang"
              onAction={() => navigation.navigate("AddItem")}
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
  searchWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
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
