import type { Logger } from "./types";

type LogLevel = "info" | "warn" | "error";

export function createLogger(base: Record<string, unknown>): Logger {
  return {
    info: createLogMethod("info", base),
    warn: createLogMethod("warn", base),
    error: createLogMethod("error", base),
  };
}

function createLogMethod(level: LogLevel, base: Record<string, unknown>) {
  return (message: string, fields: Record<string, unknown> = {}) => {
    const entry = {
      level,
      message,
      ...base,
      ...fields,
    };

    const line = JSON.stringify(entry);

    switch (level) {
      case "error":
        console.error(line);
        break;

      case "warn":
        console.warn(line);
        break;

      default:
        console.log(line);
    }
  };
}
