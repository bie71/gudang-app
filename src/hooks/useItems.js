import { useState, useEffect, useRef, useCallback } from "react";
import { Alert } from "react-native";
import { getItems, softDeleteItem } from "../repositories/itemRepository";

export function useItems({ initialSearch = "" } = {}) {
  const PAGE_SIZE = 20;
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  const loadItems = useCallback(
    async ({ search = searchTerm, reset = false, mode = "default" } = {}) => {
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
        const rows = await getItems({
          search: normalizedSearch,
          limit,
          offset,
        });

        if (requestId !== requestIdRef.current) return;

        const pageRows = rows.slice(0, PAGE_SIZE);
        const nextOffset = offset + pageRows.length;
        setHasMore(rows.length > PAGE_SIZE);
        setItems(prev => (shouldReset ? pageRows : [...prev, ...pageRows]));
        pagingRef.current = { offset: nextOffset, search: normalizedSearch };
      } catch (error) {
        console.log("LOAD ITEMS HOOK ERROR:", error);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [searchTerm]
  );

  useEffect(() => {
    loadItems({ search: searchTerm, reset: true });
  }, []);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      loadItems({ search: searchTerm, reset: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const refresh = useCallback(() => {
    return loadItems({ search: searchTerm, reset: true, mode: "refresh" });
  }, [loadItems, searchTerm]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    loadItems({ search: searchTerm, reset: false, mode: "loadMore" });
  }, [loading, loadingMore, hasMore, loadItems, searchTerm]);

  const deleteItem = useCallback(
    async (id, itemName) => {
      return new Promise(resolve => {
        Alert.alert(
          "Hapus Barang",
          `Yakin ingin menghapus ${itemName || "barang ini"}?`,
          [
            { text: "Batal", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Hapus",
              style: "destructive",
              onPress: async () => {
                try {
                  await softDeleteItem(id);
                  loadItems({ search: searchTerm, reset: true });
                  resolve(true);
                } catch (error) {
                  console.log("DELETE ITEM ERROR:", error);
                  Alert.alert("Gagal", "Barang tidak dapat dihapus.");
                  resolve(false);
                }
              },
            },
          ]
        );
      });
    },
    [loadItems, searchTerm]
  );

  return {
    items,
    searchTerm,
    setSearchTerm,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    deleteItem,
  };
}
