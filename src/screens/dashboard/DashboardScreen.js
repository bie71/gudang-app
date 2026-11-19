import React, { useCallback } from "react";
import {
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useDashboard } from "../../hooks/useDashboard";
import DashboardHeader from "./DashboardHeader";
import DashboardQuickMenu from "./DashboardQuickMenu";
import DashboardMetricsGrid from "./DashboardMetricsGrid";
import DashboardPriorityAlerts from "./DashboardPriorityAlerts";
import DashboardRecentOrders from "./DashboardRecentOrders";
import DashboardCategoryStats from "./DashboardCategoryStats";

export default function DashboardScreen({ navigation }) {
  const {
    metrics,
    priorityItems,
    urgentPOs,
    recentPOs,
    categoryStats,
    unreadCount,
    refreshing,
    refresh,
  } = useDashboard();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      {/* 1. Clean & Proper Header */}
      <DashboardHeader
        storeName="Warehouse Manager"
        unreadCount={unreadCount}
        onNotificationsPress={() => navigation.navigate("Notifications")}
        onSettingsPress={() => navigation.navigate("DataManagement")}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={["#0D9488"]}
            tintColor="#0D9488"
          />
        }
      >
        {/* Quick Operational Shortcuts */}
        <DashboardQuickMenu
          onNavigateBackup={() => navigation.navigate("DataManagement")}
          onNavigateMasterData={() => navigation.navigate("MasterData")}
          onNavigateHistory={() => navigation.navigate("History")}
          onNavigateAnalytics={() => navigation.navigate("Analytics")}
        />

        {/* 2. Top Metric Cards (Stok, Valuasi, PO, Kas) */}
        <DashboardMetricsGrid
          metrics={metrics}
          onNavigateItems={() => navigation.navigate("Barang")}
          onNavigatePO={() => navigation.navigate("PO")}
          onNavigateBookkeeping={() => navigation.navigate("Pembukuan")}
        />

        {/* 3. Priority Low Stock & Urgent POs */}
        <DashboardPriorityAlerts
          lowStockItems={priorityItems}
          urgentPOs={urgentPOs}
          onNavigateItems={() => navigation.navigate("Barang")}
          onNavigatePO={() => navigation.navigate("PO")}
          onItemPress={item => navigation.navigate("ItemDetail", { id: item.id })}
          onPOPress={order => navigation.navigate("PurchaseOrderDetail", { id: order.id })}
        />

        {/* 4. Recent POs */}
        <DashboardRecentOrders
          orders={recentPOs}
          onNavigatePO={() => navigation.navigate("PO")}
          onOrderPress={order => navigation.navigate("PurchaseOrderDetail", { id: order.id })}
        />

        {/* 5. Category Distribution Breakdown */}
        <DashboardCategoryStats
          categories={categoryStats}
          onNavigateItems={() => navigation.navigate("Barang")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingBottom: 40,
  },
});
