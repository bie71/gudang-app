import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function StatCard({ label, value, helper, icon, iconColor, backgroundColor, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flexBasis: "48%",
        flexGrow: 1,
        minWidth: 160,
        backgroundColor: "#fff",
        padding: 18,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 4,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 16,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A", marginTop: 6, letterSpacing: -0.3 }}>
        {value}
      </Text>
      {helper ? <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 6, fontWeight: "500" }}>{helper}</Text> : null}
    </TouchableOpacity>
  );
}
