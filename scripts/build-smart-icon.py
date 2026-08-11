#!/usr/bin/env python3
"""Generate branded source icons and the matching Homebrew Channel icon."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

from badge_finish import apply_badge_opacity
from smart_badge import BadgeConfig, generate_branded_icon


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--repository-icon", required=True, type=Path)
    args = parser.parse_args()

    metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
    branding = metadata.get("branding", {})
    if not branding.get("enabled", metadata.get("kind") == "upstream-patch"):
        raise SystemExit(f"branding is disabled for {metadata['slug']}; do not invoke the badge builder")
    config = BadgeConfig.from_metadata(branding)
    opacity = float(branding.get("opacity", 1.0))
    icon_paths = branding.get("sourceIcons")
    if not isinstance(icon_paths, list) or not icon_paths or not all(isinstance(path, str) and path for path in icon_paths):
        raise SystemExit("branding.sourceIcons must be a non-empty list of source-relative paths")
    expected_size = branding.get("expectedSize")
    if (
        not isinstance(expected_size, list)
        or len(expected_size) != 2
        or not all(isinstance(value, int) and value > 0 for value in expected_size)
    ):
        raise SystemExit("branding.expectedSize must be [width, height]")

    branded: list[tuple[Path, Image.Image, dict[str, object]]] = []
    cache: dict[str, tuple[Image.Image, dict[str, object]]] = {}
    for relative in icon_paths:
        icon_path = (args.source / relative).resolve()
        if args.source.resolve() not in icon_path.parents:
            raise SystemExit(f"branding icon escapes source directory: {relative}")
        if not icon_path.is_file():
            raise SystemExit(f"branding source icon does not exist: {relative}")
        with Image.open(icon_path) as source:
            source.load()
            if list(source.size) != expected_size:
                raise SystemExit(f"{relative} is {source.size}, expected {tuple(expected_size)}")
            rgba = source.convert("RGBA")
            cache_key = hashlib.sha256(rgba.tobytes()).hexdigest()
            if cache_key not in cache:
                output, diagnostics = generate_branded_icon(rgba, config)
                output = apply_badge_opacity(rgba, output, opacity)
                diagnostics = {**diagnostics, "opacity": opacity}
                cache[cache_key] = (output, diagnostics)
            output, diagnostics = cache[cache_key]
        output.save(icon_path, format="PNG", optimize=True)
        branded.append((icon_path, output, diagnostics))
        print(json.dumps({"icon": relative, **diagnostics}, sort_keys=True))

    args.repository_icon.parent.mkdir(parents=True, exist_ok=True)
    branded[0][1].save(args.repository_icon, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
