import { describe, expect, it, vi } from "vitest";
import { createMemoized, resetKernelCache } from "./cache";

describe("createMemoized", () => {
  it("computes once and returns the same reference on repeated calls", () => {
    const compute = vi.fn(() => ({ value: Math.random() }));
    const memoized = createMemoized(compute);

    const first = memoized.get();
    const second = memoized.get();

    expect(compute).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("reset() forces the next get() to recompute", () => {
    const compute = vi.fn(() => Symbol("value"));
    const memoized = createMemoized(compute);

    const first = memoized.get();
    memoized.reset();
    const second = memoized.get();

    expect(compute).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
  });
});

describe("resetKernelCache", () => {
  it("invalidates every memoized value created via createMemoized", () => {
    const compute = vi.fn(() => Symbol("value"));
    const memoized = createMemoized(compute);
    memoized.get();

    resetKernelCache();
    memoized.get();

    expect(compute).toHaveBeenCalledTimes(2);
  });
});
