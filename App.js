import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RootNavigator from "./src/navigation/RootNavigator";
import { initDb } from "./src/services/database";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();


export default function App() {
  useEffect(() => {
    initDb().catch(error => console.log("DB INIT ERROR:", error));
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
