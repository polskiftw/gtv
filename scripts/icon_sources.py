#!/usr/bin/env python3
"""Discover and manage webOS launcher icon assets used by GTV branding."""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path


_LAUNCHER_ICON_KEYS = {
    "icon",
    "largeIcon",
    "mediumLargeIcon",
    "extraLargeIcon",
    "miniIcon",
}


def _find_appinfo_path(source: Path) -> Path | None:
    candidates = [source / "assets" / "appinfo.json", source / "appinfo.json"]
    return next((path for path in candidates if path.is_file()), None)


def _resolve_launcher_icon(source: Path, appinfo_path: Path, value: str) -> Path:
    manifest_relative = (appinfo_path.parent / value).resolve()
    assets_fallback = (source / "assets" / value).resolve()
    resolved = next((path for path in (manifest_relative, assets_fallback) if path.is_file()), None)
    if resolved is None:
        raise ValueError(f"launcher icon declared by {appinfo_path.name} does not exist: {value}")
    if resolved != source and source not in resolved.parents:
        raise ValueError(f"launcher icon escapes source directory: {value}")
    return resolved


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

    appinfo_path = _find_appinfo_path(source)
    if appinfo_path is None:
        return ordered

    appinfo = json.loads(appinfo_path.read_text(encoding="utf-8"))
    for key in _LAUNCHER_ICON_KEYS:
        value = appinfo.get(key)
        if not isinstance(value, str) or not value:
            continue
        add(_resolve_launcher_icon(source, appinfo_path, value))

    return ordered


def cache_bust_launcher_icon_paths(source: Path, version: str) -> dict[str, str]:
    """Point appinfo.json at versioned copies of already-branded launcher icons.

    Some launcher implementations can keep a launchpoint's artwork while an app is
    updated in-place. A unique icon path for each installable GTV version prevents a
    stale path from surviving an update without changing the app ID.
    """
    source = source.resolve()
    appinfo_path = _find_appinfo_path(source)
    if appinfo_path is None:
        return {}

    if not isinstance(version, str) or not version:
        raise ValueError("version must be a non-empty string")
    version_tag = re.sub(r"[^A-Za-z0-9]+", "-", version).strip("-")
    if not version_tag:
        raise ValueError("version does not contain a usable launcher-icon cache-bust tag")

    appinfo = json.loads(appinfo_path.read_text(encoding="utf-8"))
    rewritten: dict[str, str] = {}
    for key in _LAUNCHER_ICON_KEYS:
        value = appinfo.get(key)
        if not isinstance(value, str) or not value:
            continue

        original = _resolve_launcher_icon(source, appinfo_path, value)
        destination = original.with_name(f"{original.stem}-gtv-{version_tag}{original.suffix}")
        shutil.copy2(original, destination)

        manifest_value = Path(os.path.relpath(destination, appinfo_path.parent)).as_posix()
        appinfo[key] = manifest_value
        rewritten[key] = manifest_value

    if rewritten:
        appinfo_path.write_text(json.dumps(appinfo, indent=2) + "\n", encoding="utf-8")
    return rewritten
