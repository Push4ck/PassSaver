import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import Icon from "../components/Icon";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { COLORS, FONTS, SPACING } from "../constants/theme";
import { RootStackParamList } from "../navigation/AppNavigator";
import { isMasterPasswordSet } from "../utils/storage";
import { ACTION_ICONS } from "../utils/icons";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function SplashScreen() {
  const navigation = useNavigation<NavProp>();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(async () => {
      const isSet = await isMasterPasswordSet();
      navigation.replace(isSet ? "Lock" : "Setup");
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.content, { opacity, transform: [{ translateY }] }]}
      >
         <View style={styles.iconBox}>
           <Icon name={ACTION_ICONS.security} size={60} color={COLORS.accent} />
         </View>
        <Text style={styles.title}>PassSaver</Text>
        <Text style={styles.subtitle}>Your vault. Your control.</Text>
      </Animated.View>
      <View style={styles.glowCircle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  glowCircle: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: COLORS.accentGlow,
    bottom: -80,
    right: -80,
  },
  content: {
    alignItems: "center",
    gap: SPACING.md,
  },
  iconBox: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  icon: {
    fontSize: 44,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
});
