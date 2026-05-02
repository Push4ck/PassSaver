import React, { useEffect, useRef } from "react";
import {
  Animated,
  View,
  TouchableOpacity,
  ViewStyle,
  TouchableOpacityProps,
  StyleProp,
} from "react-native";

// Animated Card with slide-in and fade effect
interface AnimatedCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  duration?: number;
}

export const AnimatedCard = React.memo(function AnimatedCard({
  children,
  style,
  delay = 0,
  duration = 300,
}: AnimatedCardProps) {
  const slideInAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideInAnim, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, duration, slideInAnim, fadeAnim]);

  return (
    <Animated.View
      style={[
        {
          transform: [{ translateY: slideInAnim }],
          opacity: fadeAnim,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
});

// Animated Button with scale effect on press
interface AnimatedButtonProps extends TouchableOpacityProps {
  children: React.ReactNode;
  scaleValue?: number;
}

export const AnimatedButton = React.forwardRef<any, AnimatedButtonProps>(
  function AnimatedButton(
    { children, scaleValue = 0.95, onPressIn, onPressOut, ...props },
    ref,
  ) {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const handlePressIn = (evt: any) => {
      Animated.spring(scaleAnim, {
        toValue: scaleValue,
        useNativeDriver: true,
        speed: 20,
        bounciness: 10,
      }).start();
      onPressIn?.(evt);
    };

    const handlePressOut = (evt: any) => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 10,
      }).start();
      onPressOut?.(evt);
    };

    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          ref={ref}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          {...props}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    );
  },
);

// Animated List Item with stagger effect
interface AnimatedListItemProps {
  children: React.ReactNode;
  index: number;
  itemDelay?: number;
}

export const AnimatedListItem = React.memo(function AnimatedListItem({
  children,
  index,
  itemDelay = 30,
}: AnimatedListItemProps) {
  return (
    <AnimatedCard delay={index * itemDelay} duration={400}>
      {children}
    </AnimatedCard>
  );
});

// Fade in animation
interface FadeInProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
}

export const FadeIn = React.memo(function FadeIn({
  children,
  duration = 300,
  delay = 0,
}: FadeInProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    }).start();
  }, [duration, delay, fadeAnim]);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>{children}</Animated.View>
  );
});

// Scale animation on mount
interface ScaleInProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  initialScale?: number;
}

export const ScaleIn = React.memo(function ScaleIn({
  children,
  duration = 300,
  delay = 0,
  initialScale = 0.8,
}: ScaleInProps) {
  const scaleAnim = useRef(new Animated.Value(initialScale)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [duration, delay, scaleAnim, fadeAnim]);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: fadeAnim,
      }}
    >
      {children}
    </Animated.View>
  );
});
