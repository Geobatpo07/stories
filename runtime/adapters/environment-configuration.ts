import { PlatformConfigurationError } from "../errors";
import type { ConfigurationPort } from "../ports/types";

/**
 * The ONLY file in `runtime/` permitted to touch `process.env` — every
 * other file reaches configuration only through `ConfigurationPort`.
 * Accepts an override source so tests never read or mutate real env vars.
 */
export class EnvironmentConfiguration implements ConfigurationPort {
  private snapshot: Readonly<Record<string, string | undefined>>;

  constructor(private readonly source: Record<string, string | undefined> = process.env) {
    this.snapshot = { ...source };
  }

  load(): void {
    this.snapshot = { ...this.source };
  }

  get(key: string): string | undefined {
    return this.snapshot[key];
  }

  getOrThrow(key: string): string {
    const value = this.snapshot[key];
    if (value === undefined) {
      throw new PlatformConfigurationError(`Configuration missing: "${key}".`);
    }
    return value;
  }

  getAll(): Readonly<Record<string, string | undefined>> {
    return this.snapshot;
  }
}
