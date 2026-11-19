import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import {
  getPurchaseOrderById,
  updatePOStatus,
  softDeletePurchaseOrder,
} from "../repositories/purchaseOrderRepository";
import { eventBus, APP_EVENTS } from "../services/events";

export function usePurchaseOrderDetail(orderId) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (showLoader = false) => {
    if (!orderId) return;
    if (showLoader) setLoading(true);
    try {
      const data = await getPurchaseOrderById(orderId);
      setOrder(data);
    } catch (error) {
      console.log("LOAD PO DETAIL ERROR:", error);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Subscribe to reactive PO events (changes from Edit, Status, etc.)
  useEffect(() => {
    if (!orderId) return;
    const unsubscribe = eventBus.subscribe(APP_EVENTS.PO_CHANGED, payload => {
      if (!payload || payload.id == orderId) {
        loadData(false);
      }
    });
    return unsubscribe;
  }, [orderId, loadData]);

  const changeStatus = useCallback(
    async newStatus => {
      if (!order) return false;
      const previousStatus = order.status;
      // Optimistic update for instant UI feedback
      setOrder(prev => (prev ? { ...prev, status: newStatus } : null));

      try {
        await updatePOStatus(order.id, newStatus);
        await loadData(false);
        return true;
      } catch (error) {
        // Rollback on error
        setOrder(prev => (prev ? { ...prev, status: previousStatus } : null));
        console.log("CHANGE PO STATUS ERROR:", error);
        Alert.alert("Gagal", "Tidak dapat mengubah status PO.");
        return false;
      }
    },
    [order, loadData]
  );

  const deleteOrder = useCallback(async () => {
    if (!order) return false;
    return new Promise(resolve => {
      Alert.alert("Hapus PO", "Apakah Anda yakin ingin menghapus PO ini?", [
        { text: "Batal", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await softDeletePurchaseOrder(order.id);
              resolve(true);
            } catch (error) {
              console.log("DELETE PO ERROR:", error);
              Alert.alert("Gagal", "PO tidak dapat dihapus.");
              resolve(false);
            }
          },
        },
      ]);
    });
  }, [order]);

  return {
    order,
    loading,
    refresh: loadData,
    changeStatus,
    deleteOrder,
  };
}
