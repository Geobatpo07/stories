import { describe, expect, it } from "vitest";
import { isLegalTransition, type PlatformState } from "./lifecycle";

const LEGAL: readonly [PlatformState, PlatformState][] = [
  ["Created", "Initializing"],
  ["Initializing", "Running"],
  ["Initializing", "Stopped"],
  ["Running", "Stopping"],
  ["Stopping", "Stopped"],
];

const ILLEGAL: readonly [PlatformState, PlatformState][] = [
  ["Created", "Running"],
  ["Created", "Stopped"],
  ["Running", "Initializing"],
  ["Running", "Created"],
  ["Stopped", "Running"],
  ["Stopped", "Initializing"],
  ["Stopping", "Running"],
];

describe("isLegalTransition", () => {
  it.each(LEGAL)("allows %s -> %s", (from, to) => {
    expect(isLegalTransition(from, to)).toBe(true);
  });

  it.each(ILLEGAL)("rejects %s -> %s", (from, to) => {
    expect(isLegalTransition(from, to)).toBe(false);
  });

  it("Stopped is terminal — no legal outgoing transitions", () => {
    for (const to of ["Created", "Initializing", "Running", "Stopping", "Stopped"] as const) {
      expect(isLegalTransition("Stopped", to)).toBe(false);
    }
  });
});
