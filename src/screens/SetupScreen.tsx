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
} from "react-native";
import Icon from "../components/Icon";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { COLORS, FONTS, SPACING } from "../constants/theme";
import { RootStackParamList } from "../navigation/AppNavigator";
import { saveMasterPassword } from "../utils/storage";
import { ACTION_ICONS } from "../utils/icons";

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
       <View style={styles.header}>
         <Icon name={ACTION_ICONS.security} size={60} color={COLORS.accent} />
         <Text style={styles.title}>Create Master Password</Text>
         <Text style={styles.subtitle}>
           This password encrypts your entire vault.{"\n"}
           Never forget it — it cannot be recovered.
         </Text>
       </View>

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
           <Icon name={
             showPass ? ACTION_ICONS.visibilityOff : ACTION_ICONS.visibility
           } size={20} color={COLORS.textSecondary} />
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

         <TouchableOpacity
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
         </TouchableOpacity>
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
  emoji: { fontSize: 52 },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
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
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: -SPACING.xs,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    width: 48,
    textAlign: "right",
  },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: SPACING.sm,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: COLORS.background,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
  },
  glowCircle: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.accentGlow,
    top: -60,
    left: -60,
  },
});
