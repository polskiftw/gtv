#!/usr/bin/env python3
"""Regression tests for automatic webOS launcher-icon discovery."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from icon_sources import discover_launcher_icon_paths


class LauncherIconDiscoveryTests(unittest.TestCase):
    def test_all_launcher_sizes_are_discovered_without_branding_play_icon(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            assets = source / "assets"
            assets.mkdir()
            for name in ("icon.png", "largeIcon.png", "mediumLargeIcon.png", "extraLargeIcon.png", "playIcon.png"):
                (assets / name).touch()
            (assets / "appinfo.json").write_text(
                json.dumps(
                    {
                        "icon": "icon.png",
                        "largeIcon": "largeIcon.png",
                        "mediumLargeIcon": "mediumLargeIcon.png",
                        "extraLargeIcon": "extraLargeIcon.png",
                        "playIcon": "playIcon.png",
                    }
                ),
                encoding="utf-8",
            )

            paths = discover_launcher_icon_paths(source, ["assets/icon.png"])

            self.assertEqual(paths[0], "assets/icon.png")
            self.assertEqual(
                set(paths),
                {
                    "assets/icon.png",
                    "assets/largeIcon.png",
                    "assets/mediumLargeIcon.png",
                    "assets/extraLargeIcon.png",
                },
            )
            self.assertNotIn("assets/playIcon.png", paths)

    def test_root_manifest_resolves_assets_directory_layout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            assets = source / "assets"
            assets.mkdir()
            (assets / "icon.png").touch()
            (assets / "largeIcon.png").touch()
            (source / "appinfo.json").write_text(
                json.dumps({"icon": "icon.png", "largeIcon": "largeIcon.png"}),
                encoding="utf-8",
            )

            paths = discover_launcher_icon_paths(source, ["assets/icon.png"])
            self.assertEqual(paths, ["assets/icon.png", "assets/largeIcon.png"])

    def test_explicit_icon_order_is_preserved_and_duplicates_are_removed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            assets = source / "assets"
            assets.mkdir()
            (assets / "icon.png").touch()
            (assets / "largeIcon.png").touch()
            (assets / "appinfo.json").write_text(
                json.dumps({"icon": "icon.png", "largeIcon": "largeIcon.png"}),
                encoding="utf-8",
            )

            paths = discover_launcher_icon_paths(
                source,
                ["assets/icon.png", "assets/largeIcon.png", "assets/icon.png"],
            )

            self.assertEqual(paths, ["assets/icon.png", "assets/largeIcon.png"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
