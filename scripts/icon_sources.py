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

    Explicit paths remain first so the canonical repository/HBC icon is stable. Any
    launcher icon added upstream is picked up automatically. Manifest paths are first
    resolved relative to appinfo.json, then against assets/ for projects that relocate
    launcher artwork during their build.
    """
    source = source.resolve()
    ordered: list[str] = []
    seen: set[str] = set()

    def add(path: Path | str) -> None:
        candidate = Path(path)
        if candidate.is_absolute():
            try:
                candidate = candidate.relative_to(source)
            except ValueError as exc:
                raise ValueError(f"launcher icon escapes source directory: {candidate}") from exc
        normalized = candidate.as_posix().lstrip("./")
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
    for key in _LAUNCHER_ICON_KEYS:
        value = appinfo.get(key)
        if not isinstance(value, str) or not value:
            continue

        manifest_relative = (appinfo_path.parent / value).resolve()
        assets_fallback = (source / "assets" / value).resolve()
        resolved = next((path for path in (manifest_relative, assets_fallback) if path.is_file()), None)
        if resolved is None:
            raise ValueError(f"launcher icon declared by {appinfo_path.name} does not exist: {value}")
        add(resolved)

    return ordered
