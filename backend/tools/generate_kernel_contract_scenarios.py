"""Writes fixtures/kernel-contract/scenarios/<name>/content/<collection>/*.

Each scenario is a miniature repo root (`content/<collection>/` exactly as in the real repo), so
the TS pipeline stages and the Python kernel can both be pointed at it. Only INPUTS are written
here; `expected.json` is produced by the real TypeScript Kernel
(`UPDATE_GOLDEN=1 npx vitest run fixtures/kernel-contract`) and then asserted by both languages.

Run from the repo root:  python backend/tools/generate_kernel_contract_scenarios.py
"""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "fixtures" / "kernel-contract" / "scenarios"

COLLECTIONS = [
    "programs", "questions", "hypotheses", "experiments", "notes",
    "software", "publications", "datasets", "presentations",
]


def fm(**fields) -> str:
    """Render a frontmatter block. Values are written verbatim (caller quotes when needed)."""
    lines = ["---"]
    for key, value in fields.items():
        if isinstance(value, list):
            if not value:
                lines.append(f"{key}: []")
            else:
                lines.append(f"{key}:")
                lines.extend(f"  - {item}" for item in value)
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def base(slug, title=None, **extra):
    return dict(
        title=title or f"Title of {slug}",
        slug=slug,
        description=f"Description of {slug}",
        date='"2026-03-01"',
        **extra,
    )


def scenario(name: str, files: dict[str, str | bytes], skip_dirs: tuple[str, ...] = ()) -> None:
    root = ROOT / name / "content"
    for collection in COLLECTIONS:
        if collection in skip_dirs:
            continue
        (root / collection).mkdir(parents=True)
        (root / collection / ".gitkeep").write_text("", encoding="utf8")
    for relative, body in files.items():
        path = root / relative
        data = body if isinstance(body, bytes) else body.encode("utf8")
        path.write_bytes(data)


def main() -> None:
    if ROOT.exists():
        shutil.rmtree(ROOT)

    program = fm(**base("lab", "Laboratory", theme="Climate", leadResearcher="A. Person",
                        status="active", tags=["zeta", "alpha", "alpha", "😀", "ﬁ"],
                        relatedQuestionSlugs=["q-two", "q-one"])) + "\nProgram body.\n\n---\n\nAfter a horizontal rule.\n"
    scenario("ok-full", {
        "programs/lab.mdx": program,
        "programs/sandbox.md": fm(**base("sandbox", theme="Misc", leadResearcher="B. Person")) + "Sandbox.",
        "questions/q-one.mdx": fm(**base("q-one", programSlug="lab", tags=["b", "a"])) + "Q one body éàü — “quoted”.\n",
        "questions/q-two.mdx": fm(**base("q-two", programSlug="lab")) + "  \n\nQ two.  \n\n",
        "hypotheses/h-one.mdx": fm(**base("h-one", questionSlug="q-one")) + "H one.",
        "experiments/e-one.mdx": fm(**base("e-one", questionSlug="q-two", hypothesisSlug="h-one")) + "E one.",
        "experiments/e-two.mdx": fm(**base("e-two", questionSlug="q-one")) + "",
        "notes/n-one.mdx": fm(**base("n-one", noteType="essay", programSlug="lab")) + "Note.",
        "notes/n-two.mdx": fm(**base("n-two", noteType="tutorial")) + "Note two.",
        "software/s-one.mdx": fm(**base("s-one", repositoryUrl="https://example.org/repo", license="MIT")) + "S.",
        "publications/p-one.mdx": fm(**base("p-one", venue="A Venue", doi="10.1000/xyz",
                                              coAuthors=["C. Author", "D. Author"])) + "P.",
        "datasets/d-one.mdx": fm(**base("d-one", sourceUrl="https://example.org/data")) + "D.",
        "presentations/t-one.mdx": fm(**base("t-one", venue="A Conf", programSlug="lab",
                                               questionSlug="q-one", slidesUrl="https://example.org/s")) + "T.",
        # Filename differs from slug: identity comes from frontmatter.
        "datasets/file-name-differs.mdx": fm(**base("d-two")) + "Different filename.",
        # Not a content file: ignored by discovery.
        "datasets/notes.txt": "ignored",
        # CRLF line endings throughout.
        "software/s-crlf.mdx": (fm(**base("s-crlf")) + "Line one\nLine two\n").replace("\n", "\r\n"),
    })
    scenario("ok-empty", {})
    scenario("ok-duplicate-slug", {
        # Two files, same kind+slug: the Kernel does not reject this itself (build/ does later).
        "datasets/a-first.mdx": fm(**base("same", "First")) + "first",
        "datasets/b-second.mdx": fm(**base("same", "Second")) + "second",
    })
    scenario("ok-yaml-quirks", {
        # YAML 1.1 booleans must stay strings (js-yaml 3 and YAML 1.2 agree), numbers-as-strings quoted.
        "datasets/quirks.mdx": fm(**base("quirks", "Yes", license="'on'")) + "quirks",
        "software/colon.mdx": fm(**base("colon", "A: B")).replace("title: A: B", 'title: "A: B"') + "colon",
        "publications/block.mdx": "---\ntitle: Block\nslug: block\ndescription: >\n  folded\n  text\ndate: \"2026-03-01\"\n---\nbody\n",
    })
    d = 'title: T\nslug: {s}\ndescription: D\ndate: "2026-03-01"\n'
    scenario("ok-frontmatter-edges", {
        # UTF-8 BOM before the opening delimiter is stripped.
        "datasets/bom.mdx": b"\xef\xbb\xbf---\n" + d.format(s="bom").encode() + b"---\nbody",
        # No closing delimiter: the whole remainder is frontmatter and the body is empty.
        "datasets/no-close.mdx": "---\n" + d.format(s="no-close"),
        # `---json` selects the JSON engine.
        "datasets/json-lang.mdx": '---json\n{"title": "T", "slug": "json-lang", "description": "D", "date": "2026-03-01"}\n---\nbody',
        # Comment lines inside YAML frontmatter.
        "datasets/comments.mdx": "---\n# a comment\n" + d.format(s="comments").replace("description: D", "description: D # trailing") + "---\nbody",
        # A line starting with `----` also closes the block (gray-matter searches for \n---).
        "datasets/long-close.mdx": "---\n" + d.format(s="long-close") + "----\nbody after",
        # Body trimming uses JavaScript whitespace (U+00A0, U+FEFF, U+3000), not Python's.
        "datasets/trim.mdx": "---\n" + d.format(s="trim") + "---\n ﻿  body 　\n",
        # Python-only whitespace (U+0085, U+001F) is NOT trimmed by JavaScript.
        "datasets/trim-python-only.mdx": "---\n" + d.format(s="trim-python-only") + "---\n\u0085body\u001f",
    })
    scenario("err-frontmatter-comment-only", {"datasets/c.mdx": "---\n# only a comment\n---\nbody"})
    scenario("err-frontmatter-dashes-not-delimiter", {"datasets/x.mdx": "----\ntitle: T\n----\nbody"})
    scenario("err-frontmatter-scalar", {"datasets/s.mdx": "---\njust a string\n---\nbody"})
    scenario("err-frontmatter-list", {"datasets/l.mdx": "---\n- a\n- b\n---\nbody"})
    scenario("err-frontmatter-null", {"datasets/n.mdx": "---\n~\n---\nbody"})
    scenario("err-unknown-language", {"datasets/t.mdx": "---toml\ntitle = 'x'\n---\nbody"})
    scenario("err-yaml-duplicate-key", {"datasets/dup.mdx": "---\ntitle: A\ntitle: B\n---\nbody"})
    scenario("err-validation-many", {
        "programs/bad.mdx": "---\ntitle: ''\nslug: Bad_Slug\ndate: 01/02/2026\nstatus: published\ntags: [a, '']\nrelatedQuestionSlugs: nope\n---\nbody\n",
    })
    scenario("err-yaml-date-unquoted", {
        "datasets/dated.mdx": "---\ntitle: T\nslug: dated\ndescription: D\ndate: 2026-03-01\n---\nbody\n",
    })
    scenario("err-malformed-yaml", {
        "datasets/broken.mdx": "---\ntitle: [unclosed\nslug: broken\n---\nbody\n",
    })
    scenario("err-no-frontmatter", {
        "datasets/plain.mdx": "Just a body, no frontmatter.\n",
    })
    scenario("err-empty-file", {
        "datasets/empty.mdx": "",
    })
    scenario("err-dangling-one", {
        "questions/orphan.mdx": fm(**base("orphan", programSlug="no-such-program")) + "body",
    })
    scenario("err-dangling-many", {
        "programs/lab.mdx": fm(**base("lab", theme="T", leadResearcher="L",
                                      relatedQuestionSlugs=["missing-q"])) + "body",
    })
    scenario("err-wrong-target-kind", {
        # hypothesisSlug must resolve to a *hypothesis*; a question with that slug does not count.
        "questions/shared.mdx": fm(**base("shared", programSlug="lab")) + "q",
        "programs/lab.mdx": fm(**base("lab", theme="T", leadResearcher="L")) + "p",
        "experiments/e.mdx": fm(**base("e", questionSlug="shared", hypothesisSlug="shared")) + "e",
    })
    scenario("err-missing-collection-dir", {}, skip_dirs=("datasets",))
    print("wrote", sum(1 for _ in ROOT.rglob("*") if _.is_file()), "scenario files")


if __name__ == "__main__":
    main()
