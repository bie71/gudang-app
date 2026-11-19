import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { getItemById, getStockHistory, softDeleteItem } from "../repositories/itemRepository";

export function useItemDetail(itemId) {
  const [item, setItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const itemData = await getItemById(itemId);
      setItem(itemData);
      if (itemData) {
        const historyData = await getStockHistory(itemId, 50);
        setHistory(historyData);
      }
    } catch (error) {
      console.log("LOAD ITEM DETAIL ERROR:", error);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const deleteItem = useCallback(async () => {
    if (!item) return false;
    return new Promise(resolve => {
      Alert.alert(
        "Hapus Barang",
        `Yakin ingin menghapus ${item.name || "barang ini"}? Riwayat stok terkait juga akan disembunyikan.`,
        [
          { text: "Batal", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Hapus",
            style: "destructive",
            onPress: async () => {
              try {
                await softDeleteItem(item.id);
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
  }, [item]);

  return {
    item,
    history,
    loading,
    refresh: loadData,
    deleteItem,
  };
}
