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
    <TouchableOpacity 
      activeOpacity={0.7} 
      onPressIn={onPressIn} 
      onPress={onPress} 
      style={{ alignItems: "center", width: 76 }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 20,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <Text style={{ fontSize: 11, textAlign: "center", color: "#475569", fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );
}
