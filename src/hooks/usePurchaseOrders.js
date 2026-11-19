import { useState, useEffect, useRef, useCallback } from "react";
import { Alert } from "react-native";
import {
  getPurchaseOrders,
  updatePOStatus,
  softDeletePurchaseOrder,
  getPOSummaryMetrics,
} from "../repositories/purchaseOrderRepository";
import { eventBus, APP_EVENTS } from "../services/events";

export function usePurchaseOrders({ initialStatus = "ALL" } = {}) {
  const PAGE_SIZE = 20;
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [metrics, setMetrics] = useState({
    totalCount: 0,
    progressCount: 0,
    doneCount: 0,
    cancelledCount: 0,
    totalValue: 0,
    progressValue: 0,
    doneValue: 0,
    doneProfit: 0,
    progressProfit: 0,
    totalMarketerFee: 0,
  });

  const pagingRef = useRef({ offset: 0, search: "", status: initialStatus });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await getPOSummaryMetrics();
      setMetrics(data);
    } catch (e) {
      console.log("LOAD PO METRICS ERROR:", e);
    }
  }, []);

  const loadOrders = useCallback(
    async ({
      search = searchTerm,
      status = statusFilter,
      reset = false,
      mode = "default",
    } = {}) => {
      const normalizedSearch = (search || "").trim().toLowerCase();
      const isSearchChanged = normalizedSearch !== pagingRef.current.search;
      const isStatusChanged = status !== pagingRef.current.status;
      const shouldReset = reset || isSearchChanged || isStatusChanged;
      const offset = shouldReset ? 0 : pagingRef.current.offset;
      const limit = PAGE_SIZE + 1;
      const requestId = ++requestIdRef.current;

      if (mode === "refresh") setRefreshing(true);
      else if (mode === "loadMore") setLoadingMore(true);
      else setLoading(true);

      try {
        const [rows] = await Promise.all([
          getPurchaseOrders({
            search: normalizedSearch,
            status,
            limit,
            offset,
          }),
          shouldReset ? loadMetrics() : Promise.resolve(),
        ]);

        if (requestId !== requestIdRef.current) return;

        const pageRows = rows.slice(0, PAGE_SIZE);
        const nextOffset = offset + pageRows.length;
        setHasMore(rows.length > PAGE_SIZE);
        setOrders(prev => (shouldReset ? pageRows : [...prev, ...pageRows]));
        pagingRef.current = { offset: nextOffset, search: normalizedSearch, status };
      } catch (error) {
        console.log("LOAD PO HOOK ERROR:", error);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [searchTerm, statusFilter]
  );

  useEffect(() => {
    loadOrders({ search: searchTerm, status: statusFilter, reset: true });
  }, [statusFilter]);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      loadOrders({ search: searchTerm, status: statusFilter, reset: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Subscribe to PO changes for instant list reactivity
  useEffect(() => {
    const unsubscribe = eventBus.subscribe(APP_EVENTS.PO_CHANGED, () => {
      loadOrders({ search: searchTerm, status: statusFilter, reset: true });
      loadMetrics();
    });
    return unsubscribe;
  }, [loadOrders, loadMetrics, searchTerm, statusFilter]);

  const refresh = useCallback(() => {
    return loadOrders({ search: searchTerm, status: statusFilter, reset: true, mode: "refresh" });
  }, [loadOrders, searchTerm, statusFilter]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    loadOrders({ search: searchTerm, status: statusFilter, reset: false, mode: "loadMore" });
  }, [loading, loadingMore, hasMore, loadOrders, searchTerm, statusFilter]);

  const changeStatus = useCallback(
    async (orderId, newStatus) => {
      // Optimistic list update
      setOrders(prev =>
        prev.map(it => (it.id === orderId ? { ...it, status: newStatus } : it))
      );
      try {
        await updatePOStatus(orderId, newStatus);
        refresh();
        loadMetrics();
        return true;
      } catch (error) {
        console.log("UPDATE PO STATUS ERROR:", error);
        Alert.alert("Gagal", "Tidak dapat mengubah status PO.");
        refresh();
        return false;
      }
    },
    [refresh, loadMetrics]
  );

  const deleteOrder = useCallback(
    async orderId => {
      return new Promise(resolve => {
        Alert.alert("Hapus PO", "Apakah Anda yakin ingin menghapus PO ini?", [
          { text: "Batal", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Hapus",
            style: "destructive",
            onPress: async () => {
              // Optimistic deletion
              setOrders(prev => prev.filter(it => it.id !== orderId));
              try {
                await softDeletePurchaseOrder(orderId);
                refresh();
                loadMetrics();
                resolve(true);
              } catch (error) {
                console.log("DELETE PO ERROR:", error);
                Alert.alert("Gagal", "PO tidak dapat dihapus.");
                refresh();
                resolve(false);
              }
            },
          },
        ]);
      });
    },
    [refresh, loadMetrics]
  );

  const cancelOrder = useCallback(
    async orderId => {
      return new Promise(resolve => {
        Alert.alert("Batalkan Purchase Order", "Yakin ingin membatalkan purchase order ini?", [
          { text: "Kembali", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Batalkan PO",
            style: "destructive",
            onPress: async () => {
              // Optimistic cancel
              setOrders(prev =>
                prev.map(it => (it.id === orderId ? { ...it, status: "CANCELLED" } : it))
              );
              try {
                await updatePOStatus(orderId, "CANCELLED");
                refresh();
                loadMetrics();
                resolve(true);
              } catch (error) {
                console.log("CANCEL PO ERROR:", error);
                Alert.alert("Gagal", "Tidak dapat membatalkan purchase order.");
                refresh();
                resolve(false);
              }
            },
          },
        ]);
      });
    },
    [refresh, loadMetrics]
  );

  return {
    orders,
    statusFilter,
    setStatusFilter,
    searchTerm,
    setSearchTerm,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    metrics,
    refresh,
    loadMore,
    changeStatus,
    cancelOrder,
    deleteOrder,
  };
}
