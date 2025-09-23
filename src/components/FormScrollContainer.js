import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, ScrollView, Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

export const KEYBOARD_AVOIDING_BEHAVIOR =
  Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined;

function useFormKeyboardOffset(extraOffset = 0) {
  const headerHeight = useHeaderHeight();
  const platformOffset = Platform.OS === "android" ? 16 : 0;
  return headerHeight + platformOffset + extraOffset;
}

export default function FormScrollContainer({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  ...rest
}) {
  const keyboardOffset = useFormKeyboardOffset();
  const insets = useSafeAreaInsets();
  const [keyboardSpace, setKeyboardSpace] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return undefined;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, event => {
      const height = event?.endCoordinates?.height ?? 0;
      const adjustedHeight = Math.max(0, height - insets.bottom);
      setKeyboardSpace(adjustedHeight);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardSpace(0));
    return () => {
      showSub?.remove();
      hideSub?.remove();
    };
  }, [insets.bottom]);

  const extraBottomSpacing = keyboardSpace > 0 ? keyboardSpace + 24 : 0;
  const baseContentStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32 + insets.bottom + extraBottomSpacing,
  };
  const mergedContentStyle = Array.isArray(contentContainerStyle)
    ? [baseContentStyle, ...contentContainerStyle]
    : { ...baseContentStyle, ...(contentContainerStyle || {}) };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={keyboardOffset}
    >
      <ScrollView
        {...rest}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? "handled"}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={mergedContentStyle}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
