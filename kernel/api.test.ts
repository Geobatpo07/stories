import { beforeEach, describe, expect, it } from "vitest";
import {
  findById,
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

// Integration test: runs against the real content tree and real domain schemas.
// It remains valid for a new, empty laboratory and as research is added.
beforeEach(() => {
  resetKernelCache();
});

describe("Knowledge Kernel public API", () => {
  it("loads every content collection without requiring seeded records", () => {
    const collections = [
      loadPrograms(),
      loadQuestions(),
      loadHypotheses(),
      loadExperiments(),
      loadKnowledgeObjects(),
      loadSoftware(),
      loadPublications(),
      loadDatasets(),
      loadPresentations(),
    ];

    expect(loadEverything()).toHaveLength(
      collections.reduce((sum, items) => sum + items.length, 0),
    );
  });

  it("builds one graph node for every loaded entity", () => {
    expect(getKnowledgeGraph().nodes.size).toBe(loadEverything().length);
  });

  it("loadResearchNotes()/loadTutorials() are disjoint filtered subsets", () => {
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

  it("findById returns undefined for unknown ids and resolves loaded entities", () => {
    expect(findById("program:does-not-exist")).toBeUndefined();
    for (const entity of loadEverything()) expect(findById(entity.id)).toBe(entity);
  });

  it("findRelated throws KnowledgeNotFoundError for an unknown id", () => {
    expect(() => findRelated("program:does-not-exist")).toThrow(KnowledgeNotFoundError);
  });

  it("memoizes loadEverything() results until resetKernelCache()", () => {
    const first = loadEverything();
    const second = loadEverything();
    expect(first).toBe(second);

    resetKernelCache();
    const third = loadEverything();
    expect(third).not.toBe(first);
    expect(third).toEqual(first);
  });
});
