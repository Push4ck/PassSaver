import * as LocalAuthentication from "expo-local-authentication";

export type BiometricStatus = {
  compatible: boolean;
  canAuthenticate: boolean;
  enrolled: boolean;
  enrolledLevel: number | null;
  supportedTypes: number[];
  hasFaceSupport: boolean;
  canUseBiometrics: boolean;
};

export async function getBiometricStatus(): Promise<BiometricStatus> {
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (__DEV__) console.warn("Biometric check failed:", e);
      return fallback;
    }
  };

  // Check hardware support first
  const compatible = await safe(
    () => LocalAuthentication.hasHardwareAsync(),
    false,
  );

  // If no hardware, can't authenticate
  if (!compatible) {
    return {
      compatible: false,
      canAuthenticate: false,
      enrolled: false,
      enrolledLevel: null,
      supportedTypes: [],
      hasFaceSupport: false,
      canUseBiometrics: false,
    };
  }

  // Hardware exists, check if biometrics can be used
  // Note: canAuthenticateAsync may not be available in all versions,
  // so we derive it from enrolled state below
  let canAuthenticate = false;

  // Query enrolled state and supported types (these can be unreliable on Android)
  const enrolled = await safe(
    () => LocalAuthentication.isEnrolledAsync(),
    false,
  );
  const enrolledLevel = await safe(
    () => LocalAuthentication.getEnrolledLevelAsync(),
    null,
  );
  const supportedTypes = await safe(
    () => LocalAuthentication.supportedAuthenticationTypesAsync(),
    [],
  );

  const hasFaceSupport = supportedTypes.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  );

  // Derive canAuthenticate from enrolled/enrolledLevel
  canAuthenticate =
    enrolled ||
    (enrolledLevel !== null &&
      enrolledLevel >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK);

  // Android quirk: Some devices report hardware available but empty supportedTypes
  // In that case, trust canAuthenticate or enrolledLevel as indicators
  const canUseBiometrics = canAuthenticate;

  return {
    compatible,
    canAuthenticate,
    enrolled,
    enrolledLevel,
    supportedTypes,
    hasFaceSupport,
    canUseBiometrics,
  };
}
