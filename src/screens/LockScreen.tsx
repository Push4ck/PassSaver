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
  AppState,
  ActivityIndicator,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import Icon from "../components/Icon";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { COLORS, FONTS, SPACING } from "../constants/theme";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  verifyMasterPassword,
  getBiometricPassword,
  getBiometricPasswordNoAuth,
  getBiometricMode,
  loadSettings,
} from "../utils/storage";
import { useSession } from "../context/SessionContext";
import { ACTION_ICONS } from "../utils/icons";
import { getBiometricStatus } from "../utils/biometrics";

type Props = NativeStackScreenProps<RootStackParamList, "Lock">;

export default function LockScreen({ navigation }: Props) {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioVerified, setBioVerified] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(true);
  const [bioLoading, setBioLoading] = useState(false);
  const { setMasterPassword } = useSession();
  const passwordInputRef = React.useRef<TextInput>(null);

  useEffect(() => {
    console.info("LockScreen mounted");
    loadSettings()
      .then((s) => setBioEnabled(Boolean(s.biometricsEnabled)))
      .catch(() => setBioEnabled(true));
    checkBiometrics();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkBiometrics();
      }
    });
    return () => sub.remove();
  }, []);

  const checkBiometrics = async () => {
    console.log("Checking biometric availability");
    const status = await getBiometricStatus();
    console.log("Biometric status", status);
    setBioAvailable(status.canUseBiometrics);
  };

  const triggerBiometric = async () => {
    console.log("Biometric unlock requested");
    if (bioLoading) return;
    setBioLoading(true);
    try {
      const mode = await getBiometricMode();

      let storedPassword: string | null = null;
      if (mode === "secureStoreAuth") {
        // SecureStore will trigger the OS prompt (biometric hardware required).
        storedPassword = await getBiometricPassword();
      } else {
        // LocalAuthentication gate: allow Face/PIN, then read normally.
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock PassSaver",
          disableDeviceFallback: false,
        });
        if (!auth.success) return;
        storedPassword = await getBiometricPasswordNoAuth();
      }

      if (storedPassword) {
        console.info("Biometric unlock succeeded with stored password");
        setMasterPassword(storedPassword);
        navigation.replace("Home");
      } else {
        console.warn("Biometric verified but no stored password found");
        setBioVerified(true);
        passwordInputRef.current?.focus();
        Alert.alert(
          "Step Required",
          "Biometrics verified, but please enter password once to re-sync.",
        );
      }
    } catch (error) {
      console.error("Biometric authentication error:", error);
      Alert.alert(
        "Authentication Failed",
        "Please try again or use your master password.",
      );
    } finally {
      setBioLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!password) return;
    console.log("Manual unlock attempt started");
    setLoading(true);
    const valid = await verifyMasterPassword(password);
    setLoading(false);
    console.log("Manual unlock result", { valid });
    if (valid) {
      setMasterPassword(password); // 👈 save to session
      console.info("Manual unlock succeeded, navigating to Home");
      navigation.replace("Home");
    } else {
      console.warn("Manual unlock failed due to wrong password");
      Alert.alert("Wrong Password", "Please try again.");
      setPassword("");
      setBioVerified(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Icon name={ACTION_ICONS.security} size={60} color={COLORS.accent} />
        </View>
        <Text style={styles.title}>PassSaver</Text>
        <Text style={styles.subtitle}>
          Enter your master password to unlock
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputWrapper}>
          <TextInput
            ref={passwordInputRef}
            style={styles.input}
            placeholder="Master Password"
            placeholderTextColor={COLORS.textSecondary}
            secureTextEntry={!showPass}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleUnlock}
          />
          <TouchableOpacity
            onPress={() => setShowPass(!showPass)}
            style={styles.eyeBtn}
          >
            <Icon
              name={
                showPass ? ACTION_ICONS.visibilityOff : ACTION_ICONS.visibility
              }
              size={20}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleUnlock}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.background} />
          ) : (
            <Text style={styles.btnText}>Unlock Vault</Text>
          )}
        </TouchableOpacity>

        {bioEnabled && (
          <TouchableOpacity
            style={[styles.bioBtn, (loading || bioLoading) && styles.btnDisabled]}
            onPress={triggerBiometric}
            disabled={loading || bioLoading}
          >
            <Icon
              name={ACTION_ICONS.biometric}
              size={20}
              color={COLORS.accent}
            />
            {bioLoading ? (
              <ActivityIndicator
                size="small"
                color={COLORS.accent}
                style={{ marginLeft: SPACING.sm }}
              />
            ) : (
              <Text style={styles.bioBtnText}>Use Biometrics Instead</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

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
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  icon: { fontSize: 40 },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  form: { gap: SPACING.md },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  input: {
    flex: 1,
    height: 52,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
  },
  eyeBtn: { padding: SPACING.xs },
  eyeIcon: { fontSize: 18 },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: COLORS.background,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
  },
  bioBtn: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bioBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.md,
  },
  glowCircle: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.accentGlow,
    bottom: -60,
    right: -60,
  },
});
