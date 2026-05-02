import {
  loadVault,
  saveVault,
  addEntry,
  updateEntry,
  deleteEntry,
  clearRuntimeCaches,
  hashPassword,
  saveMasterPassword,
  verifyMasterPassword,
} from "../src/utils/storage";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PasswordEntry } from "../src/types";

describe("Performance - Vault Operations with 100+ Entries", () => {
  const masterPwd = "perf-test-password";
  const pwdHash = hashPassword(masterPwd);

  // Generate N fake password entries
  const generateEntries = (count: number): PasswordEntry[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `entry-${i}`,
      title: `Account ${i}`,
      username: `user${i}@example.com`,
      password: `password-${i}-${Math.random().toString(36).slice(2, 10)}`,
      notes: `Note for account ${i}`,
      createdAt: Date.now() - i * 1000,
      updatedAt: Date.now() - i * 500,
      isFavorite: i % 5 === 0,
      category: "Other",
    }));
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    clearRuntimeCaches();

    // Setup: store salt and password hash
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      (key: string) => {
        if (key === "vault_salt") return Promise.resolve("perf-test-salt");
        if (key === "master_password_hash") return Promise.resolve(pwdHash);
        return Promise.resolve(null);
      },
    );
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await saveMasterPassword(masterPwd);
  });

  afterEach(() => {
    clearRuntimeCaches();
  });

  describe("Load Performance", () => {
    test("should load 100 entries within acceptable time (cache miss)", async () => {
      const entries = generateEntries(100);
      await saveVault(entries, masterPwd);

      clearRuntimeCaches(); // Force cache miss

      const start = Date.now();
      const loaded = await loadVault(masterPwd);
      const elapsed = Date.now() - start;

      expect(loaded.length).toBe(100);
      // PBKDF2 + decrypt of 100 entries should complete within 3 seconds in test env
      expect(elapsed).toBeLessThan(3000);
    });

    test("should load 200 entries within acceptable time (cache miss)", async () => {
      const entries = generateEntries(200);
      await saveVault(entries, masterPwd);

      clearRuntimeCaches(); // Force cache miss

      const start = Date.now();
      const loaded = await loadVault(masterPwd);
      const elapsed = Date.now() - start;

      expect(loaded.length).toBe(200);
      expect(elapsed).toBeLessThan(5000);
    });

    test("should load 100+ entries instantly on cache hit", async () => {
      const entries = generateEntries(150);
      await saveVault(entries, masterPwd);

      // First load populates cache
      await loadVault(masterPwd);

      // Second load should be near-instant (cache hit)
      const start = Date.now();
      const loaded = await loadVault(masterPwd);
      const elapsed = Date.now() - start;

      expect(loaded.length).toBe(150);
      // Cache hit should be under 50ms
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe("Save Performance", () => {
    test("should save 100 entries within acceptable time", async () => {
      const entries = generateEntries(100);

      const start = Date.now();
      await saveVault(entries, masterPwd);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3000);
    });

    test("should save 200 entries within acceptable time", async () => {
      const entries = generateEntries(200);

      const start = Date.now();
      await saveVault(entries, masterPwd);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe("CRUD Performance with Large Dataset", () => {
    test("should add entry to 100-entry vault quickly", async () => {
      const entries = generateEntries(100);
      await saveVault(entries, masterPwd);

      const newEntry: PasswordEntry = {
        id: "new-entry",
        title: "New Account",
        username: "new@example.com",
        password: "new-password",
        notes: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isFavorite: false,
        category: "Other",
      };

      const start = Date.now();
      await addEntry(newEntry, masterPwd);
      const elapsed = Date.now() - start;

      const loaded = await loadVault(masterPwd);
      expect(loaded.length).toBe(101);
      expect(elapsed).toBeLessThan(2000);
    });

    test("should update entry in 100-entry vault quickly", async () => {
      const entries = generateEntries(100);
      await saveVault(entries, masterPwd);

      const updated = { ...entries[50], title: "Updated Title" };

      const start = Date.now();
      await updateEntry(updated, masterPwd);
      const elapsed = Date.now() - start;

      const loaded = await loadVault(masterPwd);
      expect(loaded[50].title).toBe("Updated Title");
      expect(elapsed).toBeLessThan(2000);
    });

    test("should delete entry from 100-entry vault quickly", async () => {
      const entries = generateEntries(100);
      await saveVault(entries, masterPwd);

      const start = Date.now();
      await deleteEntry(entries[25].id, masterPwd);
      const elapsed = Date.now() - start;

      const loaded = await loadVault(masterPwd);
      expect(loaded.length).toBe(99);
      expect(loaded.find((e) => e.id === entries[25].id)).toBeUndefined();
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe("Derived Key Cache Performance", () => {
    test("should reuse cached derived key across multiple operations", async () => {
      const entries = generateEntries(50);
      await saveVault(entries, masterPwd);

      clearRuntimeCaches(); // Clear vault cache but NOT derived key cache

      // First load derives key
      await loadVault(masterPwd);

      // Multiple operations should reuse cached key
      const start = Date.now();
      await loadVault(masterPwd);
      await loadVault(masterPwd);
      await loadVault(masterPwd);
      const elapsed = Date.now() - start;

      // All three loads should be fast (under 100ms total) due to both caches
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("Memory & Stability", () => {
    test("should handle 500 entries without crashing", async () => {
      const entries = generateEntries(500);

      const start = Date.now();
      await saveVault(entries, masterPwd);
      const saveElapsed = Date.now() - start;

      clearRuntimeCaches();

      const loadStart = Date.now();
      const loaded = await loadVault(masterPwd);
      const loadElapsed = Date.now() - loadStart;

      expect(loaded.length).toBe(500);
      expect(saveElapsed).toBeLessThan(10000);
      expect(loadElapsed).toBeLessThan(10000);
    });

    test("should maintain consistent performance across multiple save/load cycles", async () => {
      const entries = generateEntries(100);

      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        clearRuntimeCaches();
        const start = Date.now();
        await saveVault(entries, masterPwd);
        await loadVault(masterPwd);
        times.push(Date.now() - start);
      }

      // All cycles should complete within reasonable time
      times.forEach((t) => expect(t).toBeLessThan(5000));

      // Performance should be relatively consistent (no major degradation)
      const max = Math.max(...times);
      const min = Math.min(...times);
      expect(max / min).toBeLessThan(3); // Within 3x variance
    });
  });
});
