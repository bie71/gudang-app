import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";

export default function FilterChip({
  label,
  selected = false,
  onPress,
  badgeCount,
  style,
  textStyle,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        selected ? styles.chipSelected : styles.chipUnselected,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          selected ? styles.textSelected : styles.textUnselected,
          textStyle,
        ]}
      >
        {label}
        {badgeCount != null ? ` (${badgeCount})` : ""}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: "#0D9488",
    borderColor: "#0D9488",
  },
  chipUnselected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E2E8F0",
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
  },
  textSelected: {
    color: "#FFFFFF",
  },
  textUnselected: {
    color: "#64748B",
  },
});
