import {
  hashPassword,
  verifyMasterPassword,
  saveMasterPassword,
  loadVault,
  saveVault,
  clearVault,
  clearRuntimeCaches,
  loadSettings,
  saveSettings,
  changeMasterPassword,
  exportVault,
  validateBackupFile,
} from "../src/utils/storage";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

describe("Security Regression Tests", () => {
  const masterPwd = "secure-test-password";
  const pwdHash = hashPassword(masterPwd);

  beforeEach(async () => {
    jest.clearAllMocks();
    clearRuntimeCaches();

    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === "vault_salt") return Promise.resolve("security-test-salt");
      if (key === "master_password_hash") return Promise.resolve(pwdHash);
      if (key === "app_settings") {
        return Promise.resolve(
          JSON.stringify({
            biometricsEnabled: false,
            autoLockMinutes: 2,
            clipboardTimeout: 30,
            securityMode: true,
          }),
        );
      }
      return Promise.resolve(null);
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await saveMasterPassword(masterPwd);
  });

  afterEach(() => {
    clearRuntimeCaches();
  });

  describe("Master Password Security", () => {
    test("should hash password with SHA256", () => {
      const hash1 = hashPassword("same-password");
      const hash2 = hashPassword("same-password");
      const hash3 = hashPassword("different-password");

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });

    test("should verify correct master password", async () => {
      const result = await verifyMasterPassword(masterPwd);
      expect(result).toBe(true);
    });

    test("should reject incorrect master password", async () => {
      const result = await verifyMasterPassword("wrong-password");
      expect(result).toBe(false);
    });

    test("should change master password successfully", async () => {
      // Setup vault
      await saveVault(
        [
          {
            id: "1",
            title: "Test",
            username: "user",
            password: "pass",
            notes: "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isFavorite: false,
            category: "Other",
          },
        ],
        masterPwd,
      );

      const newPwd = "new-secure-password";
      const changed = await changeMasterPassword(masterPwd, newPwd);
      expect(changed).toBe(true);

      // Verify new password works
      const verifyNew = await verifyMasterPassword(newPwd);
      expect(verifyNew).toBe(true);

      // Verify old password no longer works
      const verifyOld = await verifyMasterPassword(masterPwd);
      expect(verifyOld).toBe(false);
    });
  });

  describe("Runtime Cache Security", () => {
    test("should clear all runtime caches on lock", async () => {
      // Populate caches
      await saveVault(
        [
          {
            id: "1",
            title: "Test",
            username: "user",
            password: "secret",
            notes: "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isFavorite: false,
            category: "Other",
          },
        ],
        masterPwd,
      );
      await loadVault(masterPwd);

      // Clear caches (simulating lock)
      clearRuntimeCaches();

      // Verify vault cache is cleared by checking load re-decrypts
      const getItemCallsBefore = (AsyncStorage.getItem as jest.Mock).mock.calls
        .length;
      await loadVault(masterPwd);
      const getItemCallsAfter = (AsyncStorage.getItem as jest.Mock).mock.calls
        .length;

      expect(getItemCallsAfter).toBeGreaterThan(getItemCallsBefore);
    });
  });

  describe("Vault Storage Security", () => {
    test("should store vault in AsyncStorage (not SecureStore)", async () => {
      await saveVault(
        [
          {
            id: "1",
            title: "Test",
            username: "user",
            password: "pass",
            notes: "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isFavorite: false,
            category: "Other",
          },
        ],
        masterPwd,
      );

      // Vault should be in AsyncStorage
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        "vault_data_async",
        expect.any(String),
      );

      // Legacy SecureStore vault key should be deleted
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("vault_data");
    });

    test("should mark vault unrecoverable after repeated decryption failures", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue("invalid-cipher");

      // Load with wrong password should mark unrecoverable
      await loadVault("wrong-password");

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "vault_unrecoverable",
        "1",
      );
    });

    test("should skip decrypt if vault marked unrecoverable", async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === "vault_unrecoverable") return Promise.resolve("1");
          if (key === "vault_salt") return Promise.resolve("security-test-salt");
          if (key === "master_password_hash")
            return Promise.resolve(pwdHash);
          return Promise.resolve(null);
        },
      );
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue("some-cipher");

      const result = await loadVault(masterPwd);
      expect(result).toEqual([]);
    });

    test("should clear vault completely", async () => {
      await saveVault(
        [
          {
            id: "1",
            title: "Test",
            username: "user",
            password: "pass",
            notes: "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isFavorite: false,
            category: "Other",
          },
        ],
        masterPwd,
      );

      await clearVault();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith("vault_data_async");
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("vault_data");
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        "biometric_master_password",
      );
    });
  });

  describe("Settings Security", () => {
    test("should load security mode setting correctly", async () => {
      const settings = await loadSettings();
      expect(settings.securityMode).toBe(true);
      expect(settings.clipboardTimeout).toBe(30);
      expect(settings.autoLockMinutes).toBe(2);
    });

    test("should persist settings securely", async () => {
      const settings = {
        biometricsEnabled: true,
        autoLockMinutes: 5,
        clipboardTimeout: 15,
        securityMode: false,
      };
      await saveSettings(settings);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "app_settings",
        JSON.stringify(settings),
      );
    });
  });

  describe("Backup Validation Security", () => {
    test("should reject oversized backup files", () => {
      const largeData = "x".repeat(52 * 1024 * 1024);
      const result = validateBackupFile(
        JSON.stringify({ data: largeData, salt: "salt" }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too large");
    });

    test("should reject backup with too many entries", () => {
      const result = validateBackupFile(
        JSON.stringify({
          version: 2,
          data: "encrypted",
          salt: "salt",
          entryCount: 60000,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too many entries");
    });

    test("should reject backup with unsupported version", () => {
      const result = validateBackupFile(
        JSON.stringify({
          version: 99,
          data: "encrypted",
          salt: "salt",
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported");
    });

    test("should reject backup missing encrypted data", () => {
      const result = validateBackupFile(
        JSON.stringify({
          version: 2,
          salt: "salt",
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("missing encrypted data");
    });

    test("should reject backup missing salt", () => {
      const result = validateBackupFile(
        JSON.stringify({
          version: 2,
          data: "encrypted",
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("missing encryption salt");
    });
  });

  describe("Export Security", () => {
    test("should include integrity hash in export", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const exported = await exportVault(masterPwd);
      const parsed = JSON.parse(exported);

      expect(parsed.dataHash).toBeDefined();
      expect(parsed.dataHash).not.toBe("");
      expect(parsed.version).toBe(2);
      expect(parsed.format).toBe("v2");
    });

    test("should include platform metadata in export", async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const exported = await exportVault(masterPwd);
      const parsed = JSON.parse(exported);

      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.exportedAt).toBeDefined();
    });
  });
});
