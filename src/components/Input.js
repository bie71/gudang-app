import React from "react";
import { View, Text, TextInput } from "react-native";

export default function Input({ label, style, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ marginBottom: 6, color: "#475569" }}>{label}</Text>
      <TextInput
        {...props}
        style={{
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: "#E5E7EB",
          borderRadius: 12,
          paddingHorizontal: 12,
          height: 44,
          ...(style || {}),
        }}
      />
    </View>
  );
}
