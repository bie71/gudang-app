import React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";

export default function ActionButton({
  label,
  onPress,
  color = "#2563EB",
  disabled = false,
  loading = false,
  textColor = "#fff",
  style = {},
}) {
  const isDisabled = disabled || loading;
  
  // Determine if it is a secondary/outline or light button to adjust shadows
  const isOutline = color === "#fff" || color === "transparent" || color === "rgba(255,255,255,0.15)" || color === "rgba(255,255,255,0.2)";
  
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={{
        backgroundColor: color,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        opacity: isDisabled ? 0.6 : 1,
        shadowColor: isOutline ? "transparent" : "#2563EB",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isOutline ? 0 : 0.2,
        shadowRadius: 12,
        elevation: isOutline ? 0 : 4,
        ...style,
      }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={{ color: textColor, fontWeight: "600", fontSize: 14, letterSpacing: 0.1 }}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
