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
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const compatible = await safe(
    () => LocalAuthentication.hasHardwareAsync(),
    false,
  );
  const canAuthenticate = await safe(
    () => LocalAuthentication.canAuthenticateAsync(),
    false,
  );
  const enrolled = await safe(() => LocalAuthentication.isEnrolledAsync(), false);
  const supportedTypes = await safe(
    () => LocalAuthentication.supportedAuthenticationTypesAsync(),
    [],
  );
  const enrolledLevel = await safe(
    () => LocalAuthentication.getEnrolledLevelAsync(),
    null,
  );

  const hasFaceSupport =
    supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ||
    // Some Android devices / OS versions incorrectly report empty supportedTypes even
    // when biometrics are present; we treat "enrolled" as enough to let the OS choose.
    false;

  const canUseBiometrics =
    canAuthenticate ||
    enrolled ||
    (enrolledLevel !== null &&
      enrolledLevel >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK);

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

