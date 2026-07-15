import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  checkAndGenerateAlerts
} from "../services/notifications";

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = async (runCheck = false) => {
    try {
      if (runCheck) {
        await checkAndGenerateAlerts();
      }
      const list = await getNotifications();
      setNotifications(list);
    } catch (error) {
      console.log("Error loading notifications:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    async function setupDemo() {
      try {
        const { exec } = require("../services/database");
        const today = new Date();
        const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevYear = prevMonthDate.getFullYear();
        const prevMonth = String(prevMonthDate.getMonth() + 1).padStart(2, "0");
        const prevMonthStr = `${prevYear}-${prevMonth}`;

        const checkRes = await exec("SELECT COUNT(*) as count FROM bookkeeping_entries WHERE entry_date LIKE ?", [`${prevMonthStr}%`]);
        if (checkRes.rows.item(0).count === 0) {
          // Tambahkan data demo kas bulan lalu
          await exec("INSERT INTO bookkeeping_entries (name, amount, entry_date, note) VALUES (?, ?, ?, ?)", [
            "Penjualan Grosir Toko (Demo)", 12500000, `${prevMonthStr}-12`, "Pemasukan demo untuk perhitungan bulanan"
          ]);
          await exec("INSERT INTO bookkeeping_entries (name, amount, entry_date, note) VALUES (?, ?, ?, ?)", [
            "Belanja Supplier Bahan Baku (Demo)", -5400000, `${prevMonthStr}-18`, "Pengeluaran demo belanja bahan baku"
          ]);
          await exec("INSERT INTO bookkeeping_entries (name, amount, entry_date, note) VALUES (?, ?, ?, ?)", [
            "Biaya Listrik & Operasional (Demo)", -600000, `${prevMonthStr}-25`, "Pengeluaran demo biaya bulanan"
          ]);
          console.log("DEMO DATA KEUANGAN BULANAN BERHASIL DIBUAT UNTUK:", prevMonthStr);
        }
      } catch (err) {
        console.log("Error setting up bookkeeping demo:", err);
      }
    }
    
    setupDemo().then(() => {
      loadNotifications(true);
    });
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotifications(true);
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      await loadNotifications(false);
      Alert.alert("Sukses", "Semua notifikasi telah ditandai dibaca.");
    } catch (error) {
      Alert.alert("Gagal", "Gagal memperbarui status notifikasi.");
    }
  };

  const handleNotificationPress = async (item) => {
    if (item.is_read === 0) {
      await markNotificationAsRead(item.id);
      await loadNotifications(false);
    }

    const cleanMessage = item.message.replace(/\[[A-Z0-9-]{3,}\]/g, "").trim();
    Alert.alert(
      item.title,
      `${cleanMessage}\n\nWaktu: ${item.created_at}`,
      [{ text: "Tutup", style: "cancel" }]
    );
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case "barang":
        return { name: "cube-outline", color: "#F59E0B", bg: "#FEF3C7" }; // Amber
      case "po":
        return { name: "cart-outline", color: "#0EA5E9", bg: "#E0F2FE" }; // Sky
      case "keuangan":
        return { name: "wallet-outline", color: "#10B981", bg: "#D1FAE5" }; // Emerald
      default:
        return { name: "notifications-outline", color: "#6366F1", bg: "#EEF2FF" }; // Indigo
    }
  };

  const renderItem = ({ item }) => {
    const iconConfig = getCategoryIcon(item.category);
    const cleanMessage = item.message.replace(/\[[A-Z0-9-]{3,}\]/g, "").trim();

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleNotificationPress(item)}
        style={[
          styles.itemContainer,
          item.is_read === 0 ? styles.itemUnread : styles.itemRead
        ]}
      >
        <View style={[styles.iconWrapper, { backgroundColor: iconConfig.bg }]}>
          <Ionicons name={iconConfig.name} size={20} color={iconConfig.color} />
        </View>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.itemTitle, item.is_read === 0 ? styles.fontBold : styles.fontMedium]}>
              {item.title}
            </Text>
            {item.is_read === 0 && <View style={styles.unreadBadge} />}
          </View>
          <Text style={styles.itemMessage} numberOfLines={3}>
            {cleanMessage}
          </Text>
          <Text style={styles.itemTime}>
            {item.created_at}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 80 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Pemberitahuan</Text>
        <View style={{ width: 80, alignItems: "flex-end" }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleMarkAllRead}
            disabled={!notifications.some(n => n.is_read === 0)}
            style={[
              styles.headerTextButton,
              { opacity: notifications.some(n => n.is_read === 0) ? 1 : 0.4 }
            ]}
          >
            <Text style={styles.headerTextButtonText}>Baca Semua</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D9488" />
        </View>
      ) : notifications.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={64} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Tidak ada pemberitahuan</Text>
              <Text style={styles.emptyText}>Semua notifikasi dan peringatan penting toko Anda akan muncul di sini.</Text>
            </View>
          }
          contentContainerStyle={{ flexGrow: 1 }}
        />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContainer}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0"
  },
  headerButton: {
    padding: 4,
    width: 32
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center"
  },
  headerTextButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 8
  },
  headerTextButtonText: {
    color: "#0D9488",
    fontWeight: "700",
    fontSize: 12
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  listContainer: {
    padding: 16,
    gap: 12,
    paddingBottom: 40
  },
  itemContainer: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "flex-start",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1
  },
  itemUnread: {
    backgroundColor: "#fff",
    borderColor: "#E2E8F0"
  },
  itemRead: {
    backgroundColor: "#F8FAFC",
    borderColor: "#F1F5F9",
    opacity: 0.8
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12
  },
  textContainer: {
    flex: 1
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  itemTitle: {
    fontSize: 14,
    color: "#1E293B"
  },
  fontBold: {
    fontWeight: "700"
  },
  fontMedium: {
    fontWeight: "500"
  },
  unreadBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444"
  },
  itemMessage: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
    marginBottom: 6
  },
  itemTime: {
    fontSize: 11,
    color: "#94A3B8"
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#475569",
    marginTop: 16,
    marginBottom: 6
  },
  emptyText: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 18
  }
});
