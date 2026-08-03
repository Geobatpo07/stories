import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleLogger } from "./console-logger";

describe("ConsoleLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes debug/info/warn through console.warn, never console.log", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    logger.debug("a debug message");
    logger.info("an info message");
    logger.warn("a warn message");

    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("[DEBUG]");
    expect(warnSpy.mock.calls[1]?.[0]).toContain("[INFO]");
    expect(warnSpy.mock.calls[2]?.[0]).toContain("[WARN]");
  });

  it("routes error through console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    new ConsoleLogger().error("something failed");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[ERROR]");
    expect(errorSpy.mock.calls[0]?.[0]).toContain("something failed");
  });
});
