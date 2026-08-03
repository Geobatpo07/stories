import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentTypeSchema } from "@/schemas";
import { registrations } from "./registrations";

describe("registrations", () => {
  it("every registration's kind is a valid ContentType value", () => {
    for (const registration of registrations) {
      expect(() => contentTypeSchema.parse(registration.kind)).not.toThrow();
    }
  });

  it("every registration's contentDir exists on disk", () => {
    for (const registration of registrations) {
      expect(existsSync(registration.contentDir)).toBe(true);
    }
  });

  it("every relationshipField's targetKind names a kind that is itself registered", () => {
    const knownKinds = new Set(registrations.map((registration) => registration.kind));
    for (const registration of registrations) {
      for (const spec of registration.relationshipFields) {
        expect(knownKinds.has(spec.targetKind)).toBe(true);
      }
    }
  });

  it("has no duplicate kinds", () => {
    const kinds = registrations.map((registration) => registration.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
