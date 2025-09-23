import React from "react";
import { View, Text } from "react-native";

export default function DetailRow({ label, value, bold = false, multiline = false }) {
  return (
    <View>
      <Text style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: "#0F172A", fontWeight: bold ? "700" : "500", lineHeight: multiline ? 22 : 18 }}>{value}</Text>
    </View>
  );
}
