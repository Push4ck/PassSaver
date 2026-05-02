import React, { useEffect } from "react";
import AppNavigator from "./src/navigation/AppNavigator";
import { SessionProvider, useSession } from "./src/context/SessionContext";
import { initLogger } from "./src/utils/logger";
import { usePreventScreenCapture } from "expo-screen-capture";
import { enableAndroidSecureFlag } from "./src/utils/nativeAndroidSecurity";

// Polyfill for UUID generation
require("react-native-get-random-values");
initLogger();

function ScreenshotProtection({ enabled }: { enabled: boolean }) {
  usePreventScreenCapture();
  return null;
}

export default function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}

function AppContent() {
  const { securityMode } = useSession();

  useEffect(() => {
    enableAndroidSecureFlag();
  }, []);

  if (__DEV__) {
    console.info("App mounted");
  }

  return (
    <>
      <AppNavigator />
      {securityMode && <ScreenshotProtection enabled={securityMode} />}
    </>
  );
}
