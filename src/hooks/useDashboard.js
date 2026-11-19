import { useState, useEffect, useCallback } from "react";
import {
  getDashboardMetrics,
  getDashboardPriorityAlerts,
  getDashboardRecentPOs,
  getDashboardCategoryStats,
} from "../repositories/dashboardRepository";
import { getUnreadNotificationCount, checkAndGenerateAlerts } from "../services/notifications";
import { eventBus, APP_EVENTS } from "../services/events";

export function useDashboard() {
  const [metrics, setMetrics] = useState({
    totalStock: 0,
    totalItems: 0,
    totalValue: 0,
    totalCategories: 0,
    inQtyToday: 0,
    outQtyToday: 0,
    poCount: 0,
    poProgress: 0,
    poDone: 0,
    poTotalValue: 0,
    bookkeepingCount: 0,
    bookkeepingTotal: 0,
  });

  const [priorityItems, setPriorityItems] = useState([]);
  const [urgentPOs, setUrgentPOs] = useState([]);
  const [recentPOs, setRecentPOs] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Jalankan pengecekan alert otomatis
      checkAndGenerateAlerts().catch(() => {});

      const [metricsData, alertsData, recentData, categoriesData, unread] = await Promise.all([
        getDashboardMetrics(),
        getDashboardPriorityAlerts(),
        getDashboardRecentPOs(5),
        getDashboardCategoryStats(6),
        getUnreadNotificationCount(),
      ]);

      setMetrics(metricsData);
      setPriorityItems(alertsData.lowStockItems);
      setUrgentPOs(alertsData.urgentPOs);
      setRecentPOs(recentData);
      setCategoryStats(categoriesData);
      setUnreadCount(unread);
    } catch (error) {
      console.log("LOAD DASHBOARD ERROR:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to changes across the app for real-time reactivity
  useEffect(() => {
    const unsubPO = eventBus.subscribe(APP_EVENTS.PO_CHANGED, () => {
      loadData(false);
    });
    const unsubItems = eventBus.subscribe(APP_EVENTS.ITEMS_CHANGED, () => {
      loadData(false);
    });
    return () => {
      unsubPO();
      unsubItems();
    };
  }, [loadData]);

  const refresh = useCallback(() => {
    return loadData(true);
  }, [loadData]);

  return {
    metrics,
    priorityItems,
    urgentPOs,
    recentPOs,
    categoryStats,
    unreadCount,
    loading,
    refreshing,
    refresh,
  };
}
