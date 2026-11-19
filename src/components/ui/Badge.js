import React from "react";
import { View, Text, StyleSheet } from "react-native";

const VARIANT_STYLES = {
  success: {
    bg: "#DCFCE7",
    text: "#15803D",
    border: "#BBF7D0",
  },
  warning: {
    bg: "#FEF3C7",
    text: "#B45309",
    border: "#FDE68A",
  },
  danger: {
    bg: "#FEE2E2",
    text: "#B91C1C",
    border: "#FECACA",
  },
  info: {
    bg: "#E0F2FE",
    text: "#0369A1",
    border: "#BAE6FD",
  },
  primary: {
    bg: "rgba(13, 148, 136, 0.12)",
    text: "#0D9488",
    border: "rgba(13, 148, 136, 0.25)",
  },
  neutral: {
    bg: "#F1F5F9",
    text: "#475569",
    border: "#E2E8F0",
  },
};

export default function Badge({
  label,
  variant = "neutral",
  size = "medium",
  style,
  textStyle,
}) {
  const currentVariant = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const isSmall = size === "small";

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: currentVariant.bg,
          borderColor: currentVariant.border,
          paddingVertical: isSmall ? 2 : 4,
          paddingHorizontal: isSmall ? 8 : 10,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: currentVariant.text,
            fontSize: isSmall ? 10 : 12,
          },
          textStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
