import React, { useEffect, useState, forwardRef } from "react";
import { KeyboardAvoidingView, ScrollView, Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

export const KEYBOARD_AVOIDING_BEHAVIOR =
  Platform.OS === "ios" ? "padding" : undefined;

function useFormKeyboardOffset(extraOffset = 0) {
  const headerHeight = useHeaderHeight();
  const platformOffset = Platform.OS === "android" ? 16 : 0;
  return headerHeight + platformOffset + extraOffset;
}

const FormScrollContainer = forwardRef(({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  ...rest
}, ref) => {
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
  
  let callerPaddingBottom = 32;
  let callerStyleClean = {};

  if (contentContainerStyle) {
    if (Array.isArray(contentContainerStyle)) {
      contentContainerStyle.forEach(style => {
        if (style && style.paddingBottom !== undefined) {
          callerPaddingBottom = typeof style.paddingBottom === "number" ? style.paddingBottom : 32;
        }
      });
      callerStyleClean = contentContainerStyle.map(style => {
        if (!style) return style;
        const { paddingBottom, ...other } = style;
        return other;
      });
    } else {
      if (contentContainerStyle.paddingBottom !== undefined) {
        callerPaddingBottom = typeof contentContainerStyle.paddingBottom === "number" ? contentContainerStyle.paddingBottom : 32;
      }
      const { paddingBottom, ...other } = contentContainerStyle;
      callerStyleClean = other;
    }
  }

  const baseContentStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: callerPaddingBottom + insets.bottom + extraBottomSpacing,
  };
  const mergedContentStyle = Array.isArray(callerStyleClean)
    ? [baseContentStyle, ...callerStyleClean]
    : { ...baseContentStyle, ...callerStyleClean };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      keyboardVerticalOffset={keyboardOffset}
    >
      <ScrollView
        ref={ref}
        {...rest}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? "handled"}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        contentContainerStyle={mergedContentStyle}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

export default FormScrollContainer;
