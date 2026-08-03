import { describe, expect, it } from "vitest";
import { FixedClock, SystemClock } from "./clock";

describe("SystemClock", () => {
  it("returns the current time", () => {
    const before = Date.now();
    const now = new SystemClock().now();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("FixedClock", () => {
  it("returns the exact same injected Date across multiple calls", () => {
    const fixed = new Date("2026-01-01T00:00:00.000Z");
    const clock = new FixedClock(fixed);

    expect(clock.now()).toBe(fixed);
    expect(clock.now()).toBe(fixed);
    expect(clock.now()).toBe(fixed);
  });
});
