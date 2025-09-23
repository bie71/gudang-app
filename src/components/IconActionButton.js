import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function IconActionButton({
  icon,
  label,
  backgroundColor = "#EEF2FF",
  iconColor = "#2563EB",
  onPress,
  onPressIn,
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPressIn={onPressIn} onPress={onPress} style={{ alignItems: "center", width: 72 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
          shadowColor: "#0F172A",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={{ fontSize: 11, textAlign: "center", color: "#475569" }}>{label}</Text>
    </TouchableOpacity>
  );
}
