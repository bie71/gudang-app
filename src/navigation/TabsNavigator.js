import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DashboardScreen from "../screens/DashboardScreen";
import { ItemsScreen, AddItemScreen, ItemDetailScreen, StockMoveScreen } from "../screens/Items";
import {
  PurchaseOrdersScreen,
  AddPurchaseOrderScreen,
  EditPurchaseOrderScreen,
  PurchaseOrderDetailScreen,
} from "../screens/purchaseOrders";
import { BookkeepingScreen, AddBookkeepingScreen, BookkeepingDetailScreen, BookkeepingHistoryScreen } from "../screens/bookkeeping";
import { CalculatorScreen } from "../screens/CalculatorScreen";

const Tab = createBottomTabNavigator();

const DashboardStack = createNativeStackNavigator();
const BarangStack = createNativeStackNavigator();
const POStack = createNativeStackNavigator();
const PembukuanStack = createNativeStackNavigator();

function DashboardStackNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerBackTitle: "Kembali" }}>
      <DashboardStack.Screen name="DashboardMain" component={DashboardScreen} options={{ headerShown: false }} />
      <DashboardStack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: "Detail Barang" }} />
      <DashboardStack.Screen name="PurchaseOrderDetail" component={PurchaseOrderDetailScreen} options={{ title: "Detail PO" }} />
      <DashboardStack.Screen name="BookkeepingDetail" component={BookkeepingDetailScreen} options={{ title: "Detail Pembukuan" }} />
    </DashboardStack.Navigator>
  );
}

function BarangStackNavigator() {
  return (
    <BarangStack.Navigator screenOptions={{ headerBackTitle: "Kembali" }}>
      <BarangStack.Screen name="BarangMain" component={ItemsScreen} options={{ headerShown: false }} />
      <BarangStack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: "Detail Barang" }} />
      <BarangStack.Screen name="AddItem" component={AddItemScreen} options={{ title: "Tambah Barang" }} />
      <BarangStack.Screen name="StockMove" component={StockMoveScreen} options={{ title: "Pergerakan Stok" }} />
    </BarangStack.Navigator>
  );
}

function POStackNavigator() {
  return (
    <POStack.Navigator screenOptions={{ headerBackTitle: "Kembali" }}>
      <POStack.Screen name="POMain" component={PurchaseOrdersScreen} options={{ headerShown: false }} />
      <POStack.Screen name="PurchaseOrderDetail" component={PurchaseOrderDetailScreen} options={{ title: "Detail PO" }} />
      <POStack.Screen name="AddPurchaseOrder" component={AddPurchaseOrderScreen} options={{ title: "Tambah PO" }} />
      <POStack.Screen name="EditPurchaseOrder" component={EditPurchaseOrderScreen} options={{ title: "Edit PO" }} />
    </POStack.Navigator>
  );
}

function PembukuanStackNavigator() {
  return (
    <PembukuanStack.Navigator screenOptions={{ headerBackTitle: "Kembali" }}>
      <PembukuanStack.Screen name="PembukuanMain" component={BookkeepingScreen} options={{ headerShown: false }} />
      <PembukuanStack.Screen name="BookkeepingDetail" component={BookkeepingDetailScreen} options={{ title: "Detail Pembukuan" }} />
      <PembukuanStack.Screen name="AddBookkeeping" component={AddBookkeepingScreen} options={{ title: "Tambah Pembukuan" }} />
      <PembukuanStack.Screen name="BookkeepingHistory" component={BookkeepingHistoryScreen} options={{ title: "Riwayat Pembukuan" }} />
    </PembukuanStack.Navigator>
  );
}

export default function TabsNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#0D9488",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarHideOnKeyboard: true,
        tabBarStyle: { 
          backgroundColor: "#fff", 
          borderTopWidth: 1,
          borderTopColor: "#F1F5F9",
          height: 64 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 10,
        },
        tabBarLabelStyle: { fontWeight: "600", fontSize: 11, marginTop: 2 },
        tabBarIcon: ({ color, size, focused }) => {
          let iconName = "ellipse-outline";
          if (route.name === "Dashboard") {
            iconName = focused ? "home" : "home-outline";
          } else if (route.name === "Barang") {
            iconName = focused ? "cube" : "cube-outline";
          } else if (route.name === "PO") {
            iconName = focused ? "document-text" : "document-text-outline";
          } else if (route.name === "Pembukuan") {
            iconName = focused ? "wallet" : "wallet-outline";
          } else if (route.name === "Calculator") {
            iconName = focused ? "calculator" : "calculator-outline";
          }
          return <Ionicons name={iconName} size={size ?? 22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStackNavigator} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Barang" component={BarangStackNavigator} options={{ tabBarLabel: "Gudang" }} />
      <Tab.Screen name="PO" component={POStackNavigator} options={{ tabBarLabel: "PO" }} />
      <Tab.Screen name="Pembukuan" component={PembukuanStackNavigator} options={{ tabBarLabel: "Keuangan" }} />
      <Tab.Screen name="Calculator" component={CalculatorScreen} options={{ tabBarLabel: "Kalkulator" }} />
    </Tab.Navigator>
  );
}
