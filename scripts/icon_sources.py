#!/usr/bin/env python3
"""Discover webOS launcher icon assets that must receive GTV branding."""

from __future__ import annotations

import json
from pathlib import Path


_LAUNCHER_ICON_KEYS = {
    "icon",
    "largeIcon",
    "mediumLargeIcon",
    "extraLargeIcon",
    "miniIcon",
}


def discover_launcher_icon_paths(source: Path, explicit_paths: list[str]) -> list[str]:
    """Return explicit branding icons plus every launcher icon declared by appinfo.json.

    Explicit paths remain first so the canonical repository/HBC icon is stable.  Any
    launcher icon added by an upstream app is then picked up automatically, preventing
    higher-resolution webOS launcher assets from escaping GTV branding.
    """
    ordered: list[str] = []
    seen: set[str] = set()

    def add(path: str) -> None:
        normalized = Path(path).as_posix().lstrip("./")
        if normalized and normalized not in seen:
            seen.add(normalized)
            ordered.append(normalized)

    for path in explicit_paths:
        add(path)

    candidates = [source / "assets" / "appinfo.json", source / "appinfo.json"]
    appinfo_path = next((path for path in candidates if path.is_file()), None)
    if appinfo_path is None:
        return ordered

    appinfo = json.loads(appinfo_path.read_text(encoding="utf-8"))
    appinfo_dir = appinfo_path.parent.relative_to(source)
    for key in _LAUNCHER_ICON_KEYS:
        value = appinfo.get(key)
        if isinstance(value, str) and value:
            add((appinfo_dir / value).as_posix())

    return ordered
