import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import TabsNavigator from "./TabsNavigator";
import { AddItemScreen, ItemDetailScreen, StockMoveScreen } from "../screens/Items";
import {
  AddPurchaseOrderScreen,
  EditPurchaseOrderScreen,
  PurchaseOrderDetailScreen,
} from "../screens/purchaseOrders";
import { AddBookkeepingScreen, BookkeepingDetailScreen, BookkeepingHistoryScreen } from "../screens/bookkeeping";
import HistoryScreen from "../screens/HistoryScreen";
import DataManagementScreen from "../screens/DataManagementScreen";
import GoogleSheetsScreen from "../screens/GoogleSheetsScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="History" component={HistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: "Detail Barang" }} />
      <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: "Tambah Barang" }} />
      <Stack.Screen name="StockMove" component={StockMoveScreen} options={{ title: "Pergerakan Stok" }} />
      <Stack.Screen name="AddPurchaseOrder" component={AddPurchaseOrderScreen} options={{ title: "Tambah PO" }} />
      <Stack.Screen name="EditPurchaseOrder" component={EditPurchaseOrderScreen} options={{ title: "Edit PO" }} />
      <Stack.Screen name="PurchaseOrderDetail" component={PurchaseOrderDetailScreen} options={{ title: "Detail PO" }} />
      <Stack.Screen
        name="BookkeepingDetail"
        component={BookkeepingDetailScreen}
        options={{ title: "Detail Pembukuan" }}
      />
      <Stack.Screen
        name="AddBookkeeping"
        component={AddBookkeepingScreen}
        options={{ title: "Tambah Pembukuan" }}
      />
      <Stack.Screen
        name="BookkeepingHistory"
        component={BookkeepingHistoryScreen}
        options={{ title: "Riwayat Pembukuan" }}
      />
      <Stack.Screen
        name="DataManagement"
        component={DataManagementScreen}
        options={{ title: "Manajemen Data" }}
      />
      <Stack.Screen
        name="GoogleSheets"
        component={GoogleSheetsScreen}
        options={{ title: "Google Sheets CRUD", headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Pemberitahuan", headerShown: false }}
      />
      <Stack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ title: "Laporan & Analisis", headerShown: false }}
      />
    </Stack.Navigator>
  );
}
