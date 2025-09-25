import React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";

export default function ActionButton({
  label,
  onPress,
  color = "#2563EB",
  disabled = false,
  loading = false,
  textColor = "#fff",
}) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={{
        backgroundColor: color,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        opacity: isDisabled ? 0.6 : 1,
      }}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={{ color: textColor, fontWeight: "700" }}>{label}</Text>}
    </TouchableOpacity>
  );
}
