/**
 * The Runtime's 5-state lifecycle. A failed boot lands in `Stopped`, not a
 * 6th "Failed" state — failure detail lives in the rejected `start()`
 * promise's `PlatformInitializationError` and the `PlatformInitializationFailed`
 * event, not in extra state-machine bookkeeping. See runtime/README.md.
 */
export type PlatformState = "Created" | "Initializing" | "Running" | "Stopping" | "Stopped";

const LEGAL_TRANSITIONS: Readonly<Record<PlatformState, readonly PlatformState[]>> = {
  Created: ["Initializing"],
  Initializing: ["Running", "Stopped"],
  Running: ["Stopping"],
  Stopping: ["Stopped"],
  Stopped: [],
};

export function isLegalTransition(from: PlatformState, to: PlatformState): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}
