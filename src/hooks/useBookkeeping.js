import { useState, useEffect, useRef, useCallback } from "react";
import { Alert } from "react-native";
import {
  getBookkeepingEntries,
  getBookkeepingSummary,
  softDeleteBookkeepingEntry,
} from "../repositories/bookkeepingRepository";

export function useBookkeeping() {
  const PAGE_SIZE = 20;
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ totalEntries: 0, totalBalance: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  const loadSummary = useCallback(async () => {
    try {
      const data = await getBookkeepingSummary();
      setSummary(data);
    } catch (e) {
      console.log("LOAD BOOKKEEPING SUMMARY ERROR:", e);
    }
  }, []);

  const loadEntries = useCallback(
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
        const rows = await getBookkeepingEntries({
          search: normalizedSearch,
          limit,
          offset,
        });

        if (requestId !== requestIdRef.current) return;

        const pageRows = rows.slice(0, PAGE_SIZE);
        const nextOffset = offset + pageRows.length;
        setHasMore(rows.length > PAGE_SIZE);
        setEntries(prev => (shouldReset ? pageRows : [...prev, ...pageRows]));
        pagingRef.current = { offset: nextOffset, search: normalizedSearch };
      } catch (error) {
        console.log("LOAD BOOKKEEPING HOOK ERROR:", error);
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
    loadEntries({ search: searchTerm, reset: true });
    loadSummary();
  }, []);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      loadEntries({ search: searchTerm, reset: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const refresh = useCallback(() => {
    loadSummary();
    return loadEntries({ search: searchTerm, reset: true, mode: "refresh" });
  }, [loadEntries, loadSummary, searchTerm]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    loadEntries({ search: searchTerm, reset: false, mode: "loadMore" });
  }, [loading, loadingMore, hasMore, loadEntries, searchTerm]);

  const deleteEntry = useCallback(
    async id => {
      return new Promise(resolve => {
        Alert.alert("Hapus Catatan Pembukuan", "Yakin ingin menghapus catatan pembukuan ini?", [
          { text: "Batal", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Hapus",
            style: "destructive",
            onPress: async () => {
              try {
                await softDeleteBookkeepingEntry(id);
                refresh();
                resolve(true);
              } catch (error) {
                console.log("DELETE BOOKKEEPING ENTRY ERROR:", error);
                Alert.alert("Gagal", "Catatan tidak dapat dihapus.");
                resolve(false);
              }
            },
          },
        ]);
      });
    },
    [refresh]
  );

  return {
    entries,
    summary,
    searchTerm,
    setSearchTerm,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    deleteEntry,
  };
}
