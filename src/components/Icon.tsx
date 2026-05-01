import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { ViewStyle } from "react-native";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export default function Icon({ name, size = 24, color, style }: IconProps) {
  return (
    <Ionicons name={name as any} size={size} color={color} style={style} />
  );
}
