import { describe, expect, it } from "vitest";
import {
  PlatformConfigurationError,
  PlatformInitializationError,
  PlatformLifecycleError,
} from "./errors";

describe("PlatformConfigurationError", () => {
  it("carries the message verbatim", () => {
    const error = new PlatformConfigurationError(
      "KnowledgeSourceAdapter not registered. Platform cannot start.",
    );
    expect(error.name).toBe("PlatformConfigurationError");
    expect(error.message).toBe("KnowledgeSourceAdapter not registered. Platform cannot start.");
  });
});

describe("PlatformInitializationError", () => {
  it("names the stage and the underlying cause's message, and preserves .cause", () => {
    const cause = new Error("boom");
    const error = new PlatformInitializationError("Build Knowledge Graph", cause);

    expect(error.name).toBe("PlatformInitializationError");
    expect(error.stage).toBe("Build Knowledge Graph");
    expect(error.message).toContain("Build Knowledge Graph");
    expect(error.message).toContain("boom");
    expect(error.cause).toBe(cause);
  });

  it("stringifies a non-Error cause", () => {
    const error = new PlatformInitializationError("Load Knowledge Sources", "not an error object");
    expect(error.message).toContain("not an error object");
  });
});

describe("PlatformLifecycleError", () => {
  it("carries the message verbatim", () => {
    const error = new PlatformLifecycleError(
      'Illegal lifecycle transition from "Running" to "Initializing".',
    );
    expect(error.name).toBe("PlatformLifecycleError");
    expect(error.message).toContain("Running");
    expect(error.message).toContain("Initializing");
  });
});
