import React, { useState, useEffect } from "react";
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
import { exportVault, getBackupEntryCount, importVault } from "../utils/storage";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as LocalAuthentication from "expo-local-authentication";
import { COLORS, FONTS, SPACING } from "../constants/theme";
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
} from "../utils/storage";
import { ACTION_ICONS } from "../utils/icons";

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
  const { masterPassword, setMasterPassword } = useSession();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  // Expo's FileSystem typings vary by SDK/version; cast to avoid TS-only failures.
  const FS: any = FileSystem;

  // Change password modal
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportName, setExportName] = useState("");
  const [safChoices, setSafChoices] = useState<Array<{ uri: string; name: string }>>(
    [],
  );
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confPwd, setConfPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInProgressRef = React.useRef(false);
  const exportInProgressRef = React.useRef(false);
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const applyImportedJson = async (json: string) => {
    let backupCount = 0;
    try {
      backupCount = await getBackupEntryCount(json, masterPassword);
    } catch (e) {
      console.error("Backup preview failed:", e);
    }

    if (backupCount > 0) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Confirm Import",
          `Backup contains ${backupCount} entr${backupCount === 1 ? "y" : "ies"}. Import now?`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Import", onPress: () => resolve(true) },
          ],
        );
      });
      if (!proceed) return;
    }

    const { success, count, error, entries } = await importVault(json, masterPassword);
    console.log("Import merge result", { success, count, error });
    if (success) {
      Alert.alert(
        "Import Successful",
        count === 0
          ? "No new entries added. Existing entries were preserved."
          : `${count} entries imported. Existing data was preserved.`,
        [
          {
            text: "OK",
            onPress: () => navigation.navigate("Home", { vaultSnapshot: entries }),
          },
        ],
      );
    } else {
      Alert.alert(
        "Import Failed",
        error || "Invalid backup file or wrong master password.",
      );
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
          if (msg.includes("No hardware available for biometric authentication")) {
            console.warn("SecureStore biometric auth unavailable; using LocalAuth gate");
            const auth = await LocalAuthentication.authenticateAsync({
              promptMessage: "Enable biometric unlock",
              disableDeviceFallback: false,
            });
            if (!auth.success) {
              await updateSetting("biometricsEnabled", false);
              return;
            }
            await saveBiometricPasswordLocalAuthGate(masterPassword);
            await setBiometricMode("localAuthGate");
          } else {
            throw e;
          }
        }

        const confirmed =
          (await getBiometricPassword()) ?? (await getBiometricPasswordNoAuth());

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
        (FileSystem as any).StorageAccessFramework?.requestDirectoryPermissionsAsync
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
    // Lock immediately to prevent double taps causing picker concurrency errors.
    importInProgressRef.current = true;
    setImporting(true);
    if (!masterPassword) {
      Alert.alert("Vault Locked", "Unlock your vault to import backups.");
      setImporting(false);
      importInProgressRef.current = false;
      return;
    }
    try {
      console.log("Import requested");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        console.log("Import cancelled (picker)");
        if (
          Platform.OS === "android" &&
          (FileSystem as any).StorageAccessFramework?.requestDirectoryPermissionsAsync
        ) {
          const SAF = (FileSystem as any).StorageAccessFramework;
          const perm = await SAF.requestDirectoryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert("Import Cancelled", "No backup file was selected.");
            return;
          }
          const files: string[] = await SAF.readDirectoryAsync(perm.directoryUri);
          const jsonUris = files.filter((u) => u.toLowerCase().includes(".json"));
          if (jsonUris.length === 0) {
            Alert.alert(
              "No Backup Found",
              "No .json backup file found in selected folder.",
            );
            return;
          }
          const sorted = [...jsonUris].sort((a, b) => {
            const an = decodeURIComponent(a.split("/").pop() || a).toLowerCase();
            const bn = decodeURIComponent(b.split("/").pop() || b).toLowerCase();
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
          console.log("Import SAF file selected", { chosenUri: c.uri, name: c.name });
          const json = await FileSystem.readAsStringAsync(c.uri, {
            encoding: FS.EncodingType.UTF8,
          });
          console.log("Import SAF file read", { length: json.length, name: c.name });
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
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Icon
              name={ACTION_ICONS.back}
              size={24}
              color={COLORS.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>

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
                <Text style={styles.rowSub}>Use your device authentication (PIN/Face)</Text>
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
  },
  headerTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  sectionLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    flex: 1,
  },
  rowIcon: { marginRight: SPACING.md },
  rowTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.medium,
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
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionChipActive: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.accent,
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
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    height: 50,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
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
