/**
 * Generic single-slot memoization used throughout the pipeline to avoid
 * re-parsing/re-validating/re-resolving on every call within a process.
 * Each memoized value registers its own reset function here so
 * `resetKernelCache()` (exposed on the Public API, mainly for tests) can
 * invalidate everything without every caller needing to know what's cached.
 *
 * Extension point: incremental builds. A future version could key each
 * slot's validity on source file mtimes instead of "computed once, valid
 * forever within the process" — not implemented this sprint.
 */
export interface Memoized<T> {
  get(): T;
  reset(): void;
}

const resets: Array<() => void> = [];

export function createMemoized<T>(compute: () => T): Memoized<T> {
  let hasValue = false;
  let value: T | undefined;

  const reset = (): void => {
    hasValue = false;
    value = undefined;
  };
  resets.push(reset);

  return {
    get(): T {
      if (!hasValue) {
        value = compute();
        hasValue = true;
      }
      return value as T;
    },
    reset,
  };
}

/** Invalidate every memoized value created via `createMemoized`. */
export function resetKernelCache(): void {
  for (const reset of resets) reset();
}
