import { getBiometricStatus, BiometricStatus } from "../src/utils/biometrics";
import * as LocalAuthentication from "expo-local-authentication";

describe("Biometrics Utility", () => {
  describe("getBiometricStatus", () => {
    test("should return valid biometric status when hardware is available", async () => {
      // Default mock returns true from jest.setup.js
      const status = await getBiometricStatus();

      expect(status).toBeDefined();
      expect(typeof status.compatible).toBe("boolean");
      expect(typeof status.canAuthenticate).toBe("boolean");
      expect(typeof status.enrolled).toBe("boolean");
      expect(typeof status.canUseBiometrics).toBe("boolean");
    });

    test("should return compatible true when hardware is available", async () => {
      const status = await getBiometricStatus();
      expect(status.compatible).toBe(true);
    });

    test("should return canAuthenticate true when biometrics can be used", async () => {
      const status = await getBiometricStatus();
      expect(status.canAuthenticate).toBe(true);
    });

    test("should return enrolled true when biometrics are enrolled", async () => {
      const status = await getBiometricStatus();
      expect(status.enrolled).toBe(true);
    });

    test("should handle mock implementation correctly", async () => {
      // Verify the mock from jest.setup.js is working
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      expect(hasHardware).toBe(true);
    });
  });
});
