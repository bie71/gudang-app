import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import TabsNavigator from "./TabsNavigator";
import { AddItemScreen, StockMoveScreen } from "../screens/Items";
import {
  AddPurchaseOrderScreen,
  EditPurchaseOrderScreen,
  PurchaseOrderDetailScreen,
} from "../screens/purchaseOrders";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: "Tambah Barang" }} />
      <Stack.Screen name="StockMove" component={StockMoveScreen} options={{ title: "Pergerakan Stok" }} />
      <Stack.Screen name="AddPurchaseOrder" component={AddPurchaseOrderScreen} options={{ title: "Tambah PO" }} />
      <Stack.Screen name="EditPurchaseOrder" component={EditPurchaseOrderScreen} options={{ title: "Edit PO" }} />
      <Stack.Screen name="PurchaseOrderDetail" component={PurchaseOrderDetailScreen} options={{ title: "Detail PO" }} />
    </Stack.Navigator>
  );
}
