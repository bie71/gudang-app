import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { exec } from "../services/database";

export default function HistoryScreen({ navigation }) {
  const PAGE_SIZE = 30;
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  useEffect(() => {
    loadHistory({ search: searchTerm, reset: true });
  }, []);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      loadHistory({ search: searchTerm, reset: true });
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  async function loadHistory({ search = searchTerm, reset = false, mode = "default" } = {}) {
    const normalizedSearch = (search || "").trim().toLowerCase();
    const isSearchChanged = normalizedSearch !== pagingRef.current.search;
    const shouldReset = reset || isSearchChanged;
    const offset = shouldReset ? 0 : pagingRef.current.offset;
    const limit = PAGE_SIZE + 1;
    const requestId = ++requestIdRef.current;

    if (mode === "refresh") setRefreshing(true);
    else if (mode === "loadMore") setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await exec(
        `
          SELECT h.id, h.type, h.qty, h.note, h.created_at, i.name
          FROM stock_history h JOIN items i ON i.id = h.item_id
          WHERE (? = '' OR LOWER(i.name) LIKE ? OR LOWER(IFNULL(h.note,'')) LIKE ? OR LOWER(h.type) LIKE ?)
          ORDER BY h.id DESC
          LIMIT ? OFFSET ?
        `,
        [normalizedSearch, `%${normalizedSearch}%`, `%${normalizedSearch}%`, `%${normalizedSearch}%`, limit, offset],
      );
      if (requestId !== requestIdRef.current) return;
      const rowsArray = res.rows?._array ?? [];
      const pageRows = rowsArray.slice(0, PAGE_SIZE).map(row => ({
        id: row.id,
        type: row.type,
        qty: Number(row.qty ?? 0),
        note: row.note,
        created_at: row.created_at,
        name: row.name,
      }));
      const nextOffset = offset + pageRows.length;
      setHasMore(rowsArray.length > PAGE_SIZE);
      setRows(prev => (shouldReset ? pageRows : [...prev, ...pageRows]));
      pagingRef.current = { offset: nextOffset, search: normalizedSearch };
    } catch (error) {
      console.log("HISTORY LOAD ERROR:", error);
    } finally {
      if (requestId === requestIdRef.current) {
        if (mode === "refresh") setRefreshing(false);
        else if (mode === "loadMore") setLoadingMore(false);
        else setLoading(false);
      }
    }
  }

  const handleRefresh = () => loadHistory({ search: searchTerm, reset: true, mode: "refresh" });
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadHistory({ search: searchTerm, reset: false, mode: "loadMore" });
    }
  };

  const renderItem = ({ item }) => (
    <View
      style={{
        backgroundColor: "#fff",
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        marginBottom: 12,
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 8 }}>{item.name}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <View
          style={{
            backgroundColor: item.type === "IN" ? "#F0FDFA" : "#FEF2F2",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
          }}
        >
          <Text
            style={{
              color: item.type === "IN" ? "#0D9488" : "#B91C1C",
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 0.2,
            }}
          >
            {item.type === "IN" ? "MASUK" : "KELUAR"}
          </Text>
        </View>
        <Text style={{ color: "#475569", fontWeight: "600", fontSize: 13 }}>
          Qty {item.qty} pcs
        </Text>
      </View>
      {!!item.note && <Text style={{ color: "#64748B", fontSize: 13, marginBottom: 4 }}>{item.note}</Text>}
      <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>{item.created_at}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#0F172A" }}>
      {/* Dark Header Container */}
      <View style={{ backgroundColor: "#0F172A", padding: 20, paddingBottom: 20 }}>
        {/* Header row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700", letterSpacing: -0.5 }}>
            Riwayat Aktivitas
          </Text>
        </View>

        {/* Search input */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            height: 46,
          }}
        >
          <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search"
            value={searchTerm}
            onChangeText={setSearchTerm}
            style={{
              flex: 1,
              color: "#0F172A",
              fontSize: 14,
              height: "100%",
              paddingVertical: 0,
            }}
            placeholderTextColor="#94A3B8"
          />
        </View>
      </View>

      {/* Main Content Area */}
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <FlatList
          data={rows}
          keyExtractor={it => String(it.id)}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color="#0D9488" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingVertical: 40 }}>
                <ActivityIndicator color="#0D9488" />
              </View>
            ) : (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Ionicons name="time-outline" size={32} color="#CBD5F5" />
                <Text style={{ color: "#94A3B8", marginTop: 8 }}>
                  {searchTerm.trim() ? "Tidak ada riwayat yang cocok." : "Belum ada riwayat stok."}
                </Text>
              </View>
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}
