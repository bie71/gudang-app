import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  RefreshControl
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  getStoredSheetConfig,
  saveSheetConfig,
  getSheetValues,
  appendSheetRow,
  updateSheetRow,
  deleteSheetRow,
  createAutoSpreadsheet,
  syncAllModulesData,
  getSpreadsheetSheets
} from "../services/googleSheets";
import { getStoredDriveToken } from "../services/googleDrive";

export default function GoogleSheetsScreen({ navigation }) {
  // Config States
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [availableSheets, setAvailableSheets] = useState([]);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Data States
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]); // Array of arrays (excluding header row)
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (err) {
      console.log("REFRESH ERROR:", err);
    } finally {
      setRefreshing(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [globalSyncing, setGlobalSyncing] = useState(false);

  const handleGlobalSync = async () => {
    setGlobalSyncing(true);
    try {
      await syncAllModulesData();
      Alert.alert("Sukses Sinkronisasi", "Seluruh data 4 modul (Barang, PO, Keuangan, Kalkulator) berhasil disinkronkan dengan Google Sheets.");
      await loadData();
    } catch (error) {
      console.log("GLOBAL SYNC ERROR:", error);
      Alert.alert("Gagal Sinkronisasi", error?.message || "Terjadi kesalahan saat menyinkronkan data.");
    } finally {
      setGlobalSyncing(false);
    }
  };

  // CRUD Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form Field States
  const [formData, setFormData] = useState({}); // { [headerName]: value }
  const [editingRowIndex, setEditingRowIndex] = useState(null); // Index in the `rows` array (0-based)

  // Keyboard offset state for Android modals
  const [keyboardInset, setKeyboardInset] = useState(0);

  // Keyboard listener setup for Android
  useEffect(() => {
    if (Platform.OS === "ios") return undefined;
    const isAnyModalOpen = isConfigOpen || isAddModalOpen || isEditModalOpen;
    if (!isAnyModalOpen) {
      setKeyboardInset(0);
      return undefined;
    }
    const showSub = Keyboard.addListener("keyboardDidShow", event => {
      const height = event?.endCoordinates?.height ?? 0;
      setKeyboardInset(height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardInset(0);
    });
    return () => {
      showSub?.remove();
      hideSub?.remove();
      setKeyboardInset(0);
    };
  }, [isConfigOpen, isAddModalOpen, isEditModalOpen]);

  // Check login and config on mount
  const checkState = useCallback(async () => {
    try {
      setInitialLoading(true);
      const token = await getStoredDriveToken();
      if (token && (token.accessToken || token.refreshToken)) {
        setGoogleConnected(true);
        const config = await getStoredSheetConfig();
        setSpreadsheetId(config.spreadsheetId);
        setSheetName(config.sheetName || "Sheet1");
        
        if (config.spreadsheetId) {
          await loadData(config.spreadsheetId, config.sheetName || "Sheet1");
        } else {
          setIsConfigOpen(true);
        }
      } else {
        setGoogleConnected(false);
      }
    } catch (error) {
      console.log("CHECK STATE ERROR:", error);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    checkState();
  }, [checkState]);

  // Load sheet data
  const loadData = async (targetId = spreadsheetId, targetName = sheetName) => {
    if (!targetId) return;
    setLoading(true);
    try {
      // 1. Ambil list tab/sheet yang saat ini ada di spreadsheet
      let sheets = [];
      try {
        sheets = await getSpreadsheetSheets(targetId);
        setAvailableSheets(sheets);
      } catch (err) {
        console.log("Error getting spreadsheet sheets list:", err);
      }

      // Tentukan tab aktif. Jika targetName tidak ada di daftar sheets, pilih sheet pertama
      let activeName = targetName;
      if (sheets.length > 0 && !sheets.map(s => s.toLowerCase()).includes(targetName.toLowerCase())) {
        activeName = sheets[0];
        setSheetName(activeName);
        await saveSheetConfig(targetId, activeName);
      }

      // 2. Ambil values dari tab aktif tersebut
      if (activeName) {
        const values = await getSheetValues(targetId, activeName);
        if (values && values.length > 0) {
          setHeaders(values[0]);
          setRows(values.slice(1));
          setPage(1);
        } else {
          setHeaders([]);
          setRows([]);
          setPage(1);
        }
      } else {
        setHeaders([]);
        setRows([]);
        setPage(1);
      }
    } catch (error) {
      console.log("LOAD SHEET DATA ERROR:", error);
      Alert.alert(
        "Koneksi Gagal",
        error?.message || "Tidak dapat memuat spreadsheet. Periksa kembali Spreadsheet ID dan Nama Sheet Anda."
      );
    } finally {
      setLoading(false);
    }
  };

  // Create sheet automatically handler
  const handleCreateAutoSheet = async () => {
    setLoading(true);
    try {
      const result = await createAutoSpreadsheet();
      setSpreadsheetId(result.spreadsheetId);
      setSheetName(result.sheetName);
      setIsConfigOpen(false);
      
      // Load data immediately
      await loadData(result.spreadsheetId, result.sheetName);
      
      Alert.alert(
        "Berhasil", 
        "Spreadsheet 'BukuToko - Lembar Kustom' berhasil dibuat di Google Drive Anda dengan kolom template (Nama, Kategori, Stok, Harga, Catatan)."
      );
    } catch (error) {
      console.log("CREATE AUTO SPREADSHEET ERROR:", error);
      Alert.alert("Gagal Membuat", error?.message || "Tidak dapat membuat spreadsheet otomatis.");
    } finally {
      setLoading(false);
    }
  };

  // Save config handler
  const handleSaveConfig = async () => {
    if (!spreadsheetId.trim()) {
      Alert.alert("Input Salah", "Spreadsheet ID tidak boleh kosong.");
      return;
    }
    setLoading(true);
    try {
      const saved = await saveSheetConfig(spreadsheetId.trim(), sheetName.trim());
      if (saved) {
        setIsConfigOpen(false);
        await loadData(spreadsheetId.trim(), sheetName.trim());
        Alert.alert("Berhasil", "Konfigurasi Google Sheet disimpan.");
      }
    } catch (error) {
      Alert.alert("Gagal", "Gagal menyimpan konfigurasi.");
    } finally {
      setLoading(false);
    }
  };

  // Create (Add Row)
  const handleAddRow = async () => {
    if (headers.length === 0) return;
    setActionLoading(true);
    try {
      // Create ordered array based on headers
      const newRow = headers.map(header => formData[header] || "");
      await appendSheetRow(spreadsheetId, sheetName, newRow);
      
      // Update local state by appending row
      setRows(prev => [...prev, newRow]);
      setIsAddModalOpen(false);
      setFormData({});
      Alert.alert("Berhasil", "Baris baru ditambahkan ke Google Sheet.");
    } catch (error) {
      Alert.alert("Gagal Tambah", error?.message || "Gagal menambahkan baris baru.");
    } finally {
      setActionLoading(false);
    }
  };

  // Update (Edit Row)
  const handleUpdateRow = async () => {
    if (editingRowIndex === null || headers.length === 0) return;
    setActionLoading(true);
    try {
      // Google Sheet Row Number (Header is Row 1, Row Index 0 in `rows` is Row 2)
      const sheetRowIndex = editingRowIndex + 2; 
      const updatedRow = headers.map(header => formData[header] || "");
      
      await updateSheetRow(spreadsheetId, sheetName, sheetRowIndex, updatedRow);
      
      // Update local state
      setRows(prev => {
        const copy = [...prev];
        copy[editingRowIndex] = updatedRow;
        return copy;
      });
      
      setIsEditModalOpen(false);
      setFormData({});
      setEditingRowIndex(null);
      Alert.alert("Berhasil", "Data baris diperbarui.");
    } catch (error) {
      Alert.alert("Gagal Ubah", error?.message || "Gagal mengubah data baris.");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Row
  const handleDeleteRow = async () => {
    if (editingRowIndex === null) return;
    
    Alert.alert(
      "Hapus Baris",
      "Apakah Anda yakin ingin menghapus baris data ini secara permanen dari Google Sheet?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              // Google Sheet Row Index for deletion (0-based starting from header)
              // Row Index 0 in `rows` is Row 2, which is index 1 in Google Sheets
              const sheetRowIndexZeroBased = editingRowIndex + 1;
              await deleteSheetRow(spreadsheetId, sheetName, sheetRowIndexZeroBased);
              
              // Update local state
              setRows(prev => prev.filter((_, idx) => idx !== editingRowIndex));
              setIsEditModalOpen(false);
              setFormData({});
              setEditingRowIndex(null);
              Alert.alert("Berhasil", "Baris berhasil dihapus.");
            } catch (error) {
              Alert.alert("Gagal Hapus", error?.message || "Gagal menghapus baris.");
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  // Open Edit Dialog
  const openEditModal = (row, index) => {
    const initialData = {};
    headers.forEach((header, colIdx) => {
      initialData[header] = row[colIdx] || "";
    });
    setFormData(initialData);
    setEditingRowIndex(index);
    setIsEditModalOpen(true);
  };

  // Open Add Dialog
  const openAddModal = () => {
    const emptyData = {};
    headers.forEach(header => {
      emptyData[header] = "";
    });
    setFormData(emptyData);
    setIsAddModalOpen(true);
  };

  // Saring data berdasarkan pencarian
  const filteredAllRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase().trim();
    return rows.filter(row => 
      row.some(cell => String(cell).toLowerCase().includes(query))
    );
  }, [rows, searchQuery]);

  // Potong data untuk paginasi lokal (Infinite Scroll)
  const paginatedRows = useMemo(() => {
    const pageSize = 20;
    return filteredAllRows.slice(0, page * pageSize);
  }, [filteredAllRows, page]);

  // Reset halaman ketika pencarian berubah
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  // Fungsi untuk memuat data halaman berikutnya
  const handleLoadMore = () => {
    const pageSize = 20;
    if (page * pageSize < filteredAllRows.length) {
      setPage(prev => prev + 1);
    }
  };

  // Render Row Card
  const renderRowItem = ({ item, index }) => {
    // Find absolute index of this item in the main list
    const originalIndex = rows.indexOf(item);
    
    // We treat the first column as Title
    const title = item[0] || "(Tanpa Judul)";
    const remainingColumns = headers.slice(1).map((header, colIdx) => {
      const val = item[colIdx + 1] || "-";
      return { header, val };
    });

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => openEditModal(item, originalIndex)}
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", flex: 1, marginRight: 8 }}>
            {title}
          </Text>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="create-outline" size={16} color="#0D9488" />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          {remainingColumns.map((col, idx) => (
            <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
              <Text style={{ color: "#64748B", fontSize: 13, fontWeight: "500" }}>{col.header}:</Text>
              <Text style={{ color: "#334155", fontSize: 13, fontWeight: "600", textAlign: "right", flex: 1, marginLeft: 16 }}>
                {col.val}
              </Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    );
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={{ marginTop: 12, color: "#64748B", fontWeight: "600" }}>Memeriksa Koneksi...</Text>
      </SafeAreaView>
    );
  }

  // Not Connected State
  if (!googleConnected) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
            <Ionicons name="logo-google" size={40} color="#EA4335" />
          </View>
          <Text style={{ fontSize: 20, fontWeight: "800", color: "#0F172A", textAlign: "center", marginBottom: 8 }}>
            Akun Google Belum Terhubung
          </Text>
          <Text style={{ color: "#64748B", textAlign: "center", lineHeight: 20, marginBottom: 28 }}>
            Fitur Google Sheet CRUD memerlukan izin akses spreadsheet Google Anda. Hubungkan akun Google Anda terlebih dahulu di menu Manajemen Data.
          </Text>
          
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate("DataManagement")}
            style={{
              backgroundColor: "#EA4335",
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 28,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              elevation: 3,
            }}
          >
            <Ionicons name="settings-outline" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Buka Manajemen Data</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        {/* Top Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0"
        }}
      >
        <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Google Sheets CRUD</Text>
          <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }} numberOfLines={1}>
            {spreadsheetId ? `Sheet: ${sheetName}` : "Belum Dikonfigurasi"}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleGlobalSync}
          disabled={loading || globalSyncing}
          style={{ padding: 4, marginRight: 12, opacity: (loading || globalSyncing) ? 0.6 : 1 }}
        >
          {globalSyncing ? (
            <ActivityIndicator size="small" color="#0D9488" />
          ) : (
            <Ionicons name="sync-outline" size={24} color="#0D9488" />
          )}
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} onPress={() => setIsConfigOpen(true)} style={{ padding: 4 }}>
          <Ionicons name="options-outline" size={24} color="#0D9488" />
        </TouchableOpacity>
      </View>

      {/* Main Container */}
      {!spreadsheetId ? (
        // Empty Config Screen
        <View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="grid-outline" size={64} color="#CBD5E1" />
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#475569", marginTop: 16, textAlign: "center" }}>
            Spreadsheet Belum Dikonfigurasi
          </Text>
          <Text style={{ color: "#94A3B8", textAlign: "center", marginTop: 8, marginBottom: 24 }}>
            Silakan tekan tombol konfigurasi di pojok kanan atas untuk memasukkan Spreadsheet ID.
          </Text>
          <View style={{ flexDirection: "column", gap: 12, width: "100%", paddingHorizontal: 24 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsConfigOpen(true)}
              style={{
                backgroundColor: "#0D9488",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Mulai Konfigurasi Manual</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleCreateAutoSheet}
              disabled={loading}
              style={{
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: "#0D9488",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <ActivityIndicator color="#0D9488" />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={18} color="#0D9488" />
                  <Text style={{ color: "#0D9488", fontWeight: "700" }}>Buat Spreadsheet Baru Otomatis</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Search bar & Refresh row */}
          <View style={{ padding: 16, flexDirection: "row", gap: 12 }}>
            <View style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#fff",
              borderRadius: 12,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}>
              <Ionicons name="search-outline" size={20} color="#94A3B8" />
              <TextInput
                placeholder="Cari data..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{
                  flex: 1,
                  paddingVertical: Platform.OS === "ios" ? 10 : 8,
                  paddingHorizontal: 8,
                  color: "#0F172A",
                  fontSize: 14,
                }}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => loadData()}
              style={{
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                width: 44,
                height: 44,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="refresh-outline" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Selector Tab Fitur */}
          {availableSheets.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: "#F8FAFC", paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
              {availableSheets.map((tab) => {
                const isActive = sheetName.toLowerCase() === tab.toLowerCase();
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => {
                      setSheetName(tab);
                      saveSheetConfig(spreadsheetId, tab);
                      loadData(spreadsheetId, tab);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: isActive ? "#0D9488" : "#fff",
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: isActive ? "#0D9488" : "#E2E8F0",
                      minWidth: 70,
                    }}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: isActive ? "#fff" : "#64748B",
                    }}>
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* List or Loading State */}
          {loading ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#0D9488" />
              <Text style={{ marginTop: 12, color: "#64748B" }}>Mengunduh data Google Sheet...</Text>
            </View>
          ) : rows.length === 0 ? (
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#0D9488"]} />
              }
            >
              <Ionicons name="folder-open-outline" size={60} color="#CBD5E1" />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#475569", marginTop: 16, textAlign: "center" }}>
                Tidak Ada Data
              </Text>
              <Text style={{ color: "#94A3B8", textAlign: "center", marginTop: 6, fontSize: 13 }}>
                Sheet Anda kosong, atau baris pertama tidak diset sebagai header.
              </Text>
            </ScrollView>
          ) : (
            <FlatList
              data={paginatedRows}
              renderItem={renderRowItem}
              keyExtractor={(_, index) => String(index)}
              contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.2}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#0D9488"]} />
              }
              ListFooterComponent={() => {
                const pageSize = 20;
                if (page * pageSize < filteredAllRows.length) {
                  return (
                    <View style={{ paddingVertical: 16, alignItems: "center" }}>
                      <ActivityIndicator size="small" color="#0D9488" />
                      <Text style={{ marginTop: 4, color: "#64748B", fontSize: 12 }}>Memuat data lebih banyak...</Text>
                    </View>
                  );
                }
                return null;
              }}
            />
          )}

          {/* Floating Action Button */}
          {headers.length > 0 && !loading && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openAddModal}
              style={{
                position: "absolute",
                bottom: 24,
                right: 24,
                backgroundColor: "#0D9488",
                width: 56,
                height: 56,
                borderRadius: 28,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#0D9488",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
                elevation: 6,
              }}
            >
              <Ionicons name="add" size={30} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* MODAL: Konfigurasi Sheet */}
      <Modal visible={isConfigOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={{
            flex: 1,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            justifyContent: "flex-end",
            paddingBottom: Platform.OS === "ios" ? 0 : keyboardInset
          }}>
            <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#0F172A" }}>Konfigurasi Sheet</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setIsConfigOpen(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView>
                <Text style={{ color: "#64748B", marginBottom: 20, lineHeight: 18, fontSize: 13 }}>
                  Masukkan ID Google Sheet dan Nama Sheet (Tab) yang ingin Anda kelola. Pastikan Spreadsheet tersebut sudah dapat diakses oleh akun Google Anda.
                </Text>

                <Text style={{ fontWeight: "700", color: "#334155", marginBottom: 6 }}>Spreadsheet ID</Text>
                <TextInput
                  placeholder="Contoh: 1x7S9a... (dari URL Google Sheet)"
                  value={spreadsheetId}
                  onChangeText={setSpreadsheetId}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 12,
                    padding: 12,
                    color: "#0F172A",
                    backgroundColor: "#F8FAFC",
                    marginBottom: 16,
                  }}
                />

                <Text style={{ fontWeight: "700", color: "#334155", marginBottom: 6 }}>Nama Sheet (Tab)</Text>
                <TextInput
                  placeholder="Contoh: Sheet1"
                  value={sheetName}
                  onChangeText={setSheetName}
                  autoCorrect={false}
                  style={{
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    borderRadius: 12,
                    padding: 12,
                    color: "#0F172A",
                    backgroundColor: "#F8FAFC",
                    marginBottom: 24,
                  }}
                />

                <View style={{ backgroundColor: "#F0FDFA", borderLeftWidth: 4, borderLeftColor: "#0D9488", padding: 12, borderRadius: 8, marginBottom: 24 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F766E", marginBottom: 4 }}>Cara Mendapatkan ID:</Text>
                  <Text style={{ fontSize: 12, color: "#115E59", lineHeight: 16 }}>
                    Buka Google Sheet di browser. URL Sheet berbentuk:{"\n"}
                    https://docs.google.com/spreadsheets/d/<Text style={{ fontWeight: "700" }}>[SPREADSHEET_ID]</Text>/edit
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleCreateAutoSheet}
                  disabled={loading}
                  style={{
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "#0D9488",
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    marginBottom: 12,
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color="#0D9488" />
                  ) : (
                    <>
                      <Ionicons name="sparkles-outline" size={18} color="#0D9488" />
                      <Text style={{ color: "#0D9488", fontWeight: "700", fontSize: 16 }}>Buat Spreadsheet Baru Otomatis</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleSaveConfig}
                  disabled={loading}
                  style={{
                    backgroundColor: "#0D9488",
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Simpan & Hubungkan</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Tambah Baris */}
      <Modal visible={isAddModalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={{
            flex: 1,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            justifyContent: "flex-end",
            paddingBottom: Platform.OS === "ios" ? 0 : keyboardInset
          }}>
            <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#0F172A" }}>Tambah Baris Baru</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setIsAddModalOpen(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                {headers.map((header, idx) => (
                  <View key={idx} style={{ marginBottom: 16 }}>
                    <Text style={{ fontWeight: "700", color: "#334155", marginBottom: 6 }}>{header}</Text>
                    <TextInput
                      placeholder={`Masukkan ${header}...`}
                      value={formData[header] || ""}
                      onChangeText={txt => setFormData(prev => ({ ...prev, [header]: txt }))}
                      style={{
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        borderRadius: 12,
                        padding: 12,
                        color: "#0F172A",
                        backgroundColor: "#F8FAFC",
                      }}
                    />
                  </View>
                ))}

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleAddRow}
                  disabled={actionLoading}
                  style={{
                    backgroundColor: "#0D9488",
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginTop: 8,
                    opacity: actionLoading ? 0.7 : 1,
                  }}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Tambah Data</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: Edit/Hapus Baris */}
      <Modal visible={isEditModalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View style={{
            flex: 1,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            justifyContent: "flex-end",
            paddingBottom: Platform.OS === "ios" ? 0 : keyboardInset
          }}>
            <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#0F172A" }}>Ubah Data Baris</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setIsEditModalOpen(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
                {headers.map((header, idx) => (
                  <View key={idx} style={{ marginBottom: 16 }}>
                    <Text style={{ fontWeight: "700", color: "#334155", marginBottom: 6 }}>{header}</Text>
                    <TextInput
                      placeholder={`Masukkan ${header}...`}
                      value={formData[header] || ""}
                      onChangeText={txt => setFormData(prev => ({ ...prev, [header]: txt }))}
                      style={{
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        borderRadius: 12,
                        padding: 12,
                        color: "#0F172A",
                        backgroundColor: "#F8FAFC",
                      }}
                    />
                  </View>
                ))}

                <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleDeleteRow}
                    disabled={actionLoading}
                    style={{
                      flex: 1,
                      backgroundColor: "#EF4444",
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                      opacity: actionLoading ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Hapus</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleUpdateRow}
                    disabled={actionLoading}
                    style={{
                      flex: 2,
                      backgroundColor: "#0D9488",
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                      opacity: actionLoading ? 0.7 : 1,
                    }}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Simpan Perubahan</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </View>
    </SafeAreaView>
  );
}
