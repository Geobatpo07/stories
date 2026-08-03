import { getKnowledgeGraph, loadEverything, resetKernelCache } from "@/kernel";
import { beforeEach, describe, expect, it } from "vitest";
import { KernelKnowledgeSourceAdapter } from "./kernel-knowledge-source-adapter";

// Integration test — runs against the real content/ tree and the real
// Kernel, not mocks. Confirms the adapter is a pure 1:1 facade and adds
// no logic of its own.
beforeEach(() => {
  resetKernelCache();
});

describe("KernelKnowledgeSourceAdapter", () => {
  it("loadAll() returns exactly what @/kernel's loadEverything() returns", () => {
    const adapter = new KernelKnowledgeSourceAdapter();
    expect(adapter.loadAll()).toEqual(loadEverything());
  });

  it("getGraph() returns exactly what @/kernel's getKnowledgeGraph() returns", () => {
    const adapter = new KernelKnowledgeSourceAdapter();
    const graph = adapter.getGraph();
    const kernelGraph = getKnowledgeGraph();
    expect(graph.nodes.size).toBe(kernelGraph.nodes.size);
    expect(Array.from(graph.nodes.keys()).sort()).toEqual(
      Array.from(kernelGraph.nodes.keys()).sort(),
    );
  });
});
