"""Materialises the `content/` tree of a repository snapshot on disk, applies one publication to
it, and runs the real Python build pipeline against it (ADR-004 phase 3).

This is the "validate BEFORE committing" half of publishing. The snapshot comes from the tarball of
one pinned commit, so what is validated is exactly the tree the new commit will be built on.
"""

import io
import posixpath
import tarfile
from pathlib import Path
from typing import Any

MAX_SNAPSHOT_BYTES = 200 * 1024 * 1024  # a hostile or runaway archive must not fill the disk
CONTENT_PREFIX = "content/"


def extract_content_tree(archive: bytes, destination: Path) -> int:
    """Writes every regular file under `content/` of a GitHub tarball into `destination`.

    GitHub names the single top-level folder `<owner>-<repo>-<sha7>`; it is stripped. Anything that
    is not a plain file (symlink, hard link, device), an absolute path, or a path containing `..`
    is skipped. Returns the number of files written.
    """
    written = 0
    total = 0
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:*") as tar:
        for member in tar:
            if not member.isfile():
                continue
            top, _, relative = member.name.partition("/")
            if not top or not relative.startswith(CONTENT_PREFIX) or ".." in relative.split("/"):
                continue
            relative = posixpath.normpath(relative)
            if relative.startswith(("/", "../")) or not relative.startswith(CONTENT_PREFIX):
                continue
            total += member.size
            if total > MAX_SNAPSHOT_BYTES:
                raise ValueError("The repository snapshot is too large to validate.")
            source = tar.extractfile(member)
            if source is None:
                continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read())
            written += 1
    return written


def run_validation_build(root: Path) -> dict[str, Any]:
    """The Python build pipeline on `root`; returns its report (`success`: did it pass)."""
    from pipeline.build import run_build_pipeline  # heavy native imports: only when publishing

    return run_build_pipeline(root).to_dict()["report"]  # type: ignore[no-any-return]
