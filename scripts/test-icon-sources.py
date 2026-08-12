#!/usr/bin/env python3
"""Regression tests for automatic webOS launcher-icon discovery."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from icon_sources import cache_bust_launcher_icon_paths, discover_launcher_icon_paths


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

    def test_cache_bust_rewrites_launcher_paths_and_preserves_non_launcher_assets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            assets = source / "assets"
            assets.mkdir()
            (assets / "icon.png").write_bytes(b"branded-small")
            (assets / "largeIcon.png").write_bytes(b"branded-large")
            (assets / "playIcon.png").write_bytes(b"play")
            appinfo_path = assets / "appinfo.json"
            appinfo_path.write_text(
                json.dumps(
                    {
                        "icon": "icon.png",
                        "largeIcon": "largeIcon.png",
                        "playIcon": "playIcon.png",
                    }
                ),
                encoding="utf-8",
            )

            rewritten = cache_bust_launcher_icon_paths(source, "1690.5.3")
            appinfo = json.loads(appinfo_path.read_text(encoding="utf-8"))

            self.assertEqual(
                rewritten,
                {
                    "icon": "icon-gtv-1690-5-3.png",
                    "largeIcon": "largeIcon-gtv-1690-5-3.png",
                },
            )
            self.assertEqual(appinfo["icon"], "icon-gtv-1690-5-3.png")
            self.assertEqual(appinfo["largeIcon"], "largeIcon-gtv-1690-5-3.png")
            self.assertEqual(appinfo["playIcon"], "playIcon.png")
            self.assertEqual((assets / appinfo["icon"]).read_bytes(), b"branded-small")
            self.assertEqual((assets / appinfo["largeIcon"]).read_bytes(), b"branded-large")
            self.assertEqual((assets / "icon.png").read_bytes(), b"branded-small")
            self.assertEqual((assets / "largeIcon.png").read_bytes(), b"branded-large")

    def test_cache_bust_root_manifest_points_to_assets_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            assets = source / "assets"
            assets.mkdir()
            (assets / "icon.png").write_bytes(b"branded")
            appinfo_path = source / "appinfo.json"
            appinfo_path.write_text(json.dumps({"icon": "icon.png"}), encoding="utf-8")

            rewritten = cache_bust_launcher_icon_paths(source, "691.0.0")
            appinfo = json.loads(appinfo_path.read_text(encoding="utf-8"))

            self.assertEqual(rewritten, {"icon": "assets/icon-gtv-691-0-0.png"})
            self.assertEqual(appinfo["icon"], "assets/icon-gtv-691-0-0.png")
            self.assertEqual((source / appinfo["icon"]).read_bytes(), b"branded")


if __name__ == "__main__":
    unittest.main(verbosity=2)
