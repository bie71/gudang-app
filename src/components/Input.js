import React from "react";
import { View, Text, TextInput } from "react-native";

export default function Input({ label, style, placeholderTextColor = "#94A3B8", ...props }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ marginBottom: 8, color: "#475569", fontWeight: "600", fontSize: 13, letterSpacing: 0.1 }}>
        {label}
      </Text>
      <TextInput
        {...props}
        placeholderTextColor={placeholderTextColor}
        style={{
          backgroundColor: "#fff",
          borderWidth: 1.5,
          borderColor: "#E2E8F0",
          borderRadius: 16,
          paddingHorizontal: 16,
          height: 52,
          fontSize: 16,
          color: "#0F172A",
          ...(style || {}),
        }}
      />
    </View>
  );
}
