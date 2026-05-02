import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Icon from "../components/Icon";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { COLORS, FONTS, SPACING, SHADOWS } from "../constants/theme";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useSession } from "../context/SessionContext";
import { addEntry, updateEntry, loadVault } from "../utils/storage";
import { PasswordEntry, Category } from "../types";
import PasswordGeneratorModal from "../components/PasswordGeneratorModal";
import { CATEGORY_ICONS, ACTION_ICONS } from "../utils/icons";
import { AnimatedButton, FadeIn } from "../components/AnimatedComponents";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteP = RouteProp<RootStackParamList, "AddEdit">;

const CATEGORIES: Category[] = [
  "Social",
  "Banking",
  "Email",
  "Work",
  "Shopping",
  "Gaming",
  "Other",
];

export default function AddEditScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteP>();
  const { masterPassword } = useSession();
  const existing = route.params?.entry ?? null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [username, setUsername] = useState(existing?.username ?? "");
  const [password, setPassword] = useState(existing?.password ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [category, setCategory] = useState<Category>(
    existing?.category ?? "Other",
  );
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const getStrength = (pwd: string) => {
    if (pwd.length === 0) return { score: 0, label: "", color: COLORS.border };
    if (pwd.length < 6)
      return { score: 1, label: "Weak", color: COLORS.danger };
    if (pwd.length < 10)
      return { score: 2, label: "Good", color: COLORS.warning };
    const hasUpper = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    const extras = [hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    if (extras >= 2)
      return { score: 3, label: "Strong", color: COLORS.success };
    return { score: 2, label: "Good", color: COLORS.warning };
  };

  const strength = useMemo(() => getStrength(password), [password]);

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert("Required", "Please enter a title.");
    if (!password.trim())
      return Alert.alert("Required", "Please enter a password.");

    if (!masterPassword) {
      Alert.alert("Vault Locked", "Unlock your vault first.");
      return;
    }

    setLoading(true);
    try {
      // Duplicate password check
      const trimmedPassword = password.trim();
      const unchanged = Boolean(
        existing && existing.password === trimmedPassword,
      );
      if (!unchanged) {
        const allEntries = await loadVault(masterPassword);
        const duplicate = allEntries.find(
          (e) => e.password === trimmedPassword && e.id !== existing?.id,
        );
        if (duplicate) {
          setLoading(false);
          Alert.alert(
            "Duplicate Password",
            `This password is already used by "${duplicate.title}". Using unique passwords is safer.`,
            [
              { text: "Change It", style: "cancel" },
              {
                text: "Use Anyway",
                onPress: async () => {
                  setLoading(true);
                  try {
                    await saveEntry();
                  } catch {
                    setLoading(false);
                    Alert.alert(
                      "Save Failed",
                      "Could not save entry. Please try again.",
                    );
                  }
                },
              },
            ],
          );
          return;
        }
      }

      await saveEntry();
    } catch (e) {
      setLoading(false);
      Alert.alert("Save Failed", "Could not save entry. Please try again.");
    }
  };

  const saveEntry = async () => {
    const now = Date.now();
    const entry: PasswordEntry = {
      id: existing?.id ?? uuidv4(),
      title: title.trim(),
      username: username.trim(),
      password: password.trim(),
      notes: notes.trim(),
      category,
      isFavorite: existing?.isFavorite ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) {
      await updateEntry(entry, masterPassword);
    } else {
      await addEntry(entry, masterPassword);
    }
    setLoading(false);
    navigation.navigate("Home", {
      vaultMutation: { type: existing ? "update" : "add", entry },
    });
  };

  const [showGenerator, setShowGenerator] = useState(false);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <FadeIn duration={400} delay={50}>
          {/* Header */}
          <View style={styles.header}>
            <AnimatedButton
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
            >
              <Icon
                name={ACTION_ICONS.back}
                size={24}
                color={COLORS.textPrimary}
              />
            </AnimatedButton>
            <Text style={styles.headerTitle}>
              {existing ? "Edit Entry" : "New Entry"}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Category Picker */}
          <Text style={styles.label}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryRow}
          >
            {CATEGORIES.map((cat) => (
              <AnimatedButton
                key={cat}
                style={[
                  styles.categoryChip,
                  category === cat && styles.categoryChipActive,
                ]}
                onPress={() => setCategory(cat)}
              >
                <Icon
                  name={CATEGORY_ICONS[cat]}
                  size={20}
                  color={COLORS.accent}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </AnimatedButton>
            ))}
          </ScrollView>

          {/* Fields */}
          <Text style={styles.label}>Title *</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="e.g. Gmail, Netflix..."
              placeholderTextColor={COLORS.textSecondary}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <Text style={styles.label}>Username / Email</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor={COLORS.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <Text style={styles.label}>Password *</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Enter password"
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
                size={18}
                color={COLORS.textPrimary}
              />
            </TouchableOpacity>
            <AnimatedButton
              style={styles.generatorBtn}
              onPress={() => setShowGenerator(true)}
            >
              <Icon name="dice-outline" size={18} color={COLORS.accent} />
            </AnimatedButton>

            <PasswordGeneratorModal
              visible={showGenerator}
              onClose={() => setShowGenerator(false)}
              onUse={(pwd) => setPassword(pwd)}
            />
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
                        i <= strength.score ? strength.color : COLORS.border,
                    },
                  ]}
                />
              ))}
              <Text style={[styles.strengthLabel, { color: strength.color }]}>
                {strength.label}
              </Text>
            </View>
          )}

          <Text style={styles.label}>Notes</Text>
          <View style={[styles.inputWrapper, styles.notesWrapper]}>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Optional notes..."
              placeholderTextColor={COLORS.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Save Button */}
          <AnimatedButton
            style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
            onPress={handleSave}
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
            <Text style={styles.saveBtnText}>
              {loading ? "Saving..." : existing ? "Save Changes" : "Add Entry"}
            </Text>
          </AnimatedButton>
        </FadeIn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.lg,
    marginTop: SPACING.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  label: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  categoryRow: {
    marginBottom: SPACING.sm,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
    ...SHADOWS.sm,
  },
  categoryChipActive: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.accent,
  },
  categoryChipText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.medium,
  },
  categoryChipTextActive: {
    color: COLORS.accent,
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
  eyeBtn: { padding: SPACING.xs },
  notesWrapper: {
    alignItems: "flex-start",
    paddingVertical: SPACING.sm,
  },
  notesInput: {
    height: 80,
    textAlignVertical: "top",
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: SPACING.xl + SPACING.md,
    ...SHADOWS.glow,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
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
    width: 48,
    textAlign: "right",
  },
  generatorBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
    marginTop: SPACING.xs,
    ...SHADOWS.sm,
  },
});
