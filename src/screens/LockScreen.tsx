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
  Image,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import Icon from "../components/Icon";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { COLORS, FONTS, SPACING, SHADOWS } from "../constants/theme";
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
import { AnimatedButton, FadeIn } from "../components/AnimatedComponents";

type Props = NativeStackScreenProps<RootStackParamList, "Lock">;

export default function LockScreen({ navigation }: Props) {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioVerified, setBioVerified] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(true);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioRetryCount, setBioRetryCount] = useState(0);
  const { setMasterPassword } = useSession();
  const passwordInputRef = React.useRef<TextInput>(null);
  const isMountedRef = React.useRef(true);

  useEffect(() => {
    console.info("LockScreen mounted");
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadSettings()
      .then((s) => {
        if (isMountedRef.current) {
          setBioEnabled(Boolean(s.biometricsEnabled));
        }
      })
      .catch(() => {
        if (isMountedRef.current) {
          setBioEnabled(true);
        }
      });
    checkBiometrics();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isMountedRef.current) {
        checkBiometrics();
      }
    });
    return () => sub.remove();
  }, []);

  const checkBiometrics = async () => {
    if (!isMountedRef.current) return;
    if (__DEV__) console.log("Checking biometric availability");

    const status = await getBiometricStatus();
    if (__DEV__) console.log("Biometric status", status);

    if (isMountedRef.current) {
      setBioAvailable(status.canUseBiometrics);
      setBioRetryCount(0);
    }
  };

  const triggerBiometric = async () => {
    if (__DEV__)
      console.log("Biometric unlock requested, attempt", bioRetryCount + 1);
    if (bioLoading) return;

    setBioLoading(true);
    try {
      const mode = await getBiometricMode();
      if (__DEV__) console.log("Biometric mode:", mode);

      let storedPassword: string | null = null;

      try {
        if (mode === "secureStoreAuth") {
          // SecureStore with hardware auth
          storedPassword = await getBiometricPassword();
        } else {
          // LocalAuthentication gate: allow Face/PIN, then read normally
          const auth = await LocalAuthentication.authenticateAsync({
            promptMessage: "Unlock PassSaver",
            disableDeviceFallback: false,
          });
          if (!auth.success) {
            if (__DEV__) console.log("User cancelled biometric prompt");
            if (isMountedRef.current) setBioLoading(false);
            return;
          }
          storedPassword = await getBiometricPasswordNoAuth();
        }
      } catch (authError: any) {
        const errorMsg = String(authError?.message || authError);
        if (__DEV__) console.warn("Biometric authentication error:", errorMsg);

        // Check for device-specific failures that should disable biometric
        if (
          errorMsg.includes("No hardware available") ||
          errorMsg.includes("not enrolled") ||
          errorMsg.includes("not configured")
        ) {
          if (__DEV__)
            console.log("Device biometric unavailable, disabling UI");
          if (isMountedRef.current) {
            setBioAvailable(false);
            setBioLoading(false);
          }
          Alert.alert(
            "Biometric Unavailable",
            "Your device biometric is no longer available. Please use your master password.",
          );
          return;
        }

        // For transient errors, allow retry
        if (bioRetryCount < 2) {
          if (__DEV__) console.log("Transient error, allowing retry");
          if (isMountedRef.current) {
            setBioRetryCount(bioRetryCount + 1);
            setBioLoading(false);
          }
          Alert.alert(
            "Try Again",
            "Biometric authentication failed. Please try again.",
          );
          return;
        }

        throw authError;
      }

      if (storedPassword) {
        if (__DEV__) console.info("Biometric unlock succeeded");
        setMasterPassword(storedPassword);
        if (isMountedRef.current) {
          setBioLoading(false);
        }
        navigation.replace("Home");
      } else {
        if (__DEV__) console.warn("Biometric verified but no stored password");
        if (isMountedRef.current) {
          setBioVerified(true);
          setBioLoading(false);
          passwordInputRef.current?.focus();
        }
        Alert.alert(
          "Step Required",
          "Biometrics verified, but please enter password once to re-sync.",
        );
      }
    } catch (error) {
      if (__DEV__) console.error("Biometric authentication error:", error);
      if (isMountedRef.current) {
        setBioLoading(false);
      }
      Alert.alert(
        "Authentication Failed",
        "Biometric authentication encountered an error. Please use your master password instead.",
        [
          {
            text: "OK",
            onPress: () => {
              if (isMountedRef.current) {
                passwordInputRef.current?.focus();
              }
            },
          },
        ],
      );
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
      <FadeIn duration={500} delay={100}>
        <View style={styles.header}>
          {/* <View style={styles.iconBox}> */}
            <Image
              source={require("../../assets/PassSaver_logo.jpeg")}
              style={styles.logo}
              resizeMode="contain"
            />
          {/* </View> */}
          {/* <Text style={styles.title}>PassSaver</Text> */}
          <Text style={styles.subtitle}>
            Enter your master password to unlock
          </Text>
        </View>
      </FadeIn>

      <FadeIn duration={500} delay={200}>
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
                  showPass
                    ? ACTION_ICONS.visibilityOff
                    : ACTION_ICONS.visibility
                }
                size={20}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <AnimatedButton
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleUnlock}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.background} />
            ) : (
              <Text style={styles.btnText}>Unlock Vault</Text>
            )}
          </AnimatedButton>

          {bioEnabled && (
            <AnimatedButton
              style={[
                styles.bioBtn,
                (loading || bioLoading) && styles.btnDisabled,
              ]}
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
            </AnimatedButton>
          )}
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
    gap: SPACING.md,
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
    ...SHADOWS.md,
  },
  logo: {
    width: 150,
    height: 150,
    borderRadius: 32,
  },
  icon: { fontSize: 40 },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  form: { gap: SPACING.lg },
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
  eyeBtn: { padding: SPACING.xs },
  eyeIcon: { fontSize: 18 },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.glow,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: COLORS.background,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 0.3,
  },
  bioBtn: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
    ...SHADOWS.sm,
  },
  bioBtnText: {
    color: COLORS.accent,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
    marginLeft: SPACING.sm,
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
