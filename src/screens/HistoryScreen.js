import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { exec } from "../services/database";

export default function HistoryScreen() {
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
    <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 10 }}>
      <Text style={{ fontWeight: "700" }}>{item.name}</Text>
      <Text style={{ color: item.type === "IN" ? "#2563EB" : "#EF4444", fontWeight: "700" }}>{item.type} • Qty {item.qty}</Text>
      {!!item.note && <Text style={{ color: "#64748B" }}>{item.note}</Text>}
      <Text style={{ color: "#94A3B8", marginTop: 4 }}>{item.created_at}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 12 }}>History</Text>
      <TextInput
        placeholder="Cari nama, catatan, atau tipe..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={{
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: "#E5E7EB",
          borderRadius: 12,
          paddingHorizontal: 12,
          height: 44,
          marginBottom: 12,
        }}
      />
      <FlatList
        data={rows}
        keyExtractor={it => String(it.id)}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 40 }}>
              <ActivityIndicator color="#2563EB" />
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
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </SafeAreaView>
  );
}
