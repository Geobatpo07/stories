import type { ClockPort } from "../ports/types";

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}

/** Deterministic clock for tests — `now()` always returns the same injected `Date`. */
export class FixedClock implements ClockPort {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return this.fixed;
  }
}
