import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMasterData } from "../hooks/useMasterData";
import { Card, SearchBar, FilterChip, Header, EmptyState } from "../components/ui";
import Input from "../components/Input";
import ActionButton from "../components/ActionButton";
import { formatCurrencyValue, formatNumberInput, parseNumberInput } from "../utils/format";

const TABS = [
  { key: "orderers", label: "Pemesan", icon: "person" },
  { key: "po_items", label: "Barang PO", icon: "cube" },
  { key: "marketers", label: "Marketer", icon: "people" },
];

export default function MasterDataScreen({ navigation }) {
  const {
    activeTab,
    setActiveTab,
    loading,
    searchQuery,
    setSearchQuery,
    orderers,
    poItems,
    marketers,
    refresh,
    deleteItem,
    createOrderer,
    updateOrderer,
    createPoItem,
    updatePoItem,
    createMarketer,
    updateMarketer,
  } = useMasterData();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [defaultCostPrice, setDefaultCostPrice] = useState("");
  const [defaultFee, setDefaultFee] = useState("");

  const openAddModal = () => {
    setEditingItem(null);
    setName("");
    setPhone("");
    setAddress("");
    setNote("");
    setCategory("");
    setDefaultPrice("");
    setDefaultCostPrice("");
    setDefaultFee("");
    setModalVisible(true);
  };

  const openEditModal = item => {
    setEditingItem(item);
    setName(item.name || "");
    setPhone(item.phone || "");
    setAddress(item.address || "");
    setNote(item.note || "");
    setCategory(item.category || "");
    setDefaultPrice(item.default_price ? formatNumberInput(String(item.default_price)) : "");
    setDefaultCostPrice(item.default_cost_price ? formatNumberInput(String(item.default_cost_price)) : "");
    setDefaultFee(item.default_fee ? formatNumberInput(String(item.default_fee)) : "");
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Validasi Gagal", "Nama wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      if (activeTab === "orderers") {
        if (editingItem) {
          await updateOrderer(editingItem.id, { name, phone, address, note });
        } else {
          await createOrderer({ name, phone, address, note });
        }
      } else if (activeTab === "po_items") {
        const price = parseNumberInput(defaultPrice);
        const costPrice = parseNumberInput(defaultCostPrice);
        if (editingItem) {
          await updatePoItem(editingItem.id, { name, category, defaultPrice: price, defaultCostPrice: costPrice, note });
        } else {
          await createPoItem({ name, category, defaultPrice: price, defaultCostPrice: costPrice, note });
        }
      } else {
        const fee = parseNumberInput(defaultFee);
        if (editingItem) {
          await updateMarketer(editingItem.id, { name, phone, address, defaultFee: fee, note });
        } else {
          await createMarketer({ name, phone, address, defaultFee: fee, note });
        }
      }

      setModalVisible(false);
      refresh();
      Alert.alert("Sukses", `Data ${editingItem ? "diperbarui" : "ditambahkan"}.`);
    } catch (e) {
      console.log("SAVE MASTER ERROR:", e);
      Alert.alert("Gagal", "Terjadi kesalahan saat menyimpan data master.");
    } finally {
      setSaving(false);
    }
  };

  const getCurrentList = () => {
    if (activeTab === "orderers") return orderers;
    if (activeTab === "po_items") return poItems;
    return marketers;
  };

  const renderItem = ({ item }) => {
    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Ionicons
              name={activeTab === "orderers" ? "person" : activeTab === "po_items" ? "cube" : "people"}
              size={18}
              color="#0D9488"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>{item.name}</Text>
            {Boolean(item.phone) && <Text style={styles.itemSub}>📞 {item.phone}</Text>}
            {Boolean(item.address) && <Text style={styles.itemSub}>📍 {item.address}</Text>}
            {Boolean(item.category) && <Text style={styles.itemSub}>🏷️ {item.category}</Text>}
            {Boolean(item.default_price > 0) && (
              <Text style={styles.itemSub}>
                💰 Harga Jual: {formatCurrencyValue(item.default_price)}
              </Text>
            )}
            {Boolean(item.default_fee > 0) && (
              <Text style={styles.itemSub}>
                🎁 Komisi: {formatCurrencyValue(item.default_fee)}
              </Text>
            )}
            {Boolean(item.note) && <Text style={styles.itemNote}>📝 {item.note}</Text>}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
              <Ionicons name="create-outline" size={18} color="#0D9488" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteItem(item)} style={[styles.actionBtn, styles.deleteBtn]}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      <Header
        title="Master Data"
        subtitle="Kelola pemesan, barang PO, & marketer"
        onBack={() => navigation.goBack()}
        rightActions={
          <TouchableOpacity
            onPress={openAddModal}
            activeOpacity={0.7}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {TABS.map(tab => (
          <FilterChip
            key={tab.key}
            label={tab.label}
            selected={activeTab === tab.key}
            onPress={() => setActiveTab(tab.key)}
          />
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={`Cari data ${TABS.find(t => t.key === activeTab)?.label.toLowerCase()}...`}
        />
      </View>

      {/* List */}
      <FlatList
        data={getCurrentList()}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={refresh}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="layers-outline"
              title="Belum Ada Data Master"
              description="Data yang Anda tambahkan di sini akan otomatis muncul sebagai autocomplete pada form PO."
              actionLabel="Tambah Data"
              onAction={openAddModal}
            />
          )
        }
      />

      {/* Form Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", alignItems: "center" }}
          >
            <Pressable style={styles.dialog} onPress={e => e.stopPropagation()}>
              <Text style={styles.dialogTitle}>
                {editingItem ? "Edit Data Master" : "Tambah Data Master"}
              </Text>

              <ScrollView style={{ maxHeight: 400 }}>
                <Input
                  label="Nama *"
                  placeholder="Nama pemesan / barang / marketer"
                  value={name}
                  onChangeText={setName}
                />

                {activeTab !== "po_items" && (
                  <>
                    <Input
                      label="Nomor Telepon / WA"
                      placeholder="08..."
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={setPhone}
                    />
                    <Input
                      label="Alamat"
                      placeholder="Alamat lengkap"
                      value={address}
                      onChangeText={setAddress}
                    />
                  </>
                )}

                {activeTab === "po_items" && (
                  <>
                    <Input
                      label="Kategori"
                      placeholder="Pakaian, Hijab, dsb"
                      value={category}
                      onChangeText={setCategory}
                    />
                    <Input
                      label="Harga Jual Standar (Rp)"
                      placeholder="0"
                      keyboardType="numeric"
                      value={defaultPrice}
                      onChangeText={val => setDefaultPrice(formatNumberInput(val))}
                    />
                    <Input
                      label="Harga Modal Standar (Rp)"
                      placeholder="0"
                      keyboardType="numeric"
                      value={defaultCostPrice}
                      onChangeText={val => setDefaultCostPrice(formatNumberInput(val))}
                    />
                  </>
                )}

                {activeTab === "marketers" && (
                  <Input
                    label="Default Komisi (Rp)"
                    placeholder="0"
                    keyboardType="numeric"
                    value={defaultFee}
                    onChangeText={val => setDefaultFee(formatNumberInput(val))}
                  />
                )}

                <Input
                  label="Catatan"
                  placeholder="Catatan tambahan (opsional)"
                  value={note}
                  onChangeText={setNote}
                />
              </ScrollView>

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelText}>Batal</Text>
                </TouchableOpacity>

                <ActionButton
                  label="Simpan"
                  onPress={handleSave}
                  loading={saving}
                  color="#0D9488"
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  searchWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 10,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(13, 148, 136, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  itemSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  itemNote: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 3,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  deleteBtn: {
    backgroundColor: "#FEE2E2",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 16,
    textAlign: "center",
  },
  modalBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 12,
  },
  cancelText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "700",
  },
});
