/**
 * Manual replacement for `Object.groupBy` (ES2024) — not available on
 * Node.js 20.9, this project's declared floor (package.json's
 * `engines.node`); it was added to V8 after that release. TypeScript's
 * `esnext` lib types it fine, so this only fails at runtime, on an older
 * Node — exactly what broke the CI build (Node 20.9) while working locally
 * (a newer Node). Same signature and return shape as `Object.groupBy`.
 */
export function groupBy<T, K extends PropertyKey>(
  items: readonly T[],
  keyFn: (item: T) => K,
): Partial<Record<K, T[]>> {
  const result: Partial<Record<K, T[]>> = {};
  for (const item of items) {
    const key = keyFn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}
