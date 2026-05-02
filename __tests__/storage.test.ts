import {
  validateBackupFile,
  getBackupMetadata,
  exportVault,
  importVaultWithMode,
  hashPassword,
  saveVault,
  loadVault,
  clearRuntimeCaches,
} from "../src/utils/storage";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CryptoJS from "crypto-js";


describe("Storage Utility - Backup Validation", () => {
  const masterPwd = "test-password-123";
  const pwdHash = hashPassword(masterPwd);

  // Valid backup with all required fields
  const validBackup = JSON.stringify({
    version: 2,
    format: "v2",
    entryCount: 5,
    exportedAt: Date.now(),
    salt: "test-salt-123",
    iterations: 2000,
    data: "encrypted-blob",
    dataHash: "hash",
  });

  test("should validate a correct backup file", () => {
    const result = validateBackupFile(validBackup);
    expect(result.valid).toBe(true);
  });

  test("should reject malformed JSON", () => {
    const result = validateBackupFile('{ "incomplete": true ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain("format");
  });

  test("should reject files exceeding 50MB", () => {
    const largeData = "x".repeat(51 * 1024 * 1024);
    const result = validateBackupFile(
      JSON.stringify({ data: largeData, salt: "salt" }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
  });

  test("should extract metadata without decryption", () => {
    const result = getBackupMetadata(validBackup);
    expect(result.valid).toBe(true);
    expect(result.metadata?.version).toBe(2);
    expect(result.metadata?.entryCount).toBe(5);
  });

  test("should reject backup with missing salt", () => {
    const result = validateBackupFile(
      JSON.stringify({
        version: 2,
        data: "encrypted",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("missing encryption salt");
  });


  describe("Vault Operations", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("should produce a valid export payload", async () => {
      // Mock internal salt and hash for export to work
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
        if (key === "vault_salt") return Promise.resolve("mock-salt");
        if (key === "master_password_hash") return Promise.resolve(pwdHash);
        return Promise.resolve(null);
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null); // Mock empty vault

      const exported = await exportVault(masterPwd);
      const parsed = JSON.parse(exported);

      expect(parsed.format).toBe("v2");
      expect(parsed.dataHash).toBeDefined();
      expect(parsed.salt).toBeDefined();
      expect(parsed.entryCount).toBe(0);
    });

    test("should prevent concurrent imports using the lock", async () => {
      // Mock a successful load/decrypt so it doesn't fail immediately
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
        if (key === "vault_salt") return Promise.resolve("mock-salt");
        if (key === "master_password_hash") return Promise.resolve(pwdHash);
        return Promise.resolve(null);
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null); // Mock empty vault

      const importPromise1 = importVaultWithMode(
        validBackup,
        masterPwd,
        "merge",
      );
      const importPromise2 = importVaultWithMode(
        validBackup,
        masterPwd,
        "merge",
      );

      const [res1, res2] = await Promise.all([importPromise1, importPromise2]);

      const errors = [res1.error, res2.error];
      expect(errors).toContain("Import already in progress. Please wait.");
    });

   


  describe("Vault Operations", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("should produce a valid export payload", async () => {
      // Mock internal salt and hash for export to work
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
        if (key === "vault_salt") return Promise.resolve("mock-salt");
        if (key === "master_password_hash") return Promise.resolve(pwdHash);
        return Promise.resolve(null);
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null); // Mock empty vault

      const exported = await exportVault(masterPwd);
      const parsed = JSON.parse(exported);

      expect(parsed.format).toBe("v2");
      expect(parsed.dataHash).toBeDefined();
      expect(parsed.salt).toBeDefined();
      expect(parsed.entryCount).toBe(0);
    });

    test("should prevent concurrent imports using the lock", async () => {
      // Mock a successful load/decrypt so it doesn't fail immediately
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
        if (key === "vault_salt") return Promise.resolve("mock-salt");
        if (key === "master_password_hash") return Promise.resolve(pwdHash);
        return Promise.resolve(null);
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null); // Mock empty vault

      const importPromise1 = importVaultWithMode(
        validBackup,
        masterPwd,
        "merge",
      );
      const importPromise2 = importVaultWithMode(
        validBackup,
        masterPwd,
        "merge",
      );

      const [res1, res2] = await Promise.all([importPromise1, importPromise2]);

      const errors = [res1.error, res2.error];
      expect(errors).toContain("Import already in progress. Please wait.");
    });

    test("should reject import with wrong password", async () => {
      // Mock correct hash in store
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
        if (key === "vault_salt") return Promise.resolve("mock-salt");
        if (key === "master_password_hash") return Promise.resolve(pwdHash);
        return Promise.resolve(null);
      });

      const result = await importVaultWithMode(
        validBackup,
        "wrong-password",
        "merge",
      );
      expect(result.success).toBe(false);
      // decryption fails or password verify fails
    });
  });
});
