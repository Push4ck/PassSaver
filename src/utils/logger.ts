type ConsoleMethod = (...args: unknown[]) => void;

let initialized = false;

const formatPrefix = (level: string) => {
  const now = new Date().toISOString();
  return `[${now}] [${level}]`;
};

export const initLogger = () => {
  if (initialized) return;
  initialized = true;

  const baseLog = console.log.bind(console) as ConsoleMethod;
  const baseWarn = console.warn.bind(console) as ConsoleMethod;
  const baseError = console.error.bind(console) as ConsoleMethod;
  const baseInfo = console.info.bind(console) as ConsoleMethod;

  console.log = (...args: unknown[]) => baseLog(formatPrefix("LOG"), ...args);
  console.info = (...args: unknown[]) => baseInfo(formatPrefix("INFO"), ...args);
  console.warn = (...args: unknown[]) => baseWarn(formatPrefix("WARN"), ...args);
  console.error = (...args: unknown[]) =>
    baseError(formatPrefix("ERROR"), ...args);

  const maybeErrorUtils = (globalThis as any)?.ErrorUtils;
  if (maybeErrorUtils?.getGlobalHandler && maybeErrorUtils?.setGlobalHandler) {
    const previous = maybeErrorUtils.getGlobalHandler();
    maybeErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      console.error("Unhandled JS error", { isFatal, message: error?.message });
      if (previous) previous(error, isFatal);
    });
  }

  console.log("Logger initialized");
};
