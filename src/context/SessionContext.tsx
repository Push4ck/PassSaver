import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { AppState, AppStateStatus, Clipboard, Platform } from "react-native";
import { clearRuntimeCaches, loadSettings } from "../utils/storage";
import {
  enableAndroidSecureFlag,
  disableAndroidSecureFlag,
} from "../utils/nativeAndroidSecurity";
import {
  initClipboardOverride,
  restoreClipboard,
  scheduleClipboardClear,
  cancelPendingClear,
  clearSensitiveClipboard,
  overrideClipboardForSecurity,
} from "../utils/clipboardSecurity";

interface SessionContextType {
  masterPassword: string;
  setMasterPassword: (p: string) => void;
  isLocked: boolean;
  lockVault: () => void;
  securityMode: boolean;
  clipboardTimeout: number;
  secureCopy: (text: string) => Promise<void>;
  setSecurityMode: (value: boolean) => void;
  setClipboardTimeout: (value: number) => void;
}

const SessionContext = createContext<SessionContextType>({
  masterPassword: "",
  setMasterPassword: () => {},
  isLocked: false,
  lockVault: () => {},
  securityMode: false,
  clipboardTimeout: 30,
  secureCopy: async () => {},
  setSecurityMode: () => {},
  setClipboardTimeout: () => {},
});

export const SessionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [masterPassword, setMasterPasswordState] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [securityMode, setSecurityModeState] = useState(false);
  const [clipboardTimeout, setClipboardTimeoutState] = useState(30);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const masterPasswordRef = useRef(masterPassword);

  useEffect(() => {
    masterPasswordRef.current = masterPassword;
  }, [masterPassword]);

  const setMasterPassword = (password: string) => {
    if (__DEV__) {
      console.log("Session setMasterPassword called", {
        hasPassword: Boolean(password),
      });
    }
    masterPasswordRef.current = password;
    setMasterPasswordState(password);
    if (password) setIsLocked(false);
  };

  const setSecurityMode = useCallback((value: boolean) => {
    setSecurityModeState(value);
  }, []);

  const setClipboardTimeout = useCallback((value: number) => {
    setClipboardTimeoutState(value);
  }, []);

  const lockVault = useCallback(() => {
    if (lockTimer.current) {
      clearTimeout(lockTimer.current);
      lockTimer.current = null;
    }
    cancelPendingClear();
    clearSensitiveClipboard();
    restoreClipboard();
    clearRuntimeCaches();
    masterPasswordRef.current = "";
    setMasterPasswordState("");
    setIsLocked(true);
  }, []);

  const secureCopy = useCallback(
    async (text: string): Promise<void> => {
      const effectiveTimeout = securityMode
        ? Math.min(clipboardTimeout, 5)
        : clipboardTimeout;

      if (securityMode) {
        await overrideClipboardForSecurity(text);
      } else {
        Clipboard.setString(text);
      }

      if (effectiveTimeout > 0) {
        scheduleClipboardClear(effectiveTimeout);
      }
    },
    [securityMode, clipboardTimeout],
  );

  useEffect(() => {
    let contextLoaded = false;

    const init = async () => {
      try {
        const settings = await loadSettings();
        setSecurityMode(Boolean(settings.securityMode ?? false));
        setClipboardTimeout(Number(settings.clipboardTimeout ?? 30));
        contextLoaded = true;

        if (settings.securityMode) {
          await enableAndroidSecureFlag();
          initClipboardOverride();
        } else {
          await disableAndroidSecureFlag();
          restoreClipboard();
        }
      } catch {
        contextLoaded = true;
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (!securityMode) {
      restoreClipboard();
      disableAndroidSecureFlag().catch(() => {});
      return;
    }

    enableAndroidSecureFlag().catch(() => {});
    initClipboardOverride();
  }, [securityMode]);

  useEffect(() => {
    if (appState.current === "background" || appState.current === "inactive") {
      cancelPendingClear();
      clearSensitiveClipboard();
    }
  }, [isLocked]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (__DEV__) {
        console.log("Session app state changed", {
          previous: appState.current,
          next: nextState,
          hasMasterPassword: Boolean(masterPasswordRef.current),
        });
      }

      const wasActive = appState.current === "active";
      const goingBackground =
        nextState === "background" || nextState === "inactive";

      if (wasActive && goingBackground && masterPasswordRef.current) {
        cancelPendingClear();
        clearSensitiveClipboard();

        const settings = await loadSettings();
        if (settings.autoLockMinutes > 0) {
          if (lockTimer.current) {
            clearTimeout(lockTimer.current);
            lockTimer.current = null;
          }
          lockTimer.current = setTimeout(
            () => {
              lockVault();
            },
            settings.autoLockMinutes * 60 * 1000,
          );
        }
      }

      if (nextState === "active" && lockTimer.current) {
        clearTimeout(lockTimer.current);
        lockTimer.current = null;
      }

      appState.current = nextState;
    });

    return () => {
      sub.remove();
      if (lockTimer.current) {
        clearTimeout(lockTimer.current);
        lockTimer.current = null;
      }
    };
  }, [lockVault]);

  return (
    <SessionContext.Provider
      value={{
        masterPassword,
        setMasterPassword,
        isLocked,
        lockVault,
        securityMode,
        clipboardTimeout,
        secureCopy,
        setSecurityMode,
        setClipboardTimeout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => useContext(SessionContext);
