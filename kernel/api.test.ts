import { beforeEach, describe, expect, it } from "vitest";
import {
  findById,
  findBySlug,
  findRelated,
  getKnowledgeGraph,
  KnowledgeNotFoundError,
  loadDatasets,
  loadEverything,
  loadExperiments,
  loadHypotheses,
  loadKnowledgeObjects,
  loadPresentations,
  loadPrograms,
  loadPublications,
  loadQuestions,
  loadResearchNotes,
  loadSoftware,
  loadTutorials,
  resetKernelCache,
} from "@/kernel";

// Integration test — runs against the real content/ tree and the real
// domain schemas, not mocks. Regression check that content and schemas
// stay in sync as both evolve.
beforeEach(() => {
  resetKernelCache();
});

describe("Knowledge Kernel public API", () => {
  it("loads exactly one entity per collection's example file", () => {
    expect(loadPrograms()).toHaveLength(1);
    expect(loadQuestions()).toHaveLength(1);
    expect(loadHypotheses()).toHaveLength(1);
    expect(loadExperiments()).toHaveLength(1);
    expect(loadKnowledgeObjects()).toHaveLength(1);
    expect(loadSoftware()).toHaveLength(1);
    expect(loadPublications()).toHaveLength(1);
    expect(loadDatasets()).toHaveLength(1);
    expect(loadPresentations()).toHaveLength(1);
    expect(loadEverything()).toHaveLength(9);
  });

  it("resolves the example Question's programSlug to the example Program", () => {
    const question = findBySlug("question", "cyclone-radial-profile-stability");
    expect(question).toBeDefined();

    const parents = getKnowledgeGraph().getParents(question!.id);
    expect(parents).toHaveLength(1);
    expect(parents[0]?.id).toBe("program:environmental-climate-modeling");
  });

  it("loadResearchNotes()/loadTutorials() are disjoint filtered subsets of loadKnowledgeObjects()", () => {
    const all = loadKnowledgeObjects();
    const notes = loadResearchNotes();
    const tutorials = loadTutorials();

    expect(notes.every((note) => all.some((entity) => entity.id === note.id))).toBe(true);
    expect(tutorials.every((tutorial) => all.some((entity) => entity.id === tutorial.id))).toBe(
      true,
    );
    expect(notes.some((note) => tutorials.some((tutorial) => tutorial.id === note.id))).toBe(false);
    expect(notes.every((note) => note.noteType === "research-note")).toBe(true);
  });

  it("findById returns undefined for an unknown id and the entity for a known one", () => {
    expect(findById("program:does-not-exist")).toBeUndefined();
    expect(findById("program:environmental-climate-modeling")).toBeDefined();
  });

  it("findRelated throws KnowledgeNotFoundError for an unknown id", () => {
    expect(() => findRelated("program:does-not-exist")).toThrow(KnowledgeNotFoundError);
  });

  it("loadEverything() results are memoized until resetKernelCache()", () => {
    const first = loadEverything();
    const second = loadEverything();
    expect(first).toBe(second);

    resetKernelCache();
    const third = loadEverything();
    expect(third).not.toBe(first);
    expect(third).toEqual(first);
  });
});
