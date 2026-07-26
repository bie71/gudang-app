import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { exec } from "../services/database";
import { formatCurrencyValue } from "../utils/format";

export default function MasterDataScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("orderers"); // "orderers" | "po_items" | "marketers"
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Data lists
  const [orderers, setOrderers] = useState([]);
  const [poItems, setPoItems] = useState([]);
  const [marketers, setMarketers] = useState([]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form Fields - Orderer
  const [ordererName, setOrdererName] = useState("");
  const [ordererPhone, setOrdererPhone] = useState("");
  const [ordererAddress, setOrdererAddress] = useState("");
  const [ordererNote, setOrdererNote] = useState("");

  // Form Fields - PO Item
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemDefaultPrice, setItemDefaultPrice] = useState("");
  const [itemDefaultCostPrice, setItemDefaultCostPrice] = useState("");
  const [itemNote, setItemNote] = useState("");

  // Form Fields - Marketer
  const [marketerName, setMarketerName] = useState("");
  const [marketerPhone, setMarketerPhone] = useState("");
  const [marketerAddress, setMarketerAddress] = useState("");
  const [marketerDefaultFee, setMarketerDefaultFee] = useState("");
  const [marketerNote, setMarketerNote] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (activeTab === "orderers") {
        const query = searchQuery
          ? `SELECT * FROM master_orderers WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(phone) LIKE ?) ORDER BY name ASC`
          : `SELECT * FROM master_orderers WHERE deleted_at IS NULL ORDER BY name ASC`;
        const params = searchQuery ? [`%${searchQuery.toLowerCase()}%`, `%${searchQuery.toLowerCase()}%`] : [];
        const res = await exec(query, params);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
        setOrderers(rows);
      } else if (activeTab === "po_items") {
        const query = searchQuery
          ? `SELECT * FROM master_po_items WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(IFNULL(category,'')) LIKE ?) ORDER BY name ASC`
          : `SELECT * FROM master_po_items WHERE deleted_at IS NULL ORDER BY name ASC`;
        const params = searchQuery ? [`%${searchQuery.toLowerCase()}%`, `%${searchQuery.toLowerCase()}%`] : [];
        const res = await exec(query, params);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
        setPoItems(rows);
      } else {
        const query = searchQuery
          ? `SELECT * FROM master_marketers WHERE deleted_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(phone) LIKE ?) ORDER BY name ASC`
          : `SELECT * FROM master_marketers WHERE deleted_at IS NULL ORDER BY name ASC`;
        const params = searchQuery ? [`%${searchQuery.toLowerCase()}%`, `%${searchQuery.toLowerCase()}%`] : [];
        const res = await exec(query, params);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
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

  const openAddModal = () => {
    setEditingItem(null);
    if (activeTab === "orderers") {
      setOrdererName("");
      setOrdererPhone("");
      setOrdererAddress("");
      setOrdererNote("");
    } else if (activeTab === "po_items") {
      setItemName("");
      setItemCategory("");
      setItemDefaultPrice("");
      setItemDefaultCostPrice("");
      setItemNote("");
    } else {
      setMarketerName("");
      setMarketerPhone("");
      setMarketerAddress("");
      setMarketerDefaultFee("");
      setMarketerNote("");
    }
    setModalVisible(true);
  };

  const openEditModal = item => {
    setEditingItem(item);
    if (activeTab === "orderers") {
      setOrdererName(item.name || "");
      setOrdererPhone(item.phone || "");
      setOrdererAddress(item.address || "");
      setOrdererNote(item.note || "");
    } else if (activeTab === "po_items") {
      setItemName(item.name || "");
      setItemCategory(item.category || "");
      setItemDefaultPrice(item.default_price ? String(item.default_price) : "");
      setItemDefaultCostPrice(item.default_cost_price ? String(item.default_cost_price) : "");
      setItemNote(item.note || "");
    } else {
      setMarketerName(item.name || "");
      setMarketerPhone(item.phone || "");
      setMarketerAddress(item.address || "");
      setMarketerDefaultFee(item.default_fee ? String(item.default_fee) : "");
      setMarketerNote(item.note || "");
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    const nowIso = new Date().toISOString();
    try {
      if (activeTab === "orderers") {
        if (!ordererName.trim()) {
          Alert.alert("Perhatian", "Nama Pemesan tidak boleh kosong.");
          return;
        }
        if (editingItem) {
          await exec(
            `UPDATE master_orderers SET name = ?, phone = ?, address = ?, note = ?, updated_at = ? WHERE id = ?`,
            [ordererName.trim(), ordererPhone.trim(), ordererAddress.trim(), ordererNote.trim(), nowIso, editingItem.id],
          );
        } else {
          await exec(
            `INSERT INTO master_orderers (name, phone, address, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [ordererName.trim(), ordererPhone.trim(), ordererAddress.trim(), ordererNote.trim(), nowIso, nowIso],
          );
        }
      } else if (activeTab === "po_items") {
        if (!itemName.trim()) {
          Alert.alert("Perhatian", "Nama Barang tidak boleh kosong.");
          return;
        }
        const price = parseInt(itemDefaultPrice, 10) || 0;
        const costPrice = parseInt(itemDefaultCostPrice, 10) || 0;
        if (editingItem) {
          await exec(
            `UPDATE master_po_items SET name = ?, category = ?, default_price = ?, default_cost_price = ?, note = ?, updated_at = ? WHERE id = ?`,
            [itemName.trim(), itemCategory.trim(), price, costPrice, itemNote.trim(), nowIso, editingItem.id],
          );
        } else {
          await exec(
            `INSERT INTO master_po_items (name, category, default_price, default_cost_price, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [itemName.trim(), itemCategory.trim(), price, costPrice, itemNote.trim(), nowIso, nowIso],
          );
        }
      } else {
        if (!marketerName.trim()) {
          Alert.alert("Perhatian", "Nama Marketer tidak boleh kosong.");
          return;
        }
        const fee = parseInt(marketerDefaultFee, 10) || 0;
        if (editingItem) {
          await exec(
            `UPDATE master_marketers SET name = ?, phone = ?, address = ?, default_fee = ?, note = ?, updated_at = ? WHERE id = ?`,
            [marketerName.trim(), marketerPhone.trim(), marketerAddress.trim(), fee, marketerNote.trim(), nowIso, editingItem.id],
          );
        } else {
          await exec(
            `INSERT INTO master_marketers (name, phone, address, default_fee, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [marketerName.trim(), marketerPhone.trim(), marketerAddress.trim(), fee, marketerNote.trim(), nowIso, nowIso],
          );
        }
      }
      setModalVisible(false);
      loadData();
    } catch (error) {
      console.log("SAVE MASTER DATA ERROR:", error);
      Alert.alert("Gagal", "Gagal menyimpan data master.");
    }
  };

  const handleDelete = item => {
    Alert.alert("Konfirmasi Hapus", `Apakah Anda yakin ingin menghapus "${item.name}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            const nowIso = new Date().toISOString();
            if (activeTab === "orderers") {
              await exec(`UPDATE master_orderers SET deleted_at = ?, updated_at = ? WHERE id = ?`, [nowIso, nowIso, item.id]);
            } else if (activeTab === "po_items") {
              await exec(`UPDATE master_po_items SET deleted_at = ?, updated_at = ? WHERE id = ?`, [nowIso, nowIso, item.id]);
            } else {
              await exec(`UPDATE master_marketers SET deleted_at = ?, updated_at = ? WHERE id = ?`, [nowIso, nowIso, item.id]);
            }
            loadData();
          } catch (e) {
            console.log("DELETE MASTER DATA ERROR:", e);
            Alert.alert("Gagal", "Gagal menghapus data master.");
          }
        },
      },
    ]);
  };

  const renderOrdererItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={20} color="#4F46E5" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {Boolean(item.phone) && <Text style={styles.cardSubtitle}>📞 {item.phone}</Text>}
          {Boolean(item.address) && <Text style={styles.cardSubtitle}>📍 {item.address}</Text>}
          {Boolean(item.note) && <Text style={styles.cardNote}>📝 {item.note}</Text>}
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openEditModal(item)}>
            <Ionicons name="create-outline" size={20} color="#4F46E5" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderPoItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatarContainer, { backgroundColor: "#EEF2FF" }]}>
          <Ionicons name="cube" size={20} color="#6366F1" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {Boolean(item.category) && <Text style={styles.badgeText}>{item.category}</Text>}
          <Text style={styles.priceText}>
            Harga Jual: Rp {formatCurrencyValue(item.default_price || 0)}
          </Text>
          {Boolean(item.default_cost_price) && (
            <Text style={styles.costPriceText}>
              Modal: Rp {formatCurrencyValue(item.default_cost_price || 0)}
            </Text>
          )}
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openEditModal(item)}>
            <Ionicons name="create-outline" size={20} color="#4F46E5" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderMarketerItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatarContainer, { backgroundColor: "#FEF3C7" }]}>
          <Ionicons name="briefcase" size={20} color="#D97706" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {Boolean(item.phone) && <Text style={styles.cardSubtitle}>📞 {item.phone}</Text>}
          {Boolean(item.address) && <Text style={styles.cardSubtitle}>📍 {item.address}</Text>}
          <Text style={[styles.priceText, { color: "#D97706" }]}>
            Fee Default: Rp {formatCurrencyValue(item.default_fee || 0)}
          </Text>
          {Boolean(item.note) && <Text style={styles.cardNote}>📝 {item.note}</Text>}
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openEditModal(item)}>
            <Ionicons name="create-outline" size={20} color="#4F46E5" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Master Data Pemesan, Barang & Marketer</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "orderers" && styles.tabButtonActive]}
          onPress={() => setActiveTab("orderers")}
        >
          <Ionicons
            name="people"
            size={16}
            color={activeTab === "orderers" ? "#4F46E5" : "#64748B"}
          />
          <Text
            style={[styles.tabText, activeTab === "orderers" && styles.tabTextActive]}
          >
            Pemesan
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "po_items" && styles.tabButtonActive]}
          onPress={() => setActiveTab("po_items")}
        >
          <Ionicons
            name="cube"
            size={16}
            color={activeTab === "po_items" ? "#4F46E5" : "#64748B"}
          />
          <Text
            style={[styles.tabText, activeTab === "po_items" && styles.tabTextActive]}
          >
            Barang PO
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "marketers" && styles.tabButtonActive]}
          onPress={() => setActiveTab("marketers")}
        >
          <Ionicons
            name="briefcase"
            size={16}
            color={activeTab === "marketers" ? "#4F46E5" : "#64748B"}
          />
          <Text
            style={[styles.tabText, activeTab === "marketers" && styles.tabTextActive]}
          >
            Marketer
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder={
            activeTab === "orderers"
              ? "Cari nama pemesan / telepon..."
              : activeTab === "po_items"
              ? "Cari nama barang / kategori..."
              : "Cari nama marketer / telepon..."
          }
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#94A3B8"
        />
        {Boolean(searchQuery) && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Content List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : (
        <FlatList
          data={activeTab === "orderers" ? orderers : activeTab === "po_items" ? poItems : marketers}
          keyExtractor={item => String(item.id)}
          renderItem={
            activeTab === "orderers"
              ? renderOrdererItem
              : activeTab === "po_items"
              ? renderPoItem
              : renderMarketerItem
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="file-tray-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyText}>Belum ada data master.</Text>
            </View>
          }
        />
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? "Edit Data Master" : "Tambah Data Master"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {activeTab === "orderers" ? (
                <>
                  <Text style={styles.label}>Nama Pemesan *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Contoh: Budi Santoso"
                    value={ordererName}
                    onChangeText={setOrdererName}
                  />

                  <Text style={styles.label}>No. Telepon / WhatsApp</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Contoh: 081234567890"
                    keyboardType="phone-pad"
                    value={ordererPhone}
                    onChangeText={setOrdererPhone}
                  />

                  <Text style={styles.label}>Alamat</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Alamat pemesan..."
                    multiline
                    value={ordererAddress}
                    onChangeText={setOrdererAddress}
                  />

                  <Text style={styles.label}>Catatan Tambahan</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Catatan..."
                    value={ordererNote}
                    onChangeText={setOrdererNote}
                  />
                </>
              ) : activeTab === "po_items" ? (
                <>
                  <Text style={styles.label}>Nama Barang PO *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Contoh: Baju Kaos Oversize"
                    value={itemName}
                    onChangeText={setItemName}
                  />

                  <Text style={styles.label}>Kategori</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Contoh: Pakaian, Sepatu, dll."
                    value={itemCategory}
                    onChangeText={setItemCategory}
                  />

                  <Text style={styles.label}>Harga Jual Default (Rp)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={itemDefaultPrice}
                    onChangeText={setItemDefaultPrice}
                  />

                  <Text style={styles.label}>Harga Modal Default (Rp)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={itemDefaultCostPrice}
                    onChangeText={setItemDefaultCostPrice}
                  />

                  <Text style={styles.label}>Catatan / Spesifikasi</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Catatan..."
                    value={itemNote}
                    onChangeText={setItemNote}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Nama Marketer *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Contoh: Andi Marketing"
                    value={marketerName}
                    onChangeText={setMarketerName}
                  />

                  <Text style={styles.label}>No. Telepon / WhatsApp</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Contoh: 081234567890"
                    keyboardType="phone-pad"
                    value={marketerPhone}
                    onChangeText={setMarketerPhone}
                  />

                  <Text style={styles.label}>Alamat</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Alamat marketer..."
                    multiline
                    value={marketerAddress}
                    onChangeText={setMarketerAddress}
                  />

                  <Text style={styles.label}>Fee Default (Rp)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={marketerDefaultFee}
                    onChangeText={setMarketerDefaultFee}
                  />

                  <Text style={styles.label}>Catatan Tambahan</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Catatan..."
                    value={marketerNote}
                    onChangeText={setMarketerNote}
                  />
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  addButton: {
    backgroundColor: "#4F46E5",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: "#F1F5F9",
  },
  tabButtonActive: { backgroundColor: "#EEF2FF" },
  tabText: { marginLeft: 6, fontSize: 14, fontWeight: "600", color: "#64748B" },
  tabTextActive: { color: "#4F46E5" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: "#0F172A" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  cardSubtitle: { fontSize: 13, color: "#475569", marginTop: 2 },
  cardNote: { fontSize: 12, color: "#64748B", fontStyle: "italic", marginTop: 2 },
  badgeText: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F5F9",
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  priceText: { fontSize: 13, fontWeight: "600", color: "#10B981", marginTop: 4 },
  costPriceText: { fontSize: 12, color: "#64748B", marginTop: 2 },
  actionButtons: { flexDirection: "row", alignItems: "center" },
  iconBtn: { padding: 6, marginLeft: 4 },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyText: { marginTop: 12, fontSize: 14, color: "#64748B" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  modalBody: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  textArea: { height: 70, textAlignVertical: "top" },
  modalFooter: { flexDirection: "row", justifyContent: "flex-end" },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginRight: 8 },
  cancelBtnText: { color: "#64748B", fontWeight: "600" },
  saveBtn: { backgroundColor: "#4F46E5", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  saveBtnText: { color: "#FFFFFF", fontWeight: "700" },
});
