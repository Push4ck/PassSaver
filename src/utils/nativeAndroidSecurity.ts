/**
 * Native Android Security Utilities
 *
 * Provides Android-specific security features:
 * - FLAG_SECURE protection (prevents screenshots/screen recording in recent apps)
 * - Secure window flag handling
 *
 * For Expo-managed projects, these features require native module integration
 * or use of expo-dev-client with custom native code.
 */

import { Platform, NativeModules, findNodeHandle, View } from "react-native";

const { SecureWindowModule } = NativeModules;

/**
 * Enables FLAG_SECURE on the current activity window (Android only).
 * Prevents screenshots and screen recording from capture the app.
 * Note: This prevents the user's own screenshots too - use carefully.
 *
 * @returns Promise<void>
 * @throws Error if on non-Android platform or native module unavailable
 */
export const enableAndroidSecureFlag = async (): Promise<void> => {
  if (Platform.OS !== "android") {
    console.log("enableAndroidSecureFlag: Not on Android, skipping");
    return;
  }

  if (!SecureWindowModule) {
    console.warn(
      "SecureWindowModule not available. " +
        "Install custom native module or use expo-dev-client with native code.",
    );
    return;
  }

  try {
    await SecureWindowModule.enableSecureFlag();
    console.log("Android FLAG_SECURE enabled");
  } catch (error) {
    console.error("Failed to enable Android FLAG_SECURE:", error);
  }
};

/**
 * Disables FLAG_SECURE on the current activity window (Android only).
 * Re-enables screenshots and screen recording.
 *
 * @returns Promise<void>
 */
export const disableAndroidSecureFlag = async (): Promise<void> => {
  if (Platform.OS !== "android") {
    console.log("disableAndroidSecureFlag: Not on Android, skipping");
    return;
  }

  if (!SecureWindowModule) {
    return;
  }

  try {
    await SecureWindowModule.disableSecureFlag();
    console.log("Android FLAG_SECURE disabled");
  } catch (error) {
    console.error("Failed to disable Android FLAG_SECURE:", error);
  }
};

/**
 * Checks if Android FLAG_SECURE is currently enabled.
 *
 * @returns Promise<boolean> True if FLAG_SECURE is enabled
 */
export const isAndroidSecureFlagEnabled = async (): Promise<boolean> => {
  if (Platform.OS !== "android" || !SecureWindowModule) {
    return false;
  }

  try {
    return await SecureWindowModule.isSecureFlagEnabled();
  } catch (error) {
    console.error("Failed to check Android FLAG_SECURE status:", error);
    return false;
  }
};
