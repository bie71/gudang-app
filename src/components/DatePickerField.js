import React, { useState } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { formatDateDisplay, formatDateInputValue, parseDateString } from "../utils/format";

export default function DatePickerField({ label, value, onChange }) {
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const currentDate = parseDateString(value);

  const handlePick = selectedDate => {
    if (!selectedDate) return;
    onChange(formatDateInputValue(selectedDate));
  };

  const openPicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: "date",
        onChange: (_, selected) => {
          if (selected) handlePick(selected);
        },
      });
    } else {
      setShowIOSPicker(true);
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ marginBottom: 6, color: "#475569" }}>{label}</Text>
      <TouchableOpacity
        onPress={openPicker}
        style={{
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: "#E5E7EB",
          borderRadius: 12,
          paddingHorizontal: 12,
          height: 44,
          justifyContent: "center",
        }}
      >
        <Text style={{ color: value ? "#0F172A" : "#94A3B8" }}>
          {value ? formatDateDisplay(value) : "Pilih tanggal"}
        </Text>
      </TouchableOpacity>
      {Platform.OS === "ios" && showIOSPicker ? (
        <DateTimePicker
          value={currentDate}
          mode="date"
          display="spinner"
          onChange={(event, selected) => {
            if (event.type === "dismissed") {
              setShowIOSPicker(false);
              return;
            }
            if (selected) handlePick(selected);
            setShowIOSPicker(false);
          }}
          style={{ marginTop: 8 }}
        />
      ) : null}
    </View>
  );
}
