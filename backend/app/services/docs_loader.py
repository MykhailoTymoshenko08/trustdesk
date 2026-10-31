"""reads docs/features/<feature>/* into addressable chunks; tolerates missing files"""
import json
import re
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings

DEFAULT_FILES = ("FEATURE.md", "end-to-end-flow.md", "known-gotchas.md")
_NUMBERED = re.compile(r"^\s*(\d+)[.)]\s+(.*)$")


@dataclass(frozen=True)
class DocChunk:
    ref: str  # "<feature>/<file>#<anchor>", anchor = step number or L<n>
    text: str


def _features_dir() -> Path:
    return Path(get_settings().features_dir)


def list_features() -> list[str]:
    root = _features_dir()
    return sorted(p.name for p in root.iterdir() if p.is_dir()) if root.is_dir() else []


def _chunks_of(feature: str, path: Path) -> list[DocChunk]:
    chunks, ordinal = [], 0
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        ordinal += 1
        m = _NUMBERED.match(line)
        anchor, text = (m.group(1), m.group(2)) if m else (f"L{ordinal}", line.lstrip("-* ").strip())
        chunks.append(DocChunk(f"{feature}/{path.name}#{anchor}", text))
    return chunks


def load_chunks(features: list[str] | None = None, files: tuple[str, ...] = DEFAULT_FILES) -> list[DocChunk]:
    """chunks for the given features (default all); missing dirs/files are skipped"""
    root = _features_dir()
    out: list[DocChunk] = []
    for feature in features or list_features():
        for name in files:
            path = root / feature / name
            if path.is_file():
                out.extend(_chunks_of(feature, path))
    return out


def load_entry_points(feature: str) -> list[dict]:
    path = _features_dir() / feature / "entry-points.json"
    if not path.is_file():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
