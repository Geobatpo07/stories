"""Port of `contentHash()` in build/targets/manifest-target.ts.

TypeScript: entities sorted with `a.id.localeCompare(b.id)`, then
`sha256("<id>|<updatedAt>|<content>" lines joined by "\\n")`.

Collation, pinned deliberately: UTF-8 byte order (`byte_key`), not Python's default and not the
runtime locale. `localeCompare` is ICU/locale-dependent in general, but entity ids are
`<kind>:<slug>` with the kind drawn from a fixed lowercase vocabulary and the slug matching
`[a-z0-9]+(-[a-z0-9]+)*` (enforced by the schemas), i.e. the alphabet `[a-z0-9:-]`. For ids in that
alphabet Node's `localeCompare` and byte order give the same ordering.
`fixtures/build-contract/id-collation.json` records that, produced by Node's real `localeCompare`
over 261 ids that stress digit / hyphen / prefix ordering; backend/tests/test_content_hash.py and
the Vitest test beside the fixture assert it. If the id alphabet ever widens (uppercase, non-ASCII),
those tests fail and this module must be revisited. Only `localeCompare` as run by one Node/ICU
build was observed; a different ICU data version is not covered by anything but those tests.
"""

import hashlib
from collections.abc import Sequence

from kernel.types import KnowledgeEntity

from .graph_store import byte_key


def content_hash(entities: Sequence[KnowledgeEntity]) -> str:
    ordered = sorted(entities, key=lambda e: byte_key(e.id))
    material = "\n".join(f"{e.id}|{e.updated_at}|{e.content}" for e in ordered)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()
