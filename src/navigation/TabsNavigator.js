import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import DashboardScreen from "../screens/DashboardScreen";
import { ItemsScreen } from "../screens/Items";
import { PurchaseOrdersScreen } from "../screens/purchaseOrders";
import HistoryScreen from "../screens/HistoryScreen";
import { BookkeepingScreen } from "../screens/bookkeeping";

const Tab = createBottomTabNavigator();

export default function TabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarHideOnKeyboard: true,
        tabBarStyle: { 
          backgroundColor: "#fff", 
          borderTopWidth: 0,
          height: 64,
          paddingBottom: 8,
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 10,
        },
        tabBarLabelStyle: { fontWeight: "600" },
        tabBarIcon: ({ color, size }) => {
          let iconName = "ellipse-outline";
          if (route.name === "Dashboard") iconName = "grid-outline";
          else if (route.name === "Barang") iconName = "cube-outline";
          else if (route.name === "PO") iconName = "cart-outline";
          else if (route.name === "Pembukuan") iconName = "book-outline";
          else if (route.name === "History") iconName = "time-outline";
          return <Ionicons name={iconName} size={size ?? 22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Barang" component={ItemsScreen} />
      <Tab.Screen name="PO" component={PurchaseOrdersScreen} />
      <Tab.Screen name="Pembukuan" component={BookkeepingScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}
