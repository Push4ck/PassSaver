// Category Ionicons
export const CATEGORY_ICONS = {
  Social: "chatbubbles-outline" as const,
  Banking: "card-outline" as const,
  Email: "mail-outline" as const,
  Work: "briefcase-outline" as const,
  Shopping: "cart-outline" as const,
  Gaming: "game-controller-outline" as const,
  Other: "key-outline" as const,
} as const;

// Action Ionicons (pro standard names)
export const ACTION_ICONS = {
  copy: "copy-outline" as const,
  delete: "trash-outline" as const,
  password: "lock-closed-outline" as const,
  visibility: "eye-outline" as const,
  visibilityOff: "eye-off-outline" as const,
  success: "checkmark-circle-outline" as const,
  error: "alert-circle-outline" as const,
  warning: "warning-outline" as const,
  info: "information-circle-outline" as const,
  security: "shield-checkmark-outline" as const,
  biometric: "finger-print" as const,
  key: "key-outline" as const,
  lock: "lock-closed-outline" as const,
  export: "cloud-upload-outline" as const,
  import: "download-outline" as const,
  trash: "trash-outline" as const,
  backup: "refresh-outline" as const,
  settings: "settings-outline" as const,
  back: "arrow-back-outline" as const,
  chevron: "chevron-forward-outline" as const,
  timer: "time-outline" as const,
  clipboard: "clipboard-outline" as const,
  search: "search-outline" as const,
  refresh: "refresh-outline" as const,
} as const;

export type CategoryIcon = keyof typeof CATEGORY_ICONS;
export type ActionIcon = keyof typeof ACTION_ICONS;
