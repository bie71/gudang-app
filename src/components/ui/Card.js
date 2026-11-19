import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";

export default function Card({
  children,
  onPress,
  style,
  activeOpacity = 0.7,
  variant = "elevated", // "elevated" | "flat" | "outlined"
}) {
  const isPressable = typeof onPress === "function";
  const Container = isPressable ? TouchableOpacity : View;

  const containerStyles = [
    styles.card,
    variant === "elevated" && styles.elevated,
    variant === "flat" && styles.flat,
    variant === "outlined" && styles.outlined,
    style,
  ];

  const pressProps = isPressable
    ? {
        onPress,
        activeOpacity,
      }
    : {};

  return (
    <Container style={containerStyles} {...pressProps}>
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  elevated: {
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  flat: {
    backgroundColor: "#F8FAFC",
    borderColor: "transparent",
  },
  outlined: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
  },
});
