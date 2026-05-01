import React from "react";
import AppNavigator from "./src/navigation/AppNavigator";
import { SessionProvider } from "./src/context/SessionContext";
import { initLogger } from "./src/utils/logger";

// Polyfill for UUID generation
require("react-native-get-random-values");
initLogger();

export default function App() {
  console.info("App mounted");
  return (
    <SessionProvider>
      <AppNavigator />
    </SessionProvider>
  );
}
