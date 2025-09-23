import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function StatCard({ label, value, helper, icon, iconColor, backgroundColor, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flexBasis: "48%",
        flexGrow: 1,
        minWidth: 160,
        backgroundColor: "#fff",
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        shadowColor: "#0F172A",
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A", marginTop: 4 }}>{value}</Text>
      {helper ? <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 6 }}>{helper}</Text> : null}
    </TouchableOpacity>
  );
}
