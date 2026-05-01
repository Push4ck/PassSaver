import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Switch,
  ScrollView,
  Animated,
  PanResponder,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Icon from "./Icon";
import { COLORS, FONTS, SPACING } from "../constants/theme";
import {
  generatePassword,
  GeneratorOptions,
  DEFAULT_OPTIONS,
} from "../utils/passwordGenerator";
import { ACTION_ICONS } from "../utils/icons";

interface Props {
  visible: boolean;
  onClose: () => void;
  onUse?: (password: string) => void;
}

export default function PasswordGeneratorModal({
  visible,
  onClose,
  onUse,
}: Props) {
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_OPTIONS);
  const [generated, setGenerated] = useState(() =>
    generatePassword(DEFAULT_OPTIONS),
  );
  const [copied, setCopied] = useState(false);

  const LENGTH_MIN = 8;
  const LENGTH_MAX = 32;
  const LENGTH_STEP = 1;
  const THUMB_SIZE = 26;

  const translateY = useRef(new Animated.Value(0)).current;
  const sheetHeightRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const isClosingRef = useRef(false);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    isClosingRef.current = false;

    // Slide-in animation for the sheet.
    const start = sheetHeightRef.current || 500;
    translateY.setValue(start);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    setCopied(false);
  }, [visible, translateY]);

  const regenerate = (opts: GeneratorOptions) => {
    setGenerated(generatePassword(opts));
    setCopied(false);
  };

  const updateOption = <K extends keyof GeneratorOptions>(
    key: K,
    value: GeneratorOptions[K],
  ) => {
    setOptions((prev) => {
      const updated = { ...prev, [key]: value };
      regenerate(updated);
      return updated;
    });
  };

  const closeSheet = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    const height = sheetHeightRef.current || 500;
    Animated.timing(translateY, {
      toValue: height + 50,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      isClosingRef.current = false;
      onCloseRef.current();
    });
  };

  const [lengthTrackWidth, setLengthTrackWidth] = useState(0);
  const lengthTrackWidthRef = useRef(0);

  const setLengthFromX = (x: number) => {
    const w = lengthTrackWidthRef.current;
    if (w <= 0) return;

    const ratio = Math.min(1, Math.max(0, x / w));
    const raw = LENGTH_MIN + ratio * (LENGTH_MAX - LENGTH_MIN);
    const snapped = Math.round(raw / LENGTH_STEP) * LENGTH_STEP;
    const clamped = Math.min(LENGTH_MAX, Math.max(LENGTH_MIN, snapped));

    if (optionsRef.current.length !== clamped) {
      updateOption("length", clamped);
    }
  };

  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        return (
          Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
          Math.abs(gesture.dx) > 2
        );
      },
      onPanResponderGrant: (evt) => {
        const x = (evt.nativeEvent as any).locationX;
        if (typeof x === "number") setLengthFromX(x);
      },
      onPanResponderMove: (evt) => {
        const x = (evt.nativeEvent as any).locationX;
        if (typeof x === "number") setLengthFromX(x);
      },
    }),
  ).current;

  const closePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        return (
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
        );
      },
      onPanResponderMove: (_evt, gesture) => {
        if (isClosingRef.current) return;
        if (gesture.dy < 0) return;
        translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (isClosingRef.current) return;
        const dy = gesture.dy;
        const height = sheetHeightRef.current || 500;
        const threshold = height * 0.25 || 90;

        if (dy > threshold) {
          closeSheet();
          return;
        }

        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUse = () => {
    onUse?.(generated);
    closeSheet();
  };

  // Color-code password characters
  const renderPassword = () => {
    return generated.split("").map((char, i) => {
      const color = /[A-Z]/.test(char)
        ? COLORS.accent
        : /[0-9]/.test(char)
          ? COLORS.warning
          : /[^A-Za-z0-9]/.test(char)
            ? COLORS.danger
            : COLORS.textPrimary;
      return (
        <Text key={i} style={[styles.pwdChar, { color }]}>
          {char}
        </Text>
      );
    });
  };

  const lengthProgress =
    (options.length - LENGTH_MIN) / (LENGTH_MAX - LENGTH_MIN);
  const sliderFillWidth = lengthTrackWidth * lengthProgress;
  const thumbLeft = sliderFillWidth - THUMB_SIZE / 2;

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
          onLayout={(e) => {
            sheetHeightRef.current = e.nativeEvent.layout.height;
          }}
        >
          <Animated.View style={styles.handle} {...closePanResponder.panHandlers} />

          <Text style={styles.title}>Password Generator</Text>

          {/* Generated Password Display */}
          <View style={styles.pwdBox}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pwdScroll}
            >
              <Text style={styles.pwdText}>{renderPassword()}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => regenerate(optionsRef.current)}
            >
              <Icon name="refresh" size={20} color={COLORS.accent} />
            </TouchableOpacity>
          </View>

          {/* Length Slider */}
          <View style={styles.row}>
            <Text style={styles.optionLabel}>Length</Text>
            <Text style={styles.optionValue}>{options.length}</Text>
          </View>

          <View
            style={styles.lengthSlider}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              lengthTrackWidthRef.current = w;
              setLengthTrackWidth(w);
            }}
            {...sliderPanResponder.panHandlers}
          >
            <View style={styles.lengthSliderTrack} />
            <View style={[styles.lengthSliderFill, { width: sliderFillWidth }]} />
            <View
              pointerEvents="none"
              style={[
                styles.lengthSliderThumb,
                { left: Math.max(0, Math.min(lengthTrackWidth - THUMB_SIZE, thumbLeft)) },
              ]}
            />
          </View>

          <View style={styles.lengthSliderLabels}>
            <Text style={styles.lengthSliderLabel}>{LENGTH_MIN}</Text>
            <Text style={styles.lengthSliderLabel}>{LENGTH_MAX}</Text>
          </View>

          {/* Toggles */}
          {(
            [
              {
                key: "uppercase",
                label: "Uppercase",
                sub: "A-Z",
                icon: "text-outline",
              },
              { key: "numbers", label: "Numbers", sub: "0-9", icon: "keypad-outline" },
              {
                key: "symbols",
                label: "Symbols",
                sub: "!@#$%...",
                icon: "code-slash-outline",
              },
            ] as const
          ).map((opt) => (
            <View key={opt.key} style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <Icon
                  name={opt.icon}
                  size={20}
                  color={COLORS.accent}
                  style={styles.toggleIcon}
                />
                <View>
                  <Text style={styles.toggleLabel}>{opt.label}</Text>
                  <Text style={styles.toggleSub}>{opt.sub}</Text>
                </View>
              </View>
              <Switch
                value={options[opt.key]}
                onValueChange={(v) => updateOption(opt.key, v)}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={COLORS.textPrimary}
              />
            </View>
          ))}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
              <Icon
                name={ACTION_ICONS.copy}
                size={18}
                color={COLORS.background}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.copyBtnText}>
                {copied ? "Copied!" : "Copy"}
              </Text>
            </TouchableOpacity>
            {onUse && (
              <TouchableOpacity style={styles.useBtn} onPress={handleUse}>
                <Text style={styles.useBtnText}>Use This</Text>
                <Icon
                  name="arrow-forward"
                  size={16}
                  color={COLORS.background}
                  style={{ marginLeft: SPACING.xs }}
                />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={closeSheet}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#000000aa",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  pwdBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  pwdScroll: { flexGrow: 1 },
  pwdText: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 1,
    flexDirection: "row",
    flexWrap: "nowrap",
  },
  pwdChar: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
  },
  refreshBtn: {
    padding: SPACING.xs,
  },
  refreshIcon: { padding: SPACING.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  optionValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
    color: COLORS.accent,
  },
  lengthSlider: {
    width: "100%",
    height: 26,
    position: "relative",
  },
  lengthSliderTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 8,
    height: 10,
    borderRadius: 999,
    backgroundColor: COLORS.border,
  },
  lengthSliderFill: {
    position: "absolute",
    left: 0,
    top: 8,
    height: 10,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  lengthSliderThumb: {
    position: "absolute",
    top: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  lengthSliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: SPACING.xs,
  },
  lengthSliderLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.medium,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  toggleIcon: { marginRight: SPACING.md },
  toggleLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textPrimary,
    fontWeight: FONTS.weights.medium,
  },
  toggleSub: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  copyBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  copyBtnText: {
    color: COLORS.accent,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
  },
  useBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  useBtnText: {
    color: COLORS.background,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
  },
  closeBtn: {
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.md,
  },
});
