import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import CryptoJS from "crypto-js";
import { PasswordEntry } from "../types";
import { v4 as uuidv4 } from "uuid";

const MASTER_HASH_KEY = "master_password_hash";
const VAULT_KEY = "vault_data";
const VAULT_KEY_ASYNC = "vault_data_async";
const SALT_KEY = "vault_salt";
const BIO_KEY = "biometric_master_password";
const BIO_MODE_KEY = "biometric_mode";
const VAULT_UNRECOVERABLE_KEY = "vault_unrecoverable";

const PBKDF2_ITERATIONS = 2000;
const PREVIOUS_PBKDF2_ITERATIONS = 10000;
const LEGACY_PBKDF2_ITERATIONS = 100000;
const KEY_SIZE = 256 / 32;
const EXPORT_VERSION = 2;
const EXPORT_SALT_BYTES = 16; // 128-bit
const VALID_CATEGORIES = new Set([
  "Social",
  "Banking",
  "Email",
  "Work",
  "Shopping",
  "Gaming",
  "Other",
]);

// ─── Import Mode & Backup Schema ────────────────────────────────
export type ImportMode = "merge" | "replace" | "merge-dedup";

interface BackupMetadata {
  appVersion?: string;
  platform?: "ios" | "android" | "web";
  exportedAt: number;
}

interface BackupPayload {
  version: number;
  format: string; // "v2" for new format with metadata
  exportedAt: number;
  entryCount: number;
  salt: string;
  iterations: number;
  data: string;
  dataHash?: string; // SHA256 for integrity verification
  metadata?: BackupMetadata;
}

const MAX_BACKUP_SIZE_MB = 50; // 50MB limit
const MAX_BACKUP_ENTRIES = 50000; // 50k entries max
let importInProgressLock = false;

// ─── Key Derivation ────────────────────────────────────────────

// PBKDF2 via CryptoJS is expensive on mobile JS engines. Cache derived keys
// in-memory for the current session to avoid re-deriving on every encrypt/decrypt.
const derivedKeyCache = new Map<string, string>();
const cacheKeyId = (password: string, salt: string, iterations: number) =>
  `${iterations}:${salt}:${password}`;
const clearDerivedKeyCache = () => derivedKeyCache.clear();

type VaultRuntimeCache = {
  passwordHash: string;
  entries: PasswordEntry[];
};
let vaultRuntimeCache: VaultRuntimeCache | null = null;
let vaultWriteQueue: Promise<unknown> = Promise.resolve();

const cloneEntries = (entries: PasswordEntry[]): PasswordEntry[] =>
  entries.map((entry) => ({ ...entry }));

const getCachedVaultEntries = (
  masterPassword: string,
): PasswordEntry[] | null => {
  if (!vaultRuntimeCache) return null;
  if (vaultRuntimeCache.passwordHash !== hashPassword(masterPassword))
    return null;
  return cloneEntries(vaultRuntimeCache.entries);
};

const setCachedVaultEntries = (
  masterPassword: string,
  entries: PasswordEntry[],
): void => {
  vaultRuntimeCache = {
    passwordHash: hashPassword(masterPassword),
    entries: cloneEntries(entries),
  };
};

const clearVaultRuntimeCache = (): void => {
  vaultRuntimeCache = null;
};

const nowMs = (): number => Date.now();
const logPerf = (
  label: string,
  startedAt: number,
  extra?: Record<string, unknown>,
) => {
  if (!__DEV__) return;
  const elapsedMs = nowMs() - startedAt;
  console.log(`[perf] ${label}`, { elapsedMs, ...(extra ?? {}) });
};

const enqueueVaultWrite = async <T>(fn: () => Promise<T>): Promise<T> => {
  const run = vaultWriteQueue.then(fn, fn);
  vaultWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

const persistVaultEntries = async (
  entries: PasswordEntry[],
  masterPassword: string,
): Promise<void> => {
  const json = JSON.stringify(entries);
  const cipher = await encryptData(json, masterPassword);
  await setVaultCiphertext(cipher);
  await SecureStore.deleteItemAsync(VAULT_UNRECOVERABLE_KEY);
  setCachedVaultEntries(masterPassword, entries);
};

/**
 * Derives a strong cryptographic key from a password and salt.
 */
const deriveKey = async (
  password: string,
  opts?: { createSaltIfMissing?: boolean; iterations?: number },
): Promise<string> => {
  const { createSaltIfMissing = false, iterations = PBKDF2_ITERATIONS } =
    opts ?? {};
  let salt = await SecureStore.getItemAsync(SALT_KEY);
  if (!salt) {
    if (!createSaltIfMissing) {
      throw new Error("Missing vault salt");
    }

    salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
    await SecureStore.setItemAsync(SALT_KEY, salt);
  }
  const id = cacheKeyId(password, salt, iterations);
  const cached = derivedKeyCache.get(id);
  if (cached) return cached;

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE,
    iterations,
  }).toString();
  derivedKeyCache.set(id, key);
  return key;
};

const deriveKeyWithSalt = (
  password: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): string => {
  const id = cacheKeyId(password, salt, iterations);
  const cached = derivedKeyCache.get(id);
  if (cached) return cached;

  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE,
    iterations,
  }).toString();
  derivedKeyCache.set(id, key);
  return key;
};

const getVaultCiphertext = async (): Promise<string | null> => {
  // Primary location: AsyncStorage to avoid SecureStore payload limits.
  const asyncCipher = await AsyncStorage.getItem(VAULT_KEY_ASYNC);
  if (asyncCipher) return asyncCipher;

  // Legacy fallback: SecureStore location used by older builds.
  const legacyCipher = await SecureStore.getItemAsync(VAULT_KEY);
  if (legacyCipher) {
    // One-time migration.
    await AsyncStorage.setItem(VAULT_KEY_ASYNC, legacyCipher);
    await SecureStore.deleteItemAsync(VAULT_KEY);
    return legacyCipher;
  }
  return null;
};

const setVaultCiphertext = async (cipher: string): Promise<void> => {
  await AsyncStorage.setItem(VAULT_KEY_ASYNC, cipher);
  // Keep legacy key clean.
  await SecureStore.deleteItemAsync(VAULT_KEY);
};

const deleteVaultCiphertext = async (): Promise<void> => {
  await AsyncStorage.removeItem(VAULT_KEY_ASYNC);
  await SecureStore.deleteItemAsync(VAULT_KEY);
};

// ─── Master Password ───────────────────────────────────────────
export const hashPassword = (password: string): string =>
  CryptoJS.SHA256(password).toString();

export const saveMasterPassword = async (password: string): Promise<void> => {
  // console.log("saveMasterPassword called");
  const hash = hashPassword(password);
  await SecureStore.setItemAsync(MASTER_HASH_KEY, hash);
};

/**
 * Stores the password for biometric unlock, protected by the device's
 * hardware security (Keychain/Keystore).
 */
export const saveBiometricPassword = async (
  password: string,
): Promise<void> => {
  await SecureStore.setItemAsync(BIO_KEY, password, {
    requireAuthentication: true,
  });
};

export const saveBiometricPasswordLocalAuthGate = async (
  password: string,
): Promise<void> => {
  // Stored normally; access must be gated by expo-local-authentication in the UI.
  await SecureStore.setItemAsync(BIO_KEY, password);
};

export type BiometricMode = "secureStoreAuth" | "localAuthGate";

export const setBiometricMode = async (mode: BiometricMode): Promise<void> => {
  await SecureStore.setItemAsync(BIO_MODE_KEY, mode);
};

export const getBiometricMode = async (): Promise<BiometricMode> => {
  const mode = await SecureStore.getItemAsync(BIO_MODE_KEY);
  return mode === "localAuthGate" ? "localAuthGate" : "secureStoreAuth";
};

type GetItemOptions = Parameters<typeof SecureStore.getItemAsync>[1];

export const getBiometricPassword = async (
  opts?: GetItemOptions,
): Promise<string | null> => {
  // If the secret was written with requireAuthentication, we must also request
  // authentication when reading on Android (and it keeps behavior consistent).
  return await SecureStore.getItemAsync(BIO_KEY, {
    requireAuthentication: true,
    ...(opts as any),
  });
};

export const getBiometricPasswordNoAuth = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(BIO_KEY);
};

export const removeBiometricPassword = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(BIO_KEY);
  await SecureStore.deleteItemAsync(BIO_MODE_KEY);
};

export const isMasterPasswordSet = async (): Promise<boolean> => {
  const hash = await SecureStore.getItemAsync(MASTER_HASH_KEY);
  return hash !== null;
};

export const verifyMasterPassword = async (
  password: string,
): Promise<boolean> => {
  // console.log("verifyMasterPassword called");
  const storedHash = await SecureStore.getItemAsync(MASTER_HASH_KEY);
  if (!storedHash) return false;
  return storedHash === hashPassword(password);
};

export const canUnlockVault = async (
  masterPassword: string,
): Promise<boolean> => {
  // console.log("canUnlockVault called");
  const cipher = await getVaultCiphertext();
  if (!cipher) {
    return true;
  }
  try {
    await loadVault(masterPassword, { returnEmptyOnInvalid: false });
    return true;
  } catch (error) {
    console.error("Vault integrity check failed", error);
    return false;
  }
};

export const resetCorruptedVaultData = async (
  masterPassword: string,
): Promise<void> => {
  await deleteVaultCiphertext();
  await SecureStore.deleteItemAsync(SALT_KEY);
  await SecureStore.deleteItemAsync(VAULT_UNRECOVERABLE_KEY);
  clearDerivedKeyCache();
  await saveVault([], masterPassword);
};

// ─── Vault Encryption ──────────────────────────────────────────
export const encryptData = async (
  data: string,
  masterPassword: string,
): Promise<string> => {
  // console.log("encryptData called", { dataLength: data.length });
  const key = await deriveKey(masterPassword, { createSaltIfMissing: true });
  return CryptoJS.AES.encrypt(data, key).toString();
};

const encryptDataPortable = (
  data: string,
  masterPassword: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): string => {
  const key = deriveKeyWithSalt(masterPassword, salt, iterations);
  return CryptoJS.AES.encrypt(data, key).toString();
};

export const decryptData = async (
  cipher: string,
  masterPassword: string,
): Promise<string> => {
  try {
    const key = await deriveKey(masterPassword, {
      createSaltIfMissing: false,
      iterations: PBKDF2_ITERATIONS,
    });
    const bytes = CryptoJS.AES.decrypt(cipher, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    // Wrong password / legacy ciphertext can throw UTF-8 decode errors.
    // Return empty so callers handle it as decryption failure.
    if (__DEV__) {
      console.log("decryptData primary strategy failed; trying fallbacks");
    }
    return "";
  }
};

const decryptDataPortable = (
  cipher: string,
  masterPassword: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS,
): string => {
  const key = deriveKeyWithSalt(masterPassword, salt, iterations);
  const bytes = CryptoJS.AES.decrypt(cipher, key);
  return bytes.toString(CryptoJS.enc.Utf8);
};

const tryDecryptWithKey = (cipher: string, key: string): string => {
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
};

const decryptDataWithFallback = async (
  cipher: string,
  masterPassword: string,
): Promise<{ json: string; strategy: string }> => {
  const primary = await decryptData(cipher, masterPassword);
  if (primary) return { json: primary, strategy: "pbkdf2+salt" };

  try {
    const previousSaltedKey = await deriveKey(masterPassword, {
      createSaltIfMissing: false,
      iterations: PREVIOUS_PBKDF2_ITERATIONS,
    });
    const previousSalted = tryDecryptWithKey(cipher, previousSaltedKey);
    if (previousSalted) {
      return { json: previousSalted, strategy: "pbkdf2+salt-previous" };
    }
  } catch {
    // Salt missing; continue with older fallback strategies.
  }

  try {
    const legacySaltedKey = await deriveKey(masterPassword, {
      createSaltIfMissing: false,
      iterations: LEGACY_PBKDF2_ITERATIONS,
    });
    const legacySalted = tryDecryptWithKey(cipher, legacySaltedKey);
    if (legacySalted) {
      return { json: legacySalted, strategy: "legacy-pbkdf2+salt" };
    }
  } catch {
    // Salt missing; continue with unsalted legacy fallbacks.
  }

  // Best-effort compatibility for older encryption formats.
  const legacyRaw = tryDecryptWithKey(cipher, masterPassword);
  if (legacyRaw) return { json: legacyRaw, strategy: "raw-password" };

  const legacySha = tryDecryptWithKey(
    cipher,
    CryptoJS.SHA256(masterPassword).toString(),
  );
  if (legacySha) return { json: legacySha, strategy: "sha256-password" };

  const legacyPbkdf2NoSalt = tryDecryptWithKey(
    cipher,
    CryptoJS.PBKDF2(masterPassword, "", {
      keySize: KEY_SIZE,
      iterations: LEGACY_PBKDF2_ITERATIONS,
    }).toString(),
  );
  if (legacyPbkdf2NoSalt)
    return { json: legacyPbkdf2NoSalt, strategy: "pbkdf2-no-salt" };

  return { json: "", strategy: "none" };
};

// ─── Vault CRUD ────────────────────────────────────────────────
export interface LoadVaultOptions {
  /**
   * When true (default), return `[]` for invalid master passwords or corrupted
   * vault data. When false, throw so callers (export/import) can fail safely.
   */
  returnEmptyOnInvalid?: boolean;
}

export const loadVault = async (
  masterPassword: string,
  opts?: LoadVaultOptions,
): Promise<PasswordEntry[]> => {
  const startedAt = nowMs();
  console.log("loadVault called", {
    returnEmptyOnInvalid: opts?.returnEmptyOnInvalid ?? true,
  });
  const { returnEmptyOnInvalid = true } = opts ?? {};

  const cachedEntries = getCachedVaultEntries(masterPassword);
  if (cachedEntries) {
    logPerf("loadVault.cacheHit", startedAt, { entries: cachedEntries.length });
    return cachedEntries;
  }

  if (returnEmptyOnInvalid) {
    const unrecoverable = await SecureStore.getItemAsync(
      VAULT_UNRECOVERABLE_KEY,
    );
    if (unrecoverable === "1") {
      return [];
    }
  }

  const cipher = await getVaultCiphertext();
  if (!cipher) {
    setCachedVaultEntries(masterPassword, []);
    logPerf("loadVault.noCipher", startedAt, { entries: 0 });
    return [];
  }

  let json: string;
  let strategy = "none";
  try {
    const decryptStartedAt = nowMs();
    const decrypted = await decryptDataWithFallback(cipher, masterPassword);
    logPerf("loadVault.decrypt", decryptStartedAt, {
      strategy: decrypted.strategy,
    });
    json = decrypted.json;
    strategy = decrypted.strategy;
    /* decrypt strategy logging removed */
  } catch {
    if (returnEmptyOnInvalid) return [];
    throw new Error("Invalid master password or decryption failed");
  }

  if (!json) {
    clearVaultRuntimeCache();
    await SecureStore.setItemAsync(VAULT_UNRECOVERABLE_KEY, "1");
    if (returnEmptyOnInvalid) return [];
    // If json is empty but cipher existed, it usually means the key was wrong
    // CryptoJS.AES.decrypt returns an empty string for wrong keys.
    throw new Error("Failed to decrypt vault (wrong master password?)");
  }

  try {
    const parsed = JSON.parse(json) as PasswordEntry[];

    // Migrate once only when legacy fallback decrypted the payload.
    if (strategy !== "pbkdf2+salt") {
      const normalizedCipher = await encryptData(
        JSON.stringify(parsed),
        masterPassword,
      );
      await setVaultCiphertext(normalizedCipher);
    }
    await SecureStore.deleteItemAsync(VAULT_UNRECOVERABLE_KEY);
    setCachedVaultEntries(masterPassword, parsed);
    logPerf("loadVault.total", startedAt, {
      entries: parsed.length,
      strategy,
    });
    return parsed;
  } catch {
    console.error("Vault JSON parse failed");
    clearVaultRuntimeCache();
    await SecureStore.setItemAsync(VAULT_UNRECOVERABLE_KEY, "1");
    if (returnEmptyOnInvalid) return [];
    throw new Error("Vault data is corrupted or has an invalid format.");
  }
};

export const saveVault = async (
  entries: PasswordEntry[],
  masterPassword: string,
): Promise<void> => {
  const startedAt = nowMs();
  // console.log("saveVault called", { entries: entries.length });
  await enqueueVaultWrite(async () => {
    await persistVaultEntries(entries, masterPassword);
  });
  logPerf("saveVault.total", startedAt, { entries: entries.length });
};

export const addEntry = async (
  entry: PasswordEntry,
  masterPassword: string,
): Promise<void> => {
  // console.log("addEntry called", { id: entry.id, title: entry.title });
  await enqueueVaultWrite(async () => {
    const entries =
      getCachedVaultEntries(masterPassword) ??
      (await loadVault(masterPassword, { returnEmptyOnInvalid: false }));
    await persistVaultEntries([...entries, entry], masterPassword);
  });
};

export const updateEntry = async (
  updated: PasswordEntry,
  masterPassword: string,
): Promise<void> => {
  // console.log("updateEntry called", { id: updated.id, title: updated.title });
  await enqueueVaultWrite(async () => {
    const entries =
      getCachedVaultEntries(masterPassword) ??
      (await loadVault(masterPassword, { returnEmptyOnInvalid: false }));
    const nextEntries = entries.map((entry) =>
      entry.id === updated.id ? updated : entry,
    );
    await persistVaultEntries(nextEntries, masterPassword);
  });
};

export const deleteEntry = async (
  id: string,
  masterPassword: string,
): Promise<void> => {
  // console.log("deleteEntry called", { id });
  await enqueueVaultWrite(async () => {
    const entries =
      getCachedVaultEntries(masterPassword) ??
      (await loadVault(masterPassword, { returnEmptyOnInvalid: false }));
    const filtered = entries.filter((entry) => entry.id !== id);
    await persistVaultEntries(filtered, masterPassword);
  });
};

// ─── Settings ──────────────────────────────────────────────────
const SETTINGS_KEY = "app_settings";
let settingsRuntimeCache: AppSettings | null = null;

export interface AppSettings {
  biometricsEnabled: boolean;
  autoLockMinutes: number; // 1, 2, 5, 10, 0 = never
  clipboardTimeout: number; // seconds, 0 = never
  securityMode: boolean; // strict clipboard + immediate background clear
}

export const DEFAULT_SETTINGS: AppSettings = {
  biometricsEnabled: true,
  autoLockMinutes: 2,
  clipboardTimeout: 30,
  securityMode: false,
};

export const loadSettings = async (): Promise<AppSettings> => {
  if (settingsRuntimeCache) return { ...settingsRuntimeCache };
  if (false) console.log("dev");
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    const parsed = raw
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      : DEFAULT_SETTINGS;
    settingsRuntimeCache = parsed;
    return { ...parsed };
  } catch {
    settingsRuntimeCache = DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  if (false) console.log("dev");
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
  settingsRuntimeCache = { ...settings };
};

export const clearVault = async (): Promise<void> => {
  await deleteVaultCiphertext();
  await SecureStore.deleteItemAsync(BIO_KEY);
  clearVaultRuntimeCache();
  clearDerivedKeyCache();
};

export const changeMasterPassword = async (
  oldPassword: string,
  newPassword: string,
): Promise<boolean> => {
  const valid = await verifyMasterPassword(oldPassword);
  if (!valid) return false;
  // Re-encrypt vault with new password
  const entries = await loadVault(oldPassword);
  await saveMasterPassword(newPassword);
  await saveVault(entries, newPassword);
  return true;
};

// ─── Favorites ─────────────────────────────────────────────────
export const toggleFavorite = async (
  id: string,
  masterPassword: string,
): Promise<void> => {
  try {
    await enqueueVaultWrite(async () => {
      const entries =
        getCachedVaultEntries(masterPassword) ??
        (await loadVault(masterPassword, { returnEmptyOnInvalid: false }));
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) {
        throw new Error(`Entry with id "${id}" not found in vault`);
      }
      const nextEntries = entries.map((entry) =>
        entry.id === id ? { ...entry, isFavorite: !entry.isFavorite } : entry,
      );
      await persistVaultEntries(nextEntries, masterPassword);
    });
  } catch (error) {
    console.error("Toggle favorite error:", error);
    throw error;
  }
};

// ─── Backup Validation & Utils ─────────────────────────────────

/**
 * Calculates SHA256 hash of data for integrity verification
 */
const calculateDataHash = (data: string): string => {
  return CryptoJS.SHA256(data).toString();
};

/**
 * Validates backup file structure and size
 */
export const validateBackupFile = (
  json: string,
): { valid: boolean; error?: string } => {
  try {
    // Check size before parsing (prevent OOM)
    const sizeInMB = new TextEncoder().encode(json).length / (1024 * 1024);
    if (sizeInMB > MAX_BACKUP_SIZE_MB) {
      return {
        valid: false,
        error: `Backup file too large (${sizeInMB.toFixed(1)}MB > ${MAX_BACKUP_SIZE_MB}MB)`,
      };
    }

    const payload = JSON.parse(json);

    // Validate structure
    if (!payload || typeof payload !== "object") {
      return { valid: false, error: "Invalid backup structure" };
    }

    if (!payload.data || typeof payload.data !== "string") {
      return { valid: false, error: "Backup missing encrypted data" };
    }

    if (typeof payload.salt !== "string" || !payload.salt) {
      return { valid: false, error: "Backup missing encryption salt" };
    }

    // Validate version
    if (payload.version !== 1 && payload.version !== 2) {
      return {
        valid: false,
        error: `Unsupported backup version: ${payload.version}`,
      };
    }

    // Validate entry count if present
    if (
      payload.entryCount !== undefined &&
      payload.entryCount > MAX_BACKUP_ENTRIES
    ) {
      return {
        valid: false,
        error: `Backup contains too many entries (${payload.entryCount} > ${MAX_BACKUP_ENTRIES})`,
      };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: `Invalid backup format: ${String(e)}` };
  }
};

/**
 * Extracts metadata from backup without decrypting
 */
export const getBackupMetadata = (
  json: string,
): {
  valid: boolean;
  metadata?: {
    version: number;
    entryCount: number;
    exportedAt: number;
    appVersion?: string;
    platform?: string;
  };
  error?: string;
} => {
  try {
    const payload = JSON.parse(json) as BackupPayload;
    return {
      valid: true,
      metadata: {
        version: payload.version,
        entryCount: payload.entryCount || 0,
        exportedAt: payload.exportedAt,
        appVersion: payload.metadata?.appVersion,
        platform: payload.metadata?.platform,
      },
    };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
};

/**
 * Verifies backup integrity using stored hash
 */
export const verifyBackupIntegrity = async (
  json: string,
  masterPassword: string,
): Promise<{ valid: boolean; error?: string }> => {
  try {
    const payload = JSON.parse(json) as BackupPayload;

    // If no hash stored, skip verification (old backup format)
    if (!payload.dataHash) {
      if (__DEV__)
        console.log("No data hash in backup, skipping integrity check");
      return { valid: true };
    }

    // Verify hash matches
    const calculatedHash = calculateDataHash(payload.data);
    if (calculatedHash !== payload.dataHash) {
      return {
        valid: false,
        error: "Backup integrity check failed (data corrupted?)",
      };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: `Integrity check error: ${String(e)}` };
  }
};

/**
 * Creates a snapshot of current vault for rollback
 */
const createVaultSnapshot = async (
  masterPassword: string,
): Promise<string | null> => {
  try {
    const entries = await loadVault(masterPassword, {
      returnEmptyOnInvalid: false,
    });
    return JSON.stringify(entries);
  } catch {
    return null;
  }
};

/**
 * Restores vault from snapshot on import failure
 */
const restoreVaultFromSnapshot = async (
  snapshot: string,
  masterPassword: string,
): Promise<void> => {
  try {
    const entries = JSON.parse(snapshot) as PasswordEntry[];
    await saveVault(entries, masterPassword);
  } catch (e) {
    console.error("Rollback failed:", e);
  }
};

// ─── Export / Import ───────────────────────────────────────────
export const exportVault = async (masterPassword: string): Promise<string> => {
  try {
    // For export, we should not silently export an empty vault when the
    // master password is wrong.
    const entries = await loadVault(masterPassword, {
      returnEmptyOnInvalid: false,
    });
    // Portable export: encrypt with a random per-export salt stored in the file.
    const exportSalt =
      CryptoJS.lib.WordArray.random(EXPORT_SALT_BYTES).toString();
    const iterations = PBKDF2_ITERATIONS;
    const encrypted = encryptDataPortable(
      JSON.stringify(entries),
      masterPassword,
      exportSalt,
      iterations,
    );

    // Calculate integrity hash
    const dataHash = calculateDataHash(encrypted);

    const payload: BackupPayload = {
      version: EXPORT_VERSION,
      format: "v2",
      exportedAt: Date.now(),
      entryCount: entries.length,
      salt: exportSalt,
      iterations,
      data: encrypted,
      dataHash,
      metadata: {
        exportedAt: Date.now(),
        platform: __DEV__
          ? "web"
          : (require("react-native").Platform.OS as any),
      },
    };
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    console.error("exportVault error:", error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to prepare vault export: ${message}`);
  }
};

export const getBackupEntryCount = async (
  rawBackupJson: string,
  masterPassword: string,
): Promise<number> => {
  const decoded = await decodeBackup(rawBackupJson, masterPassword);
  if (!Array.isArray(decoded)) {
    throw new Error("Invalid backup data format");
  }
  return decoded.length;
};

export const importVault = async (
  json: string,
  masterPassword: string,
): Promise<{
  success: boolean;
  count: number;
  entries?: PasswordEntry[];
  error?: string;
}> => {
  try {
    const imported = await decodeBackup(json, masterPassword);

    if (!Array.isArray(imported)) {
      return { success: false, count: 0, error: "Invalid data format" };
    }

    const normalizeEntry = (entry: any): PasswordEntry | null => {
      if (
        !entry ||
        typeof entry.title !== "string" ||
        typeof entry.username !== "string" ||
        typeof entry.password !== "string"
      ) {
        return null;
      }
      const now = Date.now();
      const category =
        typeof entry.category === "string" &&
        VALID_CATEGORIES.has(entry.category)
          ? entry.category
          : "Other";
      return {
        id: typeof entry.id === "string" && entry.id ? entry.id : uuidv4(),
        title: entry.title,
        username: entry.username,
        password: entry.password,
        notes: typeof entry.notes === "string" ? entry.notes : "",
        createdAt: typeof entry.createdAt === "number" ? entry.createdAt : now,
        updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : now,
        isFavorite:
          typeof entry.isFavorite === "boolean" ? entry.isFavorite : false,
        category: category as PasswordEntry["category"],
      };
    };

    // For import, failing fast avoids overwriting a corrupted/locked vault.
    const existing = await loadVault(masterPassword, {
      returnEmptyOnInvalid: false,
    });

    // Merge safely: never overwrite existing entries.
    const merged = [...existing];
    const existingIds = new Set(existing.map((e) => e.id));
    let count = 0;
    for (const entry of imported) {
      const normalized = normalizeEntry(entry);
      if (!normalized) continue;

      const candidate = { ...normalized };
      // If id already exists, keep both by assigning a new unique id.
      while (existingIds.has(candidate.id)) {
        candidate.id = uuidv4();
      }
      merged.push(candidate);
      existingIds.add(candidate.id);
      count++;
    }
    await saveVault(merged, masterPassword);
    return { success: true, count, entries: merged };
  } catch (err) {
    console.error("Import error:", err);
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Enhanced import with mode selection and validation
 * Modes:
 * - "merge": Add new entries, keep existing (default, safest)
 * - "replace": Replace entire vault with backup contents
 * - "merge-dedup": Merge but remove exact duplicates
 */
export const importVaultWithMode = async (
  json: string,
  masterPassword: string,
  mode: ImportMode = "merge",
): Promise<{
  success: boolean;
  count: number;
  entries?: PasswordEntry[];
  duplicateCount?: number;
  error?: string;
}> => {
  // Prevent concurrent imports
  if (importInProgressLock) {
    return {
      success: false,
      count: 0,
      error: "Import already in progress. Please wait.",
    };
  }

  importInProgressLock = true;
  let vaultSnapshot: string | null = null;

  try {
    // Step 1: Validate backup file before any operations
    const validation = validateBackupFile(json);
    if (!validation.valid) {
      return { success: false, count: 0, error: validation.error };
    }

    // Step 2: Verify integrity if hash present
    const integrity = await verifyBackupIntegrity(json, masterPassword);
    if (!integrity.valid) {
      return { success: false, count: 0, error: integrity.error };
    }

    // Step 3: Create snapshot for rollback
    vaultSnapshot = await createVaultSnapshot(masterPassword);

    // Step 4: Decode backup
    const imported = await decodeBackup(json, masterPassword);

    if (!Array.isArray(imported)) {
      return { success: false, count: 0, error: "Invalid data format" };
    }

    const normalizeEntry = (entry: any): PasswordEntry | null => {
      if (
        !entry ||
        typeof entry.title !== "string" ||
        typeof entry.username !== "string" ||
        typeof entry.password !== "string"
      ) {
        return null;
      }
      const now = Date.now();
      const category =
        typeof entry.category === "string" &&
        VALID_CATEGORIES.has(entry.category)
          ? entry.category
          : "Other";
      return {
        id: typeof entry.id === "string" && entry.id ? entry.id : uuidv4(),
        title: entry.title,
        username: entry.username,
        password: entry.password,
        notes: typeof entry.notes === "string" ? entry.notes : "",
        createdAt: typeof entry.createdAt === "number" ? entry.createdAt : now,
        updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : now,
        isFavorite:
          typeof entry.isFavorite === "boolean" ? entry.isFavorite : false,
        category: category as PasswordEntry["category"],
      };
    };

    const existing = await loadVault(masterPassword, {
      returnEmptyOnInvalid: false,
    });

    console.log("importVaultWithMode - loaded existing", {
      mode,
      existingCount: existing.length,
      importedCount: imported.length,
    });

    let result: PasswordEntry[];
    let count = 0;
    let duplicateCount = 0;

    if (mode === "replace") {
      console.log("importVaultWithMode - starting REPLACE mode");
      // REPLACE: Use only imported entries
      result = [];
      const importedIds = new Set<string>();
      for (const entry of imported) {
        const normalized = normalizeEntry(entry);
        if (!normalized) {
          console.warn(
            "importVaultWithMode - REPLACE: entry normalization failed",
            entry,
          );
          continue;
        }

        // Assign new ID if duplicate within imported set
        let candidate = { ...normalized };
        while (importedIds.has(candidate.id)) {
          candidate.id = uuidv4();
          duplicateCount++;
        }
        result.push(candidate);
        importedIds.add(candidate.id);
        count++;
      }
      console.log("importVaultWithMode - REPLACE mode complete", {
        resultCount: result.length,
        importedCount: imported.length,
        count,
        duplicateCount,
      });
    } else if (mode === "merge-dedup") {
      console.log("importVaultWithMode - starting MERGE-DEDUP mode");
      // MERGE-DEDUP: Merge but deduplicate by title+username
      result = [...existing];
      const existingIds = new Set(existing.map((e) => e.id));
      const dedupeKey = new Set(
        existing.map((e) => `${e.title}|${e.username}`),
      );

      for (const entry of imported) {
        const normalized = normalizeEntry(entry);
        if (!normalized) {
          console.warn(
            "importVaultWithMode - MERGE-DEDUP: entry normalization failed",
            entry,
          );
          continue;
        }

        const candidate = { ...normalized };
        const key = `${candidate.title}|${candidate.username}`;

        // Skip if exact duplicate
        if (dedupeKey.has(key)) {
          duplicateCount++;
          continue;
        }

        // Assign new ID if exists
        while (existingIds.has(candidate.id)) {
          candidate.id = uuidv4();
        }
        result.push(candidate);
        existingIds.add(candidate.id);
        dedupeKey.add(key);
        count++;
      }
      console.log("importVaultWithMode - MERGE-DEDUP mode complete", {
        resultCount: result.length,
        existingCount: existing.length,
        importedCount: imported.length,
        count,
        duplicateCount,
      });
    } else {
      console.log("importVaultWithMode - starting MERGE mode");
      // MERGE: Default safe merge (allow duplicates with new IDs)
      result = [...existing];
      const existingIds = new Set(existing.map((e) => e.id));

      for (const entry of imported) {
        const normalized = normalizeEntry(entry);
        if (!normalized) {
          console.warn(
            "importVaultWithMode - MERGE: entry normalization failed",
            entry,
          );
          continue;
        }

        const candidate = { ...normalized };
        while (existingIds.has(candidate.id)) {
          candidate.id = uuidv4();
        }
        result.push(candidate);
        existingIds.add(candidate.id);
        count++;
      }
      console.log("importVaultWithMode - MERGE mode complete", {
        resultCount: result.length,
        existingCount: existing.length,
        importedCount: imported.length,
        count,
      });
    }

    // Step 5: Save with validation
    console.log("importVaultWithMode - saving vault", {
      mode,
      resultCount: result.length,
      count,
    });
    await saveVault(result, masterPassword);
    console.log("importVaultWithMode - vault saved successfully");

    if (__DEV__) {
      console.log("Import successful", {
        mode,
        count,
        duplicateCount,
        totalEntries: result.length,
      });
    }

    return {
      success: true,
      count,
      entries: result,
      duplicateCount: duplicateCount > 0 ? duplicateCount : undefined,
    };
  } catch (err) {
    console.error("Import with mode error:", err);
    console.error("Import failed details:", {
      mode,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
    });

    // Attempt rollback if snapshot exists
    if (vaultSnapshot) {
      try {
        await restoreVaultFromSnapshot(vaultSnapshot, masterPassword);
      } catch (rollbackErr) {
        console.error("Rollback also failed:", rollbackErr);
      }
    }

    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    importInProgressLock = false;
  }
};

const decodeBackup = async (
  rawJson: string,
  masterPassword: string,
): Promise<unknown> => {
  const payload = JSON.parse(rawJson);

  // Validate payload structure
  if (!payload || typeof payload !== "object" || !payload.data) {
    throw new Error("Invalid backup file format");
  }
  const version = (payload as any).version;
  if (version !== 1 && version !== 2) {
    throw new Error("Unsupported backup version");
  }

  let decrypted = "";
  if (version === 2) {
    const salt = String((payload as any).salt || "");
    const iterations =
      typeof (payload as any).iterations === "number"
        ? (payload as any).iterations
        : PBKDF2_ITERATIONS;
    if (!salt) {
      throw new Error("Backup missing salt");
    }
    decrypted = decryptDataPortable(
      (payload as any).data,
      masterPassword,
      salt,
      iterations,
    );
  } else {
    // v1 backups were encrypted using the device's internal vault salt stored in SecureStore.
    // They are only restorable on the same install (or if that salt is present).
    decrypted = await decryptData((payload as any).data, masterPassword);
    if (!decrypted) {
      throw new Error(
        "This backup was created with an older app version and can’t be restored on this device. Please re-export a new backup from the device where it was created.",
      );
    }
  }
  if (!decrypted) {
    throw new Error("Failed to decrypt data (wrong master password?)");
  }

  return JSON.parse(decrypted) as unknown;
};

export const restoreVault = async (
  rawBackupJson: string,
  masterPassword: string,
): Promise<{
  success: boolean;
  count: number;
  entries?: PasswordEntry[];
  error?: string;
}> => {
  try {
    const imported = await decodeBackup(rawBackupJson, masterPassword);
    if (!Array.isArray(imported)) {
      return { success: false, count: 0, error: "Invalid data format" };
    }

    const isValidEntry = (entry: any): entry is PasswordEntry => {
      return (
        entry &&
        typeof entry.id === "string" &&
        typeof entry.title === "string" &&
        typeof entry.username === "string" &&
        typeof entry.password === "string" &&
        typeof entry.notes === "string" &&
        typeof entry.createdAt === "number" &&
        typeof entry.updatedAt === "number" &&
        typeof entry.isFavorite === "boolean" &&
        typeof entry.category === "string"
      );
    };

    const entries = (imported as unknown[]).filter(isValidEntry);
    await saveVault(entries, masterPassword);
    return { success: true, count: entries.length, entries };
  } catch (err) {
    console.error("Restore error:", err);
    return {
      success: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

export const clearRuntimeCaches = (): void => {
  clearVaultRuntimeCache();
  vaultWriteQueue = Promise.resolve();
};
