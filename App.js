import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import RootNavigator from "./src/navigation/RootNavigator";
import { initDb } from "./src/services/database";


export default function App() {
  const [isSplashLoading, setIsSplashLoading] = useState(true);

  useEffect(() => {
    initDb().catch(error => console.log("DB INIT ERROR:", error));

    const timer = setTimeout(() => {
      setIsSplashLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  if (isSplashLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0F172A",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 22,
            backgroundColor: "rgba(13, 148, 136, 0.15)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            borderWidth: 1.5,
            borderColor: "#0D9488",
          }}
        >
          <Ionicons name="cube" size={42} color="#0D9488" />
        </View>

        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: "#FFFFFF",
            letterSpacing: -0.5,
          }}
        >
          BukuToko
        </Text>

        <Text
          style={{
            fontSize: 13,
            color: "#64748B",
            marginTop: 6,
            fontWeight: "500",
          }}
        >
          Sistem Gudang & Toko Pintar
        </Text>

        <ActivityIndicator
          size="small"
          color="#0D9488"
          style={{ marginTop: 40 }}
        />

        <View style={{ position: "absolute", bottom: 40, alignItems: "center" }}>
          <Text style={{ fontSize: 10, color: "#475569", fontWeight: "700", letterSpacing: 2 }}>
            BY BIE7
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
