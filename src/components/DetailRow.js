import React from "react";
import { View, Text } from "react-native";

export default function DetailRow({ label, value, bold = false, multiline = false }) {
  return (
    <View>
      <Text style={{ color: "#64748B", fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <Text style={{ color: "#0F172A", fontWeight: bold ? "700" : "600", fontSize: 15, lineHeight: multiline ? 24 : 20 }}>{value}</Text>
    </View>
  );
}
