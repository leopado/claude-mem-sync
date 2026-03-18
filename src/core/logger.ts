import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { LOGS_DIR } from "./constants";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, msg: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  return data ? `${base} ${JSON.stringify(data)}` : base;
}

function writeToFile(logFile: string, formatted: string): void {
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
    appendFileSync(join(LOGS_DIR, logFile), formatted + "\n");
  } catch {
    // silently ignore file write errors
  }
}

export const logger = {
  debug(msg: string, data?: Record<string, unknown>) {
    if (!shouldLog("debug")) return;
    const formatted = formatMessage("debug", msg, data);
    console.debug(formatted);
    writeToFile("debug.log", formatted);
  },
  info(msg: string, data?: Record<string, unknown>) {
    if (!shouldLog("info")) return;
    const formatted = formatMessage("info", msg, data);
    console.log(formatted);
  },
  warn(msg: string, data?: Record<string, unknown>) {
    if (!shouldLog("warn")) return;
    const formatted = formatMessage("warn", msg, data);
    console.warn(formatted);
  },
  error(msg: string, data?: Record<string, unknown>) {
    if (!shouldLog("error")) return;
    const formatted = formatMessage("error", msg, data);
    console.error(formatted);
    writeToFile("error.log", formatted);
  },
};
