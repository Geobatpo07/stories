"""Writes fixtures/schema-contract/<kind>/*.json.

Expected outcomes are declared HERE by hand (from reading the Zod source), never produced by
running either validator, so the fixtures cannot be circular. Both the Vitest and the pytest
contract tests assert against the `valid` / `expected` fields of each file.

Run from the repo root:  python backend/tools/generate_schema_contract_fixtures.py
"""

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "fixtures" / "schema-contract"

BASE = {
    "title": "A title",
    "slug": "a-slug",
    "description": "A description",
    "date": "2026-10-22",
}
BASE_DEFAULTS = {"status": "draft", "tags": []}

URL_OK = "https://example.org/x"

# kind -> required extras, optional extras (valid sample values), plus typed field groups.
SPECS = {
    "dataset": dict(required={}, optional={"sourceUrl": URL_OK, "license": "CC-BY-4.0"},
                    urls=["sourceUrl"], strs=["license"]),
    "experiment": dict(required={"questionSlug": "some-question"},
                       optional={"hypothesisSlug": "some-hypothesis"},
                       slugs=["questionSlug", "hypothesisSlug"]),
    "hypothesis": dict(required={"questionSlug": "some-question"}, optional={},
                       slugs=["questionSlug"]),
    "knowledge": dict(required={"noteType": "research-note"},
                      optional={"programSlug": "some-program"}, slugs=["programSlug"],
                      enums={"noteType": ["research-note", "development-log", "reading-note",
                                          "tutorial", "conference-note", "book-review", "essay"]}),
    "presentation": dict(required={},
                         optional={"venue": "A venue", "slidesUrl": URL_OK, "videoUrl": URL_OK,
                                   "programSlug": "some-program", "questionSlug": "some-question"},
                         slugs=["programSlug", "questionSlug"], urls=["slidesUrl", "videoUrl"],
                         strs=["venue"]),
    "program": dict(required={"theme": "Climate", "leadResearcher": "A. Person"},
                    optional={"relatedQuestionSlugs": ["q-one", "q-two"]},
                    slug_lists=["relatedQuestionSlugs"], strs=["theme", "leadResearcher"]),
    "publication": dict(required={},
                        optional={"venue": "A venue", "doi": "10.1000/xyz", "preprintUrl": URL_OK,
                                  "coAuthors": ["B. Author", "C. Author"]},
                        urls=["preprintUrl"], strs=["venue", "doi"], str_lists=["coAuthors"]),
    "question": dict(required={"programSlug": "some-program"}, optional={},
                     slugs=["programSlug"]),
    "software": dict(required={}, optional={"repositoryUrl": URL_OK, "license": "MIT"},
                     urls=["repositoryUrl"], strs=["license"]),
}


def main() -> None:
    # Only remove generated output: ROOT also holds the committed Vitest contract test.
    for kind in SPECS:
        shutil.rmtree(ROOT / kind, ignore_errors=True)
    (ROOT / "vocabulary.json").unlink(missing_ok=True)
    ROOT.mkdir(parents=True, exist_ok=True)
    for kind, spec in SPECS.items():
        out: dict[str, dict] = {}
        req, opt = spec["required"], spec["optional"]
        valid_base = {**BASE, **req}

        def ok(name, desc, data, expected):
            out[name] = {"description": desc, "input": data, "valid": True, "expected": expected}

        def bad(name, desc, data):
            out[name] = {"description": desc, "input": data, "valid": False}

        ok("valid-minimal", "required fields only; defaults filled", valid_base,
           {**valid_base, **BASE_DEFAULTS, **({k: [] for k in spec.get("slug_lists", [])
                                              + spec.get("str_lists", [])})})
        full = {**valid_base, **opt, "status": "active", "tags": ["a", "b"]}
        ok("valid-full", "every field supplied", full, full)
        ok("valid-unknown-field-stripped", "unknown keys are stripped, not rejected",
           {**valid_base, "mystery": 1, "nested": {"x": 1}},
           {**valid_base, **BASE_DEFAULTS, **({k: [] for k in spec.get("slug_lists", [])
                                              + spec.get("str_lists", [])})})
        ok("valid-impossible-date-matches-regex", "2026-13-45 passes: the schema only checks the shape",
           {**valid_base, "date": "2026-13-45"},
           {**valid_base, "date": "2026-13-45", **BASE_DEFAULTS,
            **({k: [] for k in spec.get("slug_lists", []) + spec.get("str_lists", [])})})
        for s in ["draft", "active", "paused", "concluded"]:
            ok(f"valid-status-{s}", f"status {s}", {**valid_base, "status": s},
               {**valid_base, "status": s, "tags": [],
                **({k: [] for k in spec.get("slug_lists", []) + spec.get("str_lists", [])})})

        for field in ["title", "slug", "description", "date", *req]:
            bad(f"invalid-missing-{field}", f"required field {field} missing",
                {k: v for k, v in valid_base.items() if k != field})
        bad("invalid-empty-title", "empty title", {**valid_base, "title": ""})
        bad("invalid-empty-description", "empty description", {**valid_base, "description": ""})
        bad("invalid-title-number", "title is a number (no coercion)", {**valid_base, "title": 5})
        bad("invalid-slug-casing", "uppercase slug", {**valid_base, "slug": "Bad-Slug"})
        bad("invalid-slug-underscore", "underscore in slug", {**valid_base, "slug": "bad_slug"})
        bad("invalid-slug-double-hyphen", "double hyphen", {**valid_base, "slug": "bad--slug"})
        bad("invalid-slug-trailing-newline", "trailing newline ($ must not match before it)",
            {**valid_base, "slug": "bad-slug\n"})
        bad("invalid-slug-empty", "empty slug", {**valid_base, "slug": ""})
        bad("invalid-date-format", "DD/MM/YYYY", {**valid_base, "date": "22/10/2026"})
        bad("invalid-date-single-digit", "unpadded", {**valid_base, "date": "2026-1-5"})
        bad("invalid-date-unicode-digits", "Arabic-Indic digits (\\d is ASCII-only in JS)",
            {**valid_base, "date": "2026-10-٢٢"})
        bad("invalid-date-trailing-newline", "trailing newline", {**valid_base, "date": "2026-10-22\n"})
        bad("invalid-date-not-string", "date is a number", {**valid_base, "date": 20261022})
        bad("invalid-status", "status outside the enum", {**valid_base, "status": "published"})
        bad("invalid-status-null", "null does not trigger the default", {**valid_base, "status": None})
        bad("invalid-status-case", "Draft is not draft", {**valid_base, "status": "Draft"})
        bad("invalid-tags-string", "tags must be an array", {**valid_base, "tags": "a"})
        bad("invalid-tags-null", "null does not trigger the default", {**valid_base, "tags": None})
        bad("invalid-tag-empty", "empty tag", {**valid_base, "tags": ["ok", ""]})
        bad("invalid-tag-number", "non-string tag", {**valid_base, "tags": [1]})
        bad("invalid-input-array", "input is an array, not an object", [valid_base])
        bad("invalid-input-null", "input is null", None)
        bad("invalid-input-string", "input is a string", "title: x")

        for f in spec.get("slugs", []):
            bad(f"invalid-rel-{f}-number", f"{f} is a number", {**valid_base, f: 7})
            bad(f"invalid-rel-{f}-list", f"{f} is a list (cardinality one)", {**valid_base, f: ["a-b"]})
            bad(f"invalid-rel-{f}-casing", f"{f} bad casing", {**valid_base, f: "Bad Slug"})
            bad(f"invalid-rel-{f}-empty", f"{f} empty", {**valid_base, f: ""})
            if f not in req:
                bad(f"invalid-rel-{f}-null", f"optional {f} rejects explicit null", {**valid_base, f: None})
        for f in spec.get("slug_lists", []):
            bad(f"invalid-rel-{f}-string", f"{f} is a string (cardinality many)", {**valid_base, f: "a-b"})
            bad(f"invalid-rel-{f}-bad-element", f"{f} has a bad slug element", {**valid_base, f: ["ok", "Bad"]})
            bad(f"invalid-rel-{f}-number-element", f"{f} has a non-string element", {**valid_base, f: [1]})
            bad(f"invalid-rel-{f}-null", f"{f} rejects explicit null", {**valid_base, f: None})
            ok(f"valid-rel-{f}-empty", f"{f} empty list", {**valid_base, f: []},
               {**valid_base, **BASE_DEFAULTS, f: []})
        for f in spec.get("urls", []):
            bad(f"invalid-url-{f}", f"{f} not a URL", {**valid_base, f: "not a url"})
            bad(f"invalid-url-{f}-empty", f"{f} empty", {**valid_base, f: ""})
            bad(f"invalid-url-{f}-null", f"{f} rejects explicit null", {**valid_base, f: None})
            bad(f"invalid-url-{f}-number", f"{f} non-string", {**valid_base, f: 5})
            ok(f"valid-url-{f}-returned-verbatim", "URL accepted and returned un-normalised",
               {**valid_base, f: "HTTPS://Example.ORG"},
               {**valid_base, **BASE_DEFAULTS, f: "HTTPS://Example.ORG",
                **({k: [] for k in spec.get("slug_lists", []) + spec.get("str_lists", [])})})
            ok(f"valid-url-{f}-non-http", "any WHATWG-parsable URL passes", {**valid_base, f: "mailto:a@b.c"},
               {**valid_base, **BASE_DEFAULTS, f: "mailto:a@b.c",
                **({k: [] for k in spec.get("slug_lists", []) + spec.get("str_lists", [])})})
        for f in spec.get("strs", []):
            bad(f"invalid-empty-{f}", f"{f} empty string", {**valid_base, f: ""})
            if f not in req:
                bad(f"invalid-null-{f}", f"optional {f} rejects explicit null", {**valid_base, f: None})
        for f in spec.get("str_lists", []):
            bad(f"invalid-{f}-empty-element", f"{f} has an empty element", {**valid_base, f: ["ok", ""]})
            bad(f"invalid-{f}-string", f"{f} must be a list", {**valid_base, f: "x"})
        for f, values in spec.get("enums", {}).items():
            for v in values:
                ok(f"valid-{f}-{v}", f"{f}={v}", {**valid_base, f: v},
                   {**valid_base, **BASE_DEFAULTS, f: v})
            bad(f"invalid-{f}-unknown", f"{f} outside the enum", {**valid_base, f: "blog"})
            bad(f"invalid-{f}-case", f"{f} wrong case", {**valid_base, f: "Research-Note"})

        directory = ROOT / kind
        directory.mkdir(parents=True)
        for name, body in out.items():
            (directory / f"{name}.json").write_text(
                json.dumps(body, indent=2, ensure_ascii=True) + "\n", encoding="utf8")

    (ROOT / "vocabulary.json").write_text(json.dumps({
        "contentStatus": ["draft", "active", "paused", "concluded"],
        "contentType": ["program", "question", "hypothesis", "note", "experiment", "software",
                        "publication", "dataset", "presentation"],
        "knowledgeObjectType": SPECS["knowledge"]["enums"]["noteType"],
    }, indent=2) + "\n", encoding="utf8")
    print("wrote", sum(1 for _ in ROOT.rglob("*.json")), "fixtures")


if __name__ == "__main__":
    main()
