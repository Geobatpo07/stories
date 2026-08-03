import type { EventBusPort, EventHandler, PlatformEvent, PlatformEventType } from "../ports/types";

/**
 * Lightweight in-memory Event Bus. Dispatch is synchronous: every adapter
 * this sprint is synchronous, and a throwing handler propagates
 * immediately out of `publish()` rather than being swallowed — consistent
 * with ADR-001's "fail fast, loud" philosophy already established for the
 * Kernel. A broken subscriber during bootstrap should visibly break
 * bootstrap, not be silently absorbed.
 */
export class InMemoryEventBus implements EventBusPort {
  private readonly handlers = new Map<PlatformEventType, Set<EventHandler<PlatformEventType>>>();

  publish(event: PlatformEvent): void {
    const handlers = this.handlers.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(event);
    }
  }

  subscribe<K extends PlatformEventType>(type: K, handler: EventHandler<K>): void {
    let handlers = this.handlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(type, handlers);
    }
    handlers.add(handler as unknown as EventHandler<PlatformEventType>);
  }

  unsubscribe<K extends PlatformEventType>(type: K, handler: EventHandler<K>): void {
    this.handlers.get(type)?.delete(handler as unknown as EventHandler<PlatformEventType>);
  }
}
