import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { COLORS, FONTS, SPACING, SHADOWS } from "../constants/theme";
import { RootStackParamList } from "../navigation/AppNavigator";
import { isMasterPasswordSet } from "../utils/storage";

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
        {/* <View style={styles.iconBox}> */}
          <Image
            source={require("../../assets/PassSaver_logo.jpeg")}
            style={styles.logo}
            resizeMode="contain"
          />
        {/* </View> */}
        {/* <Text style={styles.title}>PassSaver</Text> */}
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
    gap: SPACING.lg,
  },
  iconBox: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  logo: {
    width: 150,
    height: 150,
    borderRadius: 32,
  },
  icon: {
    fontSize: 44,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONTS.sizes.lg,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
});
