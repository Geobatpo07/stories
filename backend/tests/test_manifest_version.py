"""platform_version() reads package.json's version and refuses a non-string one."""

import json
from pathlib import Path

import pytest

from pipeline import manifest


def test_reads_the_version_string(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "package.json").write_text(json.dumps({"version": "3.0.0"}), encoding="utf-8")
    monkeypatch.setattr(manifest, "REPO_ROOT", tmp_path)
    assert manifest.platform_version() == "3.0.0"


def test_refuses_a_non_string_version(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "package.json").write_text(json.dumps({"version": 3}), encoding="utf-8")
    monkeypatch.setattr(manifest, "REPO_ROOT", tmp_path)
    with pytest.raises(TypeError, match="must be a string"):
        manifest.platform_version()
