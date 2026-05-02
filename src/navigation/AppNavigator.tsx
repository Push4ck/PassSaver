import React, { useEffect, useState } from "react";
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator } from "react-native";
import { COLORS } from "../constants/theme";
import { useSession } from "../context/SessionContext";
import { PasswordEntry } from "../types";

export type RootStackParamList = {
  Splash: undefined;
  Setup: undefined;
  Lock: undefined;
  Home:
    | {
        vaultMutation?: {
          type: "add" | "update";
          entry: PasswordEntry;
        };
        vaultSnapshot?: PasswordEntry[];
      }
    | undefined;
  AddEdit: { entry: PasswordEntry | null };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function AppNavigator() {
  const { masterPassword, isLocked } = useSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    console.info("Navigation container preparing");
    setReady(true);
  }, []);

  // Navigate to Lock when auto-locked
  useEffect(() => {
    console.log("Session state changed", {
      hasMasterPassword: Boolean(masterPassword),
      isLocked,
    });
    if (isLocked && navigationRef.isReady()) {
      console.warn("Session locked, navigating to Lock screen");
      navigationRef.reset({
        index: 0,
        routes: [{ name: "Lock" }],
      });
    }
  }, [isLocked]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const SplashScreen = require("../screens/SplashScreen").default;
  const SetupScreen = require("../screens/SetupScreen").default;
  const LockScreen = require("../screens/LockScreen").default;
  const HomeScreen = require("../screens/HomeScreen").default;
  const AddEditScreen = require("../screens/AddEditScreen").default;
  const SettingsScreen = require("../screens/SettingsScreen").default;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
          animation: "fade",
          animationDuration: 300,
        }}
      >
        <Stack.Screen
          name="Splash"
          component={SplashScreen}
          options={{ animationDuration: 400 }}
        />
        <Stack.Screen
          name="Setup"
          component={SetupScreen}
          options={{ animation: "fade" }}
        />
        <Stack.Screen
          name="Lock"
          component={LockScreen}
          options={{ animation: "fade" }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ animation: "fade" }}
        />
        <Stack.Screen
          name="AddEdit"
          component={AddEditScreen}
          options={{ animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ animation: "slide_from_right" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
