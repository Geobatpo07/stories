import type { LoggingPort } from "../ports/types";

/**
 * `eslint.config.mjs` sets `"no-console": ["warn", { allow: ["warn", "error"] }]`
 * — `console.log`/`console.info` are disallowed repo-wide (the same
 * constraint `scripts/verify-kernel.ts` already works around). `debug`/`info`
 * therefore also go through `console.warn`, prefixed to stay distinguishable.
 */
export class ConsoleLogger implements LoggingPort {
  debug(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[DEBUG] ${message}`, meta ?? "");
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[INFO] ${message}`, meta ?? "");
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[WARN] ${message}`, meta ?? "");
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[ERROR] ${message}`, meta ?? "");
  }
}
