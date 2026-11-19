import React from "react";
import { View, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function SearchBar({
  value,
  onChangeText,
  onClear,
  placeholder = "Cari...",
  containerStyle,
  inputStyle,
}) {
  const handleClear = () => {
    if (onClear) onClear();
    else if (onChangeText) onChangeText("");
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Ionicons name="search-outline" size={18} color="#94A3B8" style={styles.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={[styles.input, inputStyle]}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {Boolean(value && value.length > 0) && (
        <TouchableOpacity
          onPress={handleClear}
          activeOpacity={0.7}
          style={styles.clearButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={18} color="#94A3B8" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    height: 46,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 6,
  },
});
