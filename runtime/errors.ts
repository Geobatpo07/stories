import type { BootstrapStage } from "./ports/types";

/**
 * A required collaborator was missing when `createPlatformRuntime()` was
 * called, or a required configuration key was missing when read via
 * `ConfigurationPort.getOrThrow()`. Thrown synchronously — no lifecycle
 * state exists yet at the point this can occur.
 */
export class PlatformConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformConfigurationError";
  }
}

/**
 * A bootstrap step threw during `.start()`. Wraps whatever the failing
 * step threw — including real Kernel errors like `KnowledgeValidationError`
 * — without re-wrapping twice; `.cause` carries the original error.
 */
export class PlatformInitializationError extends Error {
  constructor(
    readonly stage: BootstrapStage,
    cause: unknown,
  ) {
    super(
      `Platform failed to initialize during "${stage}": ${cause instanceof Error ? cause.message : String(cause)}`,
      {
        cause,
      },
    );
    this.name = "PlatformInitializationError";
  }
}

/** An illegal lifecycle operation: `start()` called twice, `stop()` before `Running`, `getContext()` before `Running`. */
export class PlatformLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformLifecycleError";
  }
}
