import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import {
  getBookkeepingById,
  adjustBookkeepingAmount,
  softDeleteBookkeepingEntry,
} from "../repositories/bookkeepingRepository";

export function useBookkeepingDetail(entryId) {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!entryId) return;
    setLoading(true);
    try {
      const data = await getBookkeepingById(entryId);
      setEntry(data);
    } catch (e) {
      console.log("LOAD BOOKKEEPING DETAIL ERROR:", e);
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const adjustAmount = useCallback(
    async ({ type, changeAmount, note }) => {
      if (!entry) return false;
      try {
        await adjustBookkeepingAmount({
          entryId: entry.id,
          type,
          changeAmount,
          note,
          previousAmount: entry.amount,
        });
        await loadData();
        return true;
      } catch (error) {
        console.log("ADJUST BOOKKEEPING ERROR:", error);
        Alert.alert("Gagal", "Gagal memperbarui saldo catatan.");
        return false;
      }
    },
    [entry, loadData]
  );

  const deleteEntry = useCallback(async () => {
    if (!entry) return false;
    return new Promise(resolve => {
      Alert.alert("Hapus Catatan", "Yakin ingin menghapus catatan pembukuan ini?", [
        { text: "Batal", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await softDeleteBookkeepingEntry(entry.id);
              resolve(true);
            } catch (e) {
              console.log("DELETE ENTRY ERROR:", e);
              Alert.alert("Gagal", "Catatan tidak dapat dihapus.");
              resolve(false);
            }
          },
        },
      ]);
    });
  }, [entry]);

  return {
    entry,
    loading,
    refresh: loadData,
    adjustAmount,
    deleteEntry,
  };
}
