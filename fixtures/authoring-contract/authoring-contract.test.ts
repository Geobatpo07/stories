import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAuthoringDefinition,
  listAuthoringDefinitions,
  validateAuthoringFields,
  type EntityKind,
} from "@/kernel";

// ADR-004 Phase 4 step 1: the current output of kernel/authoring.ts, committed as the contract the
// future `GET /api/authoring/definitions` endpoint (step 2) and the Python port must reproduce.
// Regenerate with: UPDATE_GOLDEN=1 npx vitest run fixtures/authoring-contract
// TODO(step 2, see backend/PHASE4-AUDIT.md F2): backend/tests/test_authoring_contract.py must load
// definitions.json and validation-cases.json and assert identical output from the Python port.
const HERE = __dirname;
const UPDATE = process.env.UPDATE_GOLDEN === "1";

const CASES: { description: string; kind: EntityKind; fields: Record<string, unknown> }[] = [
  {
    description: "complete software artifact",
    kind: "software",
    fields: {
      title: "Research Tool",
      slug: "research-tool",
      description: "A research artifact.",
      date: "2026-08-03",
      status: "active",
      tags: ["a", "b"],
    },
  },
  { description: "note with only a title", kind: "note", fields: { title: "Early observation" } },
  { description: "program with nothing", kind: "program", fields: {} },
  {
    description: "software with an unknown field and a bad status",
    kind: "software",
    fields: {
      title: "T",
      slug: "t",
      description: "d",
      date: "2026-08-03",
      status: "nope",
      tags: [],
      extra: 1,
    },
  },
];

// JSON round trip drops `undefined` exactly as the future HTTP response would.
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

function definitions() {
  return asJson(listAuthoringDefinitions());
}
function validationCases() {
  return asJson(CASES.map((c) => ({ ...c, result: validateAuthoringFields(c.kind, c.fields) })));
}

function check(name: string, actual: unknown) {
  const path = join(HERE, name);
  if (UPDATE) writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
  expect(existsSync(path), "run with UPDATE_GOLDEN=1 to create the golden").toBe(true);
  expect(actual).toEqual(JSON.parse(readFileSync(path, "utf8")));
}

describe("kernel/authoring.ts contract", () => {
  it("lists the definitions of every kind in registration order", () => {
    check("definitions.json", definitions());
  });

  it("covers all nine kinds, and each definition has the documented keys", () => {
    const list = definitions() as {
      kind: string;
      label: string;
      publicKind: string;
      contentDir: string;
      fields: unknown[];
    }[];
    expect(list).toHaveLength(9);
    for (const definition of list) {
      expect(Object.keys(definition).sort()).toEqual([
        "contentDir",
        "fields",
        "kind",
        "label",
        "publicKind",
      ]);
    }
  });

  it("getAuthoringDefinition returns the matching list entry and throws for an unknown kind", () => {
    for (const definition of listAuthoringDefinitions()) {
      expect(getAuthoringDefinition(definition.kind)).toEqual(definition);
    }
    expect(() => getAuthoringDefinition("essay" as EntityKind)).toThrow(
      "Unknown knowledge kind: essay",
    );
  });

  it("validates fields with the current accept/reject results, issue texts and normalization", () => {
    check("validation-cases.json", validationCases());
  });
});
