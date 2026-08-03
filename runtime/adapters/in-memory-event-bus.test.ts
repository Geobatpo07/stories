import { describe, expect, it } from "vitest";
import type { PlatformEvent } from "../ports/types";
import { InMemoryEventBus } from "./in-memory-event-bus";

const started: PlatformEvent = { type: "PlatformStarted", timestamp: new Date("2026-01-01") };
const graphBuilt: PlatformEvent = {
  type: "GraphBuilt",
  timestamp: new Date("2026-01-01"),
  nodeCount: 1,
  edgeCount: 0,
};

describe("InMemoryEventBus", () => {
  it("delivers a published event only to handlers subscribed to that event type", () => {
    const bus = new InMemoryEventBus();
    const startedEvents: PlatformEvent[] = [];
    const graphEvents: PlatformEvent[] = [];
    bus.subscribe("PlatformStarted", (event) => startedEvents.push(event));
    bus.subscribe("GraphBuilt", (event) => graphEvents.push(event));

    bus.publish(started);

    expect(startedEvents).toEqual([started]);
    expect(graphEvents).toEqual([]);
  });

  it("delivers to multiple subscribers of the same type, in subscription order", () => {
    const bus = new InMemoryEventBus();
    const order: string[] = [];
    bus.subscribe("PlatformStarted", () => order.push("first"));
    bus.subscribe("PlatformStarted", () => order.push("second"));

    bus.publish(started);

    expect(order).toEqual(["first", "second"]);
  });

  it("unsubscribe stops further delivery to that handler", () => {
    const bus = new InMemoryEventBus();
    const received: PlatformEvent[] = [];
    const handler = (event: PlatformEvent): void => {
      received.push(event);
    };
    bus.subscribe("PlatformStarted", handler);

    bus.unsubscribe("PlatformStarted", handler);
    bus.publish(started);

    expect(received).toEqual([]);
  });

  it("publishing with no subscribers is a no-op, not an error", () => {
    const bus = new InMemoryEventBus();
    expect(() => bus.publish(graphBuilt)).not.toThrow();
  });

  it("a throwing handler propagates synchronously out of publish()", () => {
    const bus = new InMemoryEventBus();
    bus.subscribe("PlatformStarted", () => {
      throw new Error("broken subscriber");
    });

    expect(() => bus.publish(started)).toThrow("broken subscriber");
  });
});
