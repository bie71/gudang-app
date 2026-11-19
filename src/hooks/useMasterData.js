import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import {
  getMasterOrderers,
  createMasterOrderer,
  updateMasterOrderer,
  softDeleteMasterOrderer,
  getMasterPoItems,
  createMasterPoItem,
  updateMasterPoItem,
  softDeleteMasterPoItem,
  getMasterMarketers,
  createMasterMarketer,
  updateMasterMarketer,
  softDeleteMasterMarketer,
} from "../repositories/masterDataRepository";

export function useMasterData() {
  const [activeTab, setActiveTab] = useState("orderers"); // "orderers" | "po_items" | "marketers"
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [orderers, setOrderers] = useState([]);
  const [poItems, setPoItems] = useState([]);
  const [marketers, setMarketers] = useState([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (activeTab === "orderers") {
        const rows = await getMasterOrderers(searchQuery);
        setOrderers(rows);
      } else if (activeTab === "po_items") {
        const rows = await getMasterPoItems(searchQuery);
        setPoItems(rows);
      } else {
        const rows = await getMasterMarketers(searchQuery);
        setMarketers(rows);
      }
    } catch (error) {
      console.log("LOAD MASTER DATA ERROR:", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const deleteItem = useCallback(
    async item => {
      return new Promise(resolve => {
        Alert.alert("Konfirmasi Hapus", `Apakah Anda yakin ingin menghapus "${item.name}"?`, [
          { text: "Batal", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Hapus",
            style: "destructive",
            onPress: async () => {
              try {
                if (activeTab === "orderers") {
                  await softDeleteMasterOrderer(item.id);
                } else if (activeTab === "po_items") {
                  await softDeleteMasterPoItem(item.id);
                } else {
                  await softDeleteMasterMarketer(item.id);
                }
                loadData();
                resolve(true);
              } catch (e) {
                console.log("DELETE MASTER ERROR:", e);
                Alert.alert("Gagal", "Gagal menghapus data master.");
                resolve(false);
              }
            },
          },
        ]);
      });
    },
    [activeTab, loadData]
  );

  return {
    activeTab,
    setActiveTab,
    loading,
    searchQuery,
    setSearchQuery,
    orderers,
    poItems,
    marketers,
    refresh: loadData,
    deleteItem,
    createOrderer: createMasterOrderer,
    updateOrderer: updateMasterOrderer,
    createPoItem: createMasterPoItem,
    updatePoItem: updateMasterPoItem,
    createMarketer: createMasterMarketer,
    updateMarketer: updateMasterMarketer,
  };
}
