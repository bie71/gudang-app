import React from "react";
import { TouchableOpacity, Text } from "react-native";

export default function ActionButton({ label, onPress, color = "#2563EB" }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ backgroundColor: color, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 }}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}
