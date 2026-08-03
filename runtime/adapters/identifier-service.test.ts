import { describe, expect, it } from "vitest";
import { IdentifierService } from "./identifier-service";

describe("IdentifierService.generateId", () => {
  it("generates a well-formed UUID", () => {
    const id = new IdentifierService().generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("generates distinct ids across calls", () => {
    const service = new IdentifierService();
    expect(service.generateId()).not.toBe(service.generateId());
  });
});

describe("IdentifierService.normalizeSlug", () => {
  const service = new IdentifierService();

  it("lowercases, trims, and collapses non-alphanumeric runs into a single hyphen", () => {
    expect(service.normalizeSlug("  Hello, World!  ")).toBe("hello-world");
  });

  it("collapses multiple separators into one hyphen", () => {
    expect(service.normalizeSlug("Cyclone   Radial--Profile")).toBe("cyclone-radial-profile");
  });

  it("does not leave leading or trailing hyphens", () => {
    expect(service.normalizeSlug("---Leading and Trailing---")).toBe("leading-and-trailing");
  });

  it("leaves an already-valid slug unchanged", () => {
    expect(service.normalizeSlug("already-a-slug")).toBe("already-a-slug");
  });
});
