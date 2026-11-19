import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function DashboardQuickMenu({
  onNavigateBackup,
  onNavigateMasterData,
  onNavigateHistory,
  onNavigateAnalytics,
}) {
  const menus = [
    {
      key: "backup",
      title: "Backup & Sync",
      subtitle: "Google Drive",
      icon: "cloud-upload",
      iconColor: "#0284C7",
      bgColor: "#E0F2FE",
      onPress: onNavigateBackup,
    },
    {
      key: "master",
      title: "Master Data",
      subtitle: "Pembeli & Marketer",
      icon: "people",
      iconColor: "#D97706",
      bgColor: "#FEF3C7",
      onPress: onNavigateMasterData,
    },
    {
      key: "history",
      title: "Riwayat Stok",
      subtitle: "Keluar Masuk",
      icon: "time",
      iconColor: "#0D9488",
      bgColor: "#CCFBF1",
      onPress: onNavigateHistory,
    },
    {
      key: "analytics",
      title: "Laporan Bisnis",
      subtitle: "Profit & Analitik",
      icon: "bar-chart",
      iconColor: "#4F46E5",
      bgColor: "#EEF2FF",
      onPress: onNavigateAnalytics,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>PENGATURAN & PINTASAN</Text>
      <View style={styles.grid}>
        {menus.map(item => (
          <TouchableOpacity
            key={item.key}
            onPress={item.onPress}
            activeOpacity={0.7}
            style={styles.card}
          >
            <View style={[styles.iconBox, { backgroundColor: item.bgColor }]}>
              <Ionicons name={item.icon} size={20} color={item.iconColor} />
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    gap: 10,
  },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 2,
    textAlign: "center",
  },
});
