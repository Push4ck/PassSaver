import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import Icon from "../components/Icon";
import { exportVault } from "../utils/storage";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as LocalAuthentication from "expo-local-authentication";
import { COLORS, FONTS, SPACING, SHADOWS } from "../constants/theme";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useSession } from "../context/SessionContext";
import {
  loadSettings,
  saveSettings,
  AppSettings,
  DEFAULT_SETTINGS,
  changeMasterPassword,
  clearVault,
  saveBiometricPassword,
  saveBiometricPasswordLocalAuthGate,
  removeBiometricPassword,
  getBiometricPassword,
  getBiometricPasswordNoAuth,
  setBiometricMode,
  importVaultWithMode,
  ImportMode,
  getBackupMetadata,
  validateBackupFile,
} from "../utils/storage";
import { ACTION_ICONS } from "../utils/icons";
import { AnimatedButton, FadeIn } from "../components/AnimatedComponents";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const AUTO_LOCK_OPTIONS = [
  { label: "Never", value: 0 },
  { label: "1 min", value: 1 },
  { label: "2 min", value: 2 },
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
];

const CLIPBOARD_OPTIONS = [
  { label: "Never", value: 0 },
  { label: "15 sec", value: 15 },
  { label: "30 sec", value: 30 },
  { label: "1 min", value: 60 },
];

export default function SettingsScreen() {
  const navigation = useNavigation<NavProp>();
  const {
    masterPassword,
    setMasterPassword,
    setSecurityMode,
    setClipboardTimeout,
  } = useSession();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  // Expo's FileSystem typings vary by SDK/version; cast to avoid TS-only failures.
  const FS: any = FileSystem;

  // Change password modal
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportName, setExportName] = useState("");
  const [safChoices, setSafChoices] = useState<
    Array<{ uri: string; name: string }>
  >([]);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confPwd, setConfPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [pendingBackupJson, setPendingBackupJson] = useState<string | null>(
    null,
  );
  const [backupMetadata, setBackupMetadata] = useState<any>(null);
  const importInProgressRef = React.useRef(false);
  const exportInProgressRef = React.useRef(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // Reload settings whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      loadSettings().then(setSettings);
    }, []),
  );

  const applyImportedJson = async (json: string) => {
    try {
      // Step 1: Validate backup file
      const validation = validateBackupFile(json);
      if (!validation.valid) {
        Alert.alert(
          "Invalid Backup",
          validation.error || "Backup file is corrupted.",
        );
        return;
      }

      // Step 2: Extract metadata without decrypting
      const metaResult = getBackupMetadata(json);
      if (!metaResult.valid) {
        Alert.alert("Invalid Backup", "Could not read backup metadata.");
        return;
      }

      setBackupMetadata(metaResult.metadata);

      // Step 3: Show metadata preview and mode selection
      // Capture JSON in closure to avoid async state timing issues
      Alert.alert(
        "Backup Details",
        `Version: ${metaResult.metadata?.version || "unknown"}\n` +
          `Entries: ${metaResult.metadata?.entryCount || 0}\n` +
          `Exported: ${metaResult.metadata?.exportedAt ? new Date(metaResult.metadata.exportedAt).toLocaleDateString() : "unknown"}\n\n` +
          `Choose how to import this backup.`,
        [
          {
            text: "Merge (Keep All)",
            onPress: () => executeImport("merge", json),
          },
          {
            text: "Merge & Deduplicate",
            onPress: () => executeImport("merge-dedup", json),
          },
          {
            text: "Replace Entire Vault",
            style: "destructive",
            onPress: () => executeImport("replace", json),
          },
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              setPendingBackupJson(null);
              setBackupMetadata(null);
            },
          },
        ],
      );
    } catch (e) {
      console.error("applyImportedJson error:", e);
      Alert.alert(
        "Error",
        "An unexpected error occurred while reading backup.",
      );
    }
  };

  const executeImport = async (mode: ImportMode, backupJson: string) => {
    console.log("executeImport - starting with mode:", mode);

    if (!backupJson) {
      console.error("executeImport - no backupJson provided");
      setImporting(false);
      return;
    }

    setImporting(true);

    try {
      console.log("executeImport - calling importVaultWithMode");
      const { success, count, entries, error, duplicateCount } =
        await importVaultWithMode(backupJson, masterPassword, mode);

      console.log("executeImport - import result", {
        success,
        count,
        mode,
        duplicateCount,
        error,
      });

      if (success) {
        let message = `${count} entries imported`;
        if (mode === "merge-dedup" && duplicateCount && duplicateCount > 0) {
          message += ` (${duplicateCount} duplicates skipped)`;
        }
        if (mode === "replace") {
          message = `Vault replaced with ${count} entries`;
        }

        Alert.alert("Import Successful", message, [
          {
            text: "OK",
            onPress: () => {
              setPendingBackupJson(null);
              setBackupMetadata(null);
              setImporting(false);
              // Small delay to ensure state updates before navigation
              setTimeout(() => {
                navigation.navigate("Home", { vaultSnapshot: entries });
              }, 150);
            },
          },
        ]);
      } else {
        Alert.alert(
          "Import Failed",
          error ||
            "Failed to import backup. Please check your master password.",
          [
            {
              text: "OK",
              onPress: () => {
                setPendingBackupJson(null);
                setBackupMetadata(null);
                setImporting(false);
              },
            },
          ],
        );
      }
    } catch (e) {
      console.error("executeImport - error:", e);
      Alert.alert("Error", "An unexpected error occurred during import.", [
        {
          text: "OK",
          onPress: () => {
            setPendingBackupJson(null);
            setBackupMetadata(null);
            setImporting(false);
          },
        },
      ]);
    }
  };

  const handleToggleBiometrics = async (enabled: boolean) => {
    if (enabled) {
      try {
        if (!masterPassword) {
          Alert.alert(
            "Vault Locked",
            "Unlock your vault first, then enable biometric unlock.",
          );
          await updateSetting("biometricsEnabled", false);
          return;
        }

        // Some Android devices misreport LocalAuthentication enrollment.
        // The most reliable test is: store secret -> immediately read it with auth prompt.
        try {
          await saveBiometricPassword(masterPassword);
          await setBiometricMode("secureStoreAuth");
        } catch (e: any) {
          const msg = String(e?.message || e);
          // If SecureStore can't do biometric hardware auth, fallback to
          // LocalAuthentication gating (Face/PIN) + normal SecureStore storage.
          if (
            msg.includes(
              "No hardware available for biometric authentication",
            ) ||
            msg.includes("No hardware available")
          ) {
            if (__DEV__) console.log("Using LocalAuthentication gate fallback");
            const auth = await LocalAuthentication.authenticateAsync({
              promptMessage: "Enable biometric unlock",
              disableDeviceFallback: false,
            });
            if (!auth.success) {
              if (__DEV__) console.log("User cancelled biometric setup");
              await updateSetting("biometricsEnabled", false);
              return;
            }
            if (__DEV__)
              console.log("Saving biometric with localAuthGate mode");
            await saveBiometricPasswordLocalAuthGate(masterPassword);
            await setBiometricMode("localAuthGate");
          } else if (msg.includes("not enrolled")) {
            Alert.alert(
              "Biometric Not Set Up",
              "No biometric data (Face ID, Touch ID, or fingerprint) is registered on your device. Please set up biometrics in device settings first.",
            );
            await updateSetting("biometricsEnabled", false);
            return;
          } else {
            if (__DEV__) console.warn("Unexpected biometric error:", msg);
            throw e;
          }
        }

        const confirmed =
          (await getBiometricPassword()) ??
          (await getBiometricPasswordNoAuth());

        if (!confirmed) {
          await removeBiometricPassword();
          Alert.alert(
            "Couldn’t enable biometrics",
            "Authentication didn’t succeed. If you use Face Unlock, make sure it’s enabled for apps (not only for screen unlock).",
          );
          await updateSetting("biometricsEnabled", false);
          return;
        }

        await updateSetting("biometricsEnabled", true);
      } catch (e) {
        console.error("Enable biometrics failed", e);
        await removeBiometricPassword();
        Alert.alert(
          "Couldn’t enable biometrics",
          "Your device didn’t allow biometric app authentication. Please try again or use master password unlock.",
        );
        await updateSetting("biometricsEnabled", false);
      }
      return;
    }

    try {
      await removeBiometricPassword();
    } finally {
      await updateSetting("biometricsEnabled", false);
    }
  };

  const updateSetting = async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await saveSettings(updated);

    if (key === "securityMode" && setSecurityMode) {
      setSecurityMode(value as boolean);
    } else if (key === "clipboardTimeout" && setClipboardTimeout) {
      setClipboardTimeout(value as number);
    }
  };

  const handleChangePassword = async () => {
    if (newPwd.length < 6)
      return Alert.alert(
        "Too Short",
        "New password must be at least 6 characters.",
      );
    if (newPwd !== confPwd)
      return Alert.alert("Mismatch", "New passwords do not match.");

    setSaving(true);
    const success = await changeMasterPassword(oldPwd, newPwd);
    setSaving(false);

    if (success) {
      setMasterPassword(newPwd);
      setShowChangePwd(false);
      setOldPwd("");
      setNewPwd("");
      setConfPwd("");
      Alert.alert("Success", "Master password changed successfully.");
    } else {
      Alert.alert("Error", "Your current password is incorrect.");
    }
  };

  const handleClearVault = () => {
    Alert.alert(
      "Clear Vault",
      "This will permanently delete ALL saved passwords. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            await clearVault();
            Alert.alert("Vault Cleared", "All passwords have been deleted.");
          },
        },
      ],
    );
  };

  const handleLockNow = () => {
    setMasterPassword("");
    navigation.replace("Lock");
  };

  const buildExportFilename = (): string => {
    const base = exportName.trim() || `passsaver-backup-${Date.now()}`;
    return base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
  };

  const runExport = async (mode: "share" | "download") => {
    if (exporting || exportInProgressRef.current) return;
    exportInProgressRef.current = true;
    setExporting(true);
    try {
      const json = await exportVault(masterPassword);
      let entryCount = 0;
      try {
        const parsed = JSON.parse(json);
        entryCount = Number(parsed?.entryCount || 0);
      } catch {}
      const filename = buildExportFilename();

      const writeDir = FS.cacheDirectory || FS.documentDirectory;
      if (mode === "share" && writeDir) {
        const filePath = `${writeDir}${filename}`;
        await FileSystem.writeAsStringAsync(filePath, json, {
          encoding: FS.EncodingType.UTF8,
        });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(filePath, {
            mimeType: "application/json",
            dialogTitle: "Save your PassSaver backup",
            UTI: "public.json",
          });
          Alert.alert(
            "Success",
            `Backup exported (${entryCount} entr${entryCount === 1 ? "y" : "ies"}) and ready to share!`,
          );
        } else {
          Alert.alert(
            "Success",
            `Backup saved (${entryCount} entr${entryCount === 1 ? "y" : "ies"}) to: ${filePath}`,
          );
        }
      } else if (
        Platform.OS === "android" &&
        (FileSystem as any).StorageAccessFramework
          ?.requestDirectoryPermissionsAsync
      ) {
        const SAF = (FileSystem as any).StorageAccessFramework;
        const perm = await SAF.requestDirectoryPermissionsAsync();
        if (!perm.granted) {
          throw new Error("Export canceled (no directory permission)");
        }
        const uri = await SAF.createFileAsync(
          perm.directoryUri,
          filename,
          "application/json",
        );
        await FileSystem.writeAsStringAsync(uri, json, {
          encoding: FS.EncodingType.UTF8,
        });
        Alert.alert(
          "Success",
          mode === "download"
            ? `Backup downloaded (${entryCount} entr${entryCount === 1 ? "y" : "ies"}) to selected folder.`
            : `Backup exported (${entryCount} entr${entryCount === 1 ? "y" : "ies"}) to selected folder.`,
        );
      } else {
        throw new Error("No writable storage available on device");
      }
    } catch (e: any) {
      const message =
        typeof e?.message === "string"
          ? e.message
          : typeof e === "string"
            ? e
            : JSON.stringify(e);
      console.error("Export error details:", message, e?.stack);
      let errorMsg = "Export failed";
      if (message.includes("directory")) {
        errorMsg = "No writable storage available on device";
      } else if (message.includes("vault")) {
        errorMsg = "Vault access error (wrong master password?)";
      } else if ((e as any).code === "E_WRITE") {
        errorMsg = "Write permission denied";
      }
      Alert.alert("Export Failed", errorMsg);
    } finally {
      setExporting(false);
      exportInProgressRef.current = false;
      setShowExportModal(false);
    }
  };

  const handleExport = async () => {
    setExportName(`passsaver-backup-${Date.now()}`);
    setShowExportModal(true);
  };

  const handleImport = async () => {
    if (importing || importInProgressRef.current) return;

    importInProgressRef.current = true;
    setImporting(true);

    try {
      if (!masterPassword) {
        Alert.alert("Vault Locked", "Unlock your vault to import backups.");
        return;
      }

      console.log("Import requested");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        console.log("Import cancelled (picker)");

        // Try SAF on Android if available
        if (
          Platform.OS === "android" &&
          (FileSystem as any).StorageAccessFramework
            ?.requestDirectoryPermissionsAsync
        ) {
          const SAF = (FileSystem as any).StorageAccessFramework;
          const perm = await SAF.requestDirectoryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert("Import Cancelled", "No backup file was selected.");
            return;
          }
          const files: string[] = await SAF.readDirectoryAsync(
            perm.directoryUri,
          );
          const jsonUris = files.filter((u) =>
            u.toLowerCase().includes(".json"),
          );
          if (jsonUris.length === 0) {
            Alert.alert(
              "No Backup Found",
              "No .json backup file found in selected folder.",
            );
            return;
          }
          const sorted = [...jsonUris].sort((a, b) => {
            const an = decodeURIComponent(
              a.split("/").pop() || a,
            ).toLowerCase();
            const bn = decodeURIComponent(
              b.split("/").pop() || b,
            ).toLowerCase();
            return an.localeCompare(bn);
          });
          setSafChoices(
            sorted.map((uri) => ({
              uri,
              name: decodeURIComponent(uri.split("/").pop() || uri),
            })),
          );
          return;
        }

        Alert.alert("Import Cancelled", "No backup file was selected.");
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        Alert.alert("Import Failed", "No file selected.");
        return;
      }

      const fileAsset = result.assets[0];
      const fileUri = fileAsset.uri;
      console.log("Import file selected", {
        fileUri,
        name: fileAsset.name,
        mimeType: fileAsset.mimeType,
      });

      const json = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FS.EncodingType.UTF8,
      });
      console.log("Import file read", { length: json.length });
      await applyImportedJson(json);
    } catch (e) {
      console.error("Import error:", e);
      Alert.alert("Import Failed", "Could not read the selected backup file.");
    } finally {
      setImporting(false);
      importInProgressRef.current = false;
    }
  };

  useEffect(() => {
    if (!safChoices.length) return;

    const options = safChoices.slice(0, 8).map((c) => ({
      text: c.name,
      onPress: async () => {
        try {
          console.log("Import SAF file selected", {
            chosenUri: c.uri,
            name: c.name,
          });
          const json = await FileSystem.readAsStringAsync(c.uri, {
            encoding: FS.EncodingType.UTF8,
          });
          console.log("Import SAF file read", {
            length: json.length,
            name: c.name,
          });
          await applyImportedJson(json);
        } catch (e) {
          console.error("Import SAF read error:", e);
          Alert.alert("Import Failed", "Could not read selected backup file.");
        } finally {
          setSafChoices([]);
          setImporting(false);
          importInProgressRef.current = false;
        }
      },
    }));

    options.push({
      text: "Cancel",
      style: "cancel",
      onPress: () => {
        setSafChoices([]);
        setImporting(false);
        importInProgressRef.current = false;
      },
    } as any);

    Alert.alert(
      "Select Backup File",
      "Choose the exact .json file to import.",
      options as any,
    );
  }, [safChoices]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <FadeIn duration={400} delay={50}>
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
            <Text style={styles.headerTitle}>Settings</Text>
            <View style={{ width: 40 }} />
          </View>
        </FadeIn>

        {/* Security Section */}
        <View style={styles.sectionLabelContainer}>
          <Icon name={ACTION_ICONS.security} size={20} color={COLORS.accent} />
          <Text style={styles.sectionLabel}>Security</Text>
        </View>
        <View style={styles.section}>
          {/* Biometrics Toggle */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Icon
                name={ACTION_ICONS.biometric}
                size={24}
                color={COLORS.accent}
                style={styles.rowIcon}
              />
              <View>
                <Text style={styles.rowTitle}>Biometric Unlock</Text>
                <Text style={styles.rowSub}>
                  Use your device authentication (PIN/Face)
                </Text>
              </View>
            </View>
            <Switch
              value={settings.biometricsEnabled}
              onValueChange={handleToggleBiometrics}
              trackColor={{ false: COLORS.border, true: COLORS.accent }}
              thumbColor={COLORS.textPrimary}
            />
          </View>

          <View style={styles.divider} />

          {/* Security Mode Toggle */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Icon
                name={ACTION_ICONS.security}
                size={24}
                color={COLORS.accent}
                style={styles.rowIcon}
              />
              <View>
                <Text style={styles.rowTitle}>Security Mode</Text>
                <Text style={styles.rowSub}>
                  Strict clipboard & immediate background clear
                </Text>
              </View>
            </View>
            <Switch
              value={settings.securityMode}
              onValueChange={(value) => updateSetting("securityMode", value)}
              trackColor={{ false: COLORS.border, true: COLORS.accent }}
              thumbColor={COLORS.textPrimary}
            />
          </View>

          <View style={styles.divider} />

          {/* Change Password */}
          <TouchableOpacity
            style={styles.row}
            onPress={() => setShowChangePwd(true)}
          >
            <View style={styles.rowLeft}>
              <Icon
                name={ACTION_ICONS.key}
                size={24}
                color={COLORS.accent}
                style={styles.rowIcon}
              />
              <View>
                <Text style={styles.rowTitle}>Change Master Password</Text>
                <Text style={styles.rowSub}>Update your vault key</Text>
              </View>
            </View>
            <Icon
              name={ACTION_ICONS.chevron}
              size={24}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Lock Now */}
          <TouchableOpacity style={styles.row} onPress={handleLockNow}>
            <View style={styles.rowLeft}>
              <Icon
                name={ACTION_ICONS.lock}
                size={24}
                color={COLORS.accent}
                style={styles.rowIcon}
              />
              <View>
                <Text style={styles.rowTitle}>Lock Now</Text>
                <Text style={styles.rowSub}>Return to lock screen</Text>
              </View>
            </View>
            <Icon
              name={ACTION_ICONS.chevron}
              size={24}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Auto Lock Section */}
        <View style={styles.sectionLabelContainer}>
          <Icon name={ACTION_ICONS.timer} size={20} color={COLORS.accent} />
          <Text style={styles.sectionLabel}>Auto-Lock Timer</Text>
        </View>
        <View style={styles.section}>
          <View style={styles.optionGrid}>
            {AUTO_LOCK_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionChip,
                  settings.autoLockMinutes === opt.value &&
                    styles.optionChipActive,
                ]}
                onPress={() => updateSetting("autoLockMinutes", opt.value)}
              >
                <Text
                  style={[
                    styles.optionText,
                    settings.autoLockMinutes === opt.value &&
                      styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Clipboard Section */}
        <View style={styles.sectionLabelContainer}>
          <Icon name={ACTION_ICONS.clipboard} size={20} color={COLORS.accent} />
          <Text style={styles.sectionLabel}>Clipboard Auto-Clear</Text>
        </View>
        <View style={styles.section}>
          <View style={styles.optionGrid}>
            {CLIPBOARD_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionChip,
                  settings.clipboardTimeout === opt.value &&
                    styles.optionChipActive,
                ]}
                onPress={() => updateSetting("clipboardTimeout", opt.value)}
              >
                <Text
                  style={[
                    styles.optionText,
                    settings.clipboardTimeout === opt.value &&
                      styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Backup Section */}
        <View style={styles.sectionLabelContainer}>
          <Icon name={ACTION_ICONS.backup} size={20} color={COLORS.accent} />
          <Text style={styles.sectionLabel}>Backup & Restore</Text>
        </View>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.row}
            onPress={handleExport}
            disabled={exporting}
          >
            <View style={styles.rowLeft}>
              <Icon
                name={ACTION_ICONS.export}
                size={24}
                color={exporting ? COLORS.textSecondary : COLORS.accent}
                style={styles.rowIcon}
              />
              <View>
                <Text style={[styles.rowTitle, exporting && { opacity: 0.6 }]}>
                  Export Vault
                </Text>
                <Text style={styles.rowSub}>
                  {exporting ? "Exporting..." : "Save encrypted backup file"}
                </Text>
              </View>
            </View>
            {exporting ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Icon
                name={ACTION_ICONS.chevron}
                size={24}
                color={COLORS.textSecondary}
              />
            )}
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={handleImport}
            disabled={importing}
          >
            <View style={styles.rowLeft}>
              <Icon
                name={ACTION_ICONS.import}
                size={24}
                color={importing ? COLORS.textSecondary : COLORS.accent}
                style={styles.rowIcon}
              />
              <View>
                <Text style={styles.rowTitle}>Import Vault</Text>
                <Text style={styles.rowSub}>
                  {importing ? "Importing..." : "Restore from backup file"}
                </Text>
              </View>
            </View>
            {importing ? (
              <ActivityIndicator size="small" color={COLORS.accent} />
            ) : (
              <Icon
                name={ACTION_ICONS.chevron}
                size={24}
                color={COLORS.textSecondary}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.sectionLabelContainer}>
          <Icon name={ACTION_ICONS.warning} size={20} color={COLORS.danger} />
          <Text style={[styles.sectionLabel, { color: COLORS.danger }]}>
            Danger Zone
          </Text>
        </View>
        <View style={styles.section}>
          <TouchableOpacity style={styles.dangerRow} onPress={handleClearVault}>
            <Icon
              name={ACTION_ICONS.trash}
              size={24}
              color={COLORS.danger}
              style={styles.rowIcon}
            />
            <View>
              <Text style={styles.dangerTitle}>Clear Entire Vault</Text>
              <Text style={styles.rowSub}>
                Permanently delete all passwords
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.sectionLabelContainer}>
          <Icon name={ACTION_ICONS.info} size={20} color={COLORS.accent} />
          <Text style={styles.sectionLabel}>About</Text>
        </View>
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Icon
                name={ACTION_ICONS.security}
                size={24}
                color={COLORS.accent}
                style={styles.rowIcon}
              />
              <View>
                <Text style={styles.rowTitle}>PassSaver</Text>
                <Text style={styles.rowSub}>Version 1.0.0</Text>
              </View>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Icon
                name="shield-checkmark-outline"
                size={24}
                color={COLORS.accent}
                style={styles.rowIcon}
              />
              <View>
                <Text style={styles.rowTitle}>Encryption</Text>
                <Text style={styles.rowSub}>
                  AES-256 · Local only · Zero cloud
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* Change Password Modal */}
      <Modal visible={showExportModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Export Backup</Text>
            <View style={styles.modalInput}>
              <TextInput
                style={styles.modalTextInput}
                placeholder="File name (optional)"
                placeholderTextColor={COLORS.textSecondary}
                value={exportName}
                onChangeText={setExportName}
                autoCapitalize="none"
              />
            </View>
            <Text style={styles.rowSub}>
              If empty, filename uses timestamp automatically.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowExportModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => runExport("share")}
                disabled={exporting}
              >
                <Text style={styles.modalCancelText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, exporting && { opacity: 0.6 }]}
                onPress={() => runExport("download")}
                disabled={exporting}
              >
                <Text style={styles.modalSaveText}>
                  {exporting ? "Exporting..." : "Download"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePwd} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Change Master Password</Text>

            {[
              {
                placeholder: "Current Password",
                value: oldPwd,
                setter: setOldPwd,
              },
              { placeholder: "New Password", value: newPwd, setter: setNewPwd },
              {
                placeholder: "Confirm New",
                value: confPwd,
                setter: setConfPwd,
              },
            ].map((field, i) => (
              <View key={i} style={styles.modalInput}>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder={field.placeholder}
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry={!showPwd}
                  value={field.value}
                  onChangeText={field.setter}
                />
              </View>
            ))}

            <TouchableOpacity
              onPress={() => setShowPwd(!showPwd)}
              style={styles.showPwdBtn}
            >
              <Icon
                name={
                  showPwd ? ACTION_ICONS.visibilityOff : ACTION_ICONS.visibility
                }
                size={20}
                color={COLORS.textSecondary}
              />
              <Text style={styles.showPwdText}>
                {showPwd ? "Hide" : "Show"} password
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowChangePwd(false);
                  setOldPwd("");
                  setNewPwd("");
                  setConfPwd("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, saving && { opacity: 0.6 }]}
                onPress={handleChangePassword}
                disabled={saving}
              >
                <Text style={styles.modalSaveText}>
                  {saving ? "Saving..." : "Update"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.glowCircle} />
    </View>
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
  sectionLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.xl,
    marginTop: SPACING.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.sm,
  },
  headerTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
    marginLeft: SPACING.xs,
  },
  section: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...SHADOWS.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.lg,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    flex: 1,
  },
  rowIcon: { marginRight: SPACING.md },
  rowTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  rowSub: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    padding: SPACING.md,
  },
  optionChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  optionChipActive: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.accent,
    borderWidth: 2,
  },
  optionText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    fontWeight: FONTS.weights.medium,
  },
  optionTextActive: {
    color: COLORS.accent,
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
  },
  dangerTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.medium,
    color: COLORS.danger,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    gap: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.lg,
  },
  modalTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  modalInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  modalTextInput: {
    height: 48,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
  },
  showPwdBtn: {
    alignItems: "center",
  },
  showPwdText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
  },
  modalActions: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  modalCancel: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.medium,
  },
  modalSave: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.glow,
  },
  modalSaveText: {
    color: COLORS.background,
    fontSize: FONTS.sizes.md,
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
    zIndex: -1,
  },
});
