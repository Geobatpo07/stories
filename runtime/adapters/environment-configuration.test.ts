import { describe, expect, it } from "vitest";
import { PlatformConfigurationError } from "../errors";
import { EnvironmentConfiguration } from "./environment-configuration";

describe("EnvironmentConfiguration", () => {
  it("reads from the provided source, never real process.env, when a source is given", () => {
    const config = new EnvironmentConfiguration({ FOO: "bar" });
    expect(config.get("FOO")).toBe("bar");
    expect(config.get("MISSING")).toBeUndefined();
  });

  it("getOrThrow returns the value when present", () => {
    const config = new EnvironmentConfiguration({ FOO: "bar" });
    expect(config.getOrThrow("FOO")).toBe("bar");
  });

  it("getOrThrow throws PlatformConfigurationError naming the missing key", () => {
    const config = new EnvironmentConfiguration({});
    expect(() => config.getOrThrow("MISSING")).toThrow(PlatformConfigurationError);
    expect(() => config.getOrThrow("MISSING")).toThrow('Configuration missing: "MISSING".');
  });

  it("getAll returns every key from the source", () => {
    const config = new EnvironmentConfiguration({ FOO: "bar", BAZ: "qux" });
    expect(config.getAll()).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("load() re-snapshots from the source", () => {
    const source: Record<string, string | undefined> = { FOO: "bar" };
    const config = new EnvironmentConfiguration(source);

    source.FOO = "updated";
    expect(config.get("FOO")).toBe("bar"); // stale snapshot until load()

    config.load();
    expect(config.get("FOO")).toBe("updated");
  });
});
