import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { loadSettings } from "../utils/storage";

interface SessionContextType {
  masterPassword: string;
  setMasterPassword: (p: string) => void;
  isLocked: boolean;
  lockVault: () => void;
}

const SessionContext = createContext<SessionContextType>({
  masterPassword: "",
  setMasterPassword: () => {},
  isLocked: false,
  lockVault: () => {},
});

export const SessionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [masterPassword, setMasterPasswordState] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const setMasterPassword = (password: string) => {
    console.log("Session setMasterPassword called", {
      hasPassword: Boolean(password),
    });
    setMasterPasswordState(password);
    // Unlock session whenever a valid password is set.
    if (password) setIsLocked(false);
  };

  const lockVault = () => {
    console.warn("Session lockVault triggered");
    if (lockTimer.current) {
      clearTimeout(lockTimer.current);
      lockTimer.current = null;
    }
    setMasterPasswordState("");
    setIsLocked(true);
  };

  // Auto-lock when app goes to background
  useEffect(() => {
    console.info("SessionProvider app state listener attached");
    const sub = AppState.addEventListener("change", async (nextState) => {
      console.log("Session app state changed", {
        previous: appState.current,
        next: nextState,
        hasMasterPassword: Boolean(masterPassword),
      });
      const wasActive = appState.current === "active";
      const goingBackground =
        nextState === "background" || nextState === "inactive";

      // App is leaving foreground: start delayed auto-lock timer.
      if (
        wasActive &&
        goingBackground &&
        masterPassword
      ) {
        const settings = await loadSettings();
        console.log("Auto-lock settings loaded", {
          autoLockMinutes: settings.autoLockMinutes,
        });
        if (lockTimer.current) {
          clearTimeout(lockTimer.current);
          lockTimer.current = null;
        }
        if (settings.autoLockMinutes > 0) {
          console.log("Starting background auto-lock timer");
          lockTimer.current = setTimeout(
            () => {
              lockVault();
            },
            settings.autoLockMinutes * 60 * 1000,
          );
        }
      }

      // App came back: cancel pending background lock timer.
      if (nextState === "active" && lockTimer.current) {
        console.log("Canceling background auto-lock timer");
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
  }, [masterPassword]);

  return (
    <SessionContext.Provider
      value={{
        masterPassword,
        setMasterPassword,
        isLocked,
        lockVault,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => useContext(SessionContext);
