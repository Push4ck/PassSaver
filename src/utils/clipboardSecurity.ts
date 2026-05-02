import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";

type ClipboardOverrideHandler = (text: string) => Promise<void>;

let originalSetString: typeof Clipboard.setStringAsync | null = null;
let isOverridden = false;
let pendingClearTimer: ReturnType<typeof setTimeout> | null = null;
let lastClearTime = 0;
let pendingWrite: { text: string; timestamp: number } | null = null;

const CLIPBOARD_CLEAR_MARGIN_MS = 500;

const performOriginalSetString = async (text: string): Promise<void> => {
  if (originalSetString) {
    await originalSetString(text);
  } else {
    await Clipboard.setStringAsync(text);
  }
};

export const overrideClipboardForSecurity = async (text: string): Promise<void> => {
  const now = Date.now();
  if (lastClearTime > 0 && now - lastClearTime < CLIPBOARD_CLEAR_MARGIN_MS) {
    if (__DEV__) {
      console.log("Clipboard write blocked: recent clear in progress");
    }
    return;
  }

  if (isOverridden && originalSetString) {
    pendingWrite = { text, timestamp: now };
    try {
      await originalSetString(text);
      pendingWrite = null;
    } catch (error) {
      if (__DEV__) {
        console.error("Clipboard override write failed:", error);
      }
      throw error;
    }
  } else {
    await Clipboard.setStringAsync(text);
  }
};

export const initClipboardOverride = (): void => {
  if (isOverridden || Platform.OS === "web") return;

  originalSetString = Clipboard.setStringAsync;
  isOverridden = true;

  if (__DEV__) {
    console.log("Clipboard override initialized - security active");
  }
};

export const restoreClipboard = (): void => {
  if (!isOverridden || !originalSetString) return;

  try {
    const current = Clipboard.getStringAsync();
    if (current && __DEV__) {
      console.log("Restoring clipboard after security session");
    }
  } catch {
    // ignore
  }

  isOverridden = false;
  originalSetString = null;
};

export const scheduleClipboardClear = (timeoutSeconds: number): void => {
  if (pendingClearTimer) {
    clearTimeout(pendingClearTimer);
    pendingClearTimer = null;
  }

  if (timeoutSeconds === 0) return;

  pendingClearTimer = setTimeout(() => {
    clearSensitiveClipboard();
  }, timeoutSeconds * 1000);
};

export const cancelPendingClear = (): void => {
  if (pendingClearTimer) {
    clearTimeout(pendingClearTimer);
    pendingClearTimer = null;
  }
};

export const clearSensitiveClipboard = async (): Promise<void> => {
  try {
    await Clipboard.setStringAsync("");
    lastClearTime = Date.now();
    if (__DEV__) {
      console.log("Sensitive clipboard cleared at", new Date().toISOString());
    }
  } catch (error) {
    if (__DEV__) {
      console.error("Failed to clear clipboard:", error);
    }
  }
};

export const getClipboardStatus = (): {
  isOverridden: boolean;
  hasPendingTimer: boolean;
  lastClearTime: number;
} => ({
  isOverridden,
  hasPendingTimer: pendingClearTimer !== null,
  lastClearTime,
});