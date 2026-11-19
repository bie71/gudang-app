import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function Header({
  title,
  subtitle,
  onBack,
  rightActions,
  style,
  dark = true,
}) {
  const textColor = dark ? "#FFFFFF" : "#0F172A";
  const subTextColor = dark ? "#94A3B8" : "#64748B";

  return (
    <View style={[styles.container, dark && styles.darkContainer, style]}>
      <View style={styles.leftRow}>
        {Boolean(onBack) && (
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.7}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={textColor}
            />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
          {Boolean(subtitle) && (
            <Text style={[styles.subtitle, { color: subTextColor }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {Boolean(rightActions) && (
        <View style={styles.rightRow}>{rightActions}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  darkContainer: {
    backgroundColor: "#0F172A",
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  backBtn: {
    marginRight: 10,
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
