import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import Icon from "../components/Icon";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { COLORS, FONTS, SPACING, SHADOWS } from "../constants/theme";
import { RootStackParamList } from "../navigation/AppNavigator";
import { saveMasterPassword } from "../utils/storage";
import { ACTION_ICONS } from "../utils/icons";
import {
  AnimatedButton,
  FadeIn,
  ScaleIn,
} from "../components/AnimatedComponents";

type Props = NativeStackScreenProps<RootStackParamList, "Setup">;

export default function SetupScreen({ navigation }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength =
    password.length === 0
      ? 0
      : password.length < 6
        ? 1
        : password.length < 10
          ? 2
          : 3;

  const strengthLabel = ["", "Weak", "Good", "Strong"][strength];
  const strengthColor = [
    COLORS.border,
    COLORS.danger,
    COLORS.warning,
    COLORS.success,
  ][strength];

  const handleSetup = async () => {
    if (password.length < 6) {
      Alert.alert("Too short", "Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }
    setLoading(true);
    await saveMasterPassword(password);
    setLoading(false);
    navigation.replace("Lock");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <FadeIn duration={500} delay={100}>
        <ScaleIn duration={400} delay={150} initialScale={0.9}>
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Image
                source={require("../../assets/PassSaver_logo.jpeg")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Create Master Password</Text>
            <Text style={styles.subtitle}>
              This password encrypts your entire vault.{"\n"}
              Never forget it — it cannot be recovered.
            </Text>
          </View>
        </ScaleIn>
      </FadeIn>

      <FadeIn duration={500} delay={250}>
        <View style={styles.form}>
          {/* Password Field */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Master Password"
              placeholderTextColor={COLORS.textSecondary}
              secureTextEntry={!showPass}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPass(!showPass)}
              style={styles.eyeBtn}
            >
              <Icon
                name={
                  showPass
                    ? ACTION_ICONS.visibilityOff
                    : ACTION_ICONS.visibility
                }
                size={20}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Strength Bar */}
          {password.length > 0 && (
            <View style={styles.strengthRow}>
              {[1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.strengthBar,
                    {
                      backgroundColor:
                        i <= strength ? strengthColor : COLORS.border,
                    },
                  ]}
                />
              ))}
              <Text style={[styles.strengthLabel, { color: strengthColor }]}>
                {strengthLabel}
              </Text>
            </View>
          )}

          {/* Confirm Field */}
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor={COLORS.textSecondary}
              secureTextEntry={!showPass}
              value={confirm}
              onChangeText={setConfirm}
            />
          </View>

          <AnimatedButton
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSetup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color={COLORS.background}
                style={{ marginRight: 8 }}
              />
            ) : (
              <Icon
                name={ACTION_ICONS.security}
                size={20}
                color={COLORS.background}
                style={{ marginRight: 8 }}
              />
            )}
            <Text style={styles.btnText}>
              {loading ? "Setting up..." : "Create Vault"}
            </Text>
          </AnimatedButton>
        </View>
      </FadeIn>

      <View style={styles.glowCircle} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: SPACING.xl + SPACING.md,
    gap: SPACING.lg,
  },
  iconBox: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.md,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 22,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  form: {
    gap: SPACING.lg,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.sm,
  },
  input: {
    flex: 1,
    height: 56,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
  },
  eyeBtn: {
    padding: SPACING.xs,
  },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: SPACING.lg,
    ...SHADOWS.glow,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: COLORS.background,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 0.3,
  },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    width: 52,
    textAlign: "right",
  },
  glowCircle: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.accentGlow,
    bottom: -60,
    right: -60,
    zIndex: -1,
  },
});
