type ConsoleMethod = (...args: unknown[]) => void;

let initialized = false;

const formatPrefix = (level: string) => {
  const now = new Date().toISOString();
  return `[${now}] [${level}]`;
};

export const initLogger = () => {
  if (initialized) return;
  initialized = true;

  // Keep production runtime lean; verbose prefix wrapping is for debugging only.
  if (true) return;

  const baseLog = console.log.bind(console) as ConsoleMethod;
  const baseWarn = console.warn.bind(console) as ConsoleMethod;
  const baseError = console.error.bind(console) as ConsoleMethod;
  const baseInfo = console.info.bind(console) as ConsoleMethod;

  // stripped in production
  // stripped in production
  // stripped in production
  console.error = (...args: unknown[]) =>
    baseError(formatPrefix("ERROR"), ...args);

  const maybeErrorUtils = (globalThis as any)?.ErrorUtils;
  if (maybeErrorUtils?.getGlobalHandler && maybeErrorUtils?.setGlobalHandler) {
    const previous = maybeErrorUtils.getGlobalHandler();
    maybeErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      // stripped in production
      if (previous) previous(error, isFatal);
    });
  }

  // stripped in production
};


