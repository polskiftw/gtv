#!/usr/bin/env python3
"""Focused regression tests for the dynamic neon badge renderer."""

from __future__ import annotations

import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from smart_badge import BadgeConfig, generate_branded_icon


def synthetic_icon() -> Image.Image:
    height = width = 112
    y, x = np.mgrid[0:height, 0:width]
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    rgb[..., 0] = np.where(x < width // 2, 18 + y, 215 - y)
    rgb[..., 1] = np.where(y < height // 2, 35 + x, 185 - x // 2)
    rgb[..., 2] = np.where(x + y < width, 220 - x, 25 + y)
    alpha = np.full((height, width, 1), 255, dtype=np.uint8)
    alpha[:8, :8] = 0
    return Image.fromarray(np.concatenate((rgb, alpha), axis=-1))


class SmartBadgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = synthetic_icon()
        cls.output, cls.diagnostics = generate_branded_icon(
            cls.source,
            BadgeConfig(placement="bottom-right", scale=0.34, padding=0.04, work_scale=2),
        )

    def test_pricedown_gta_glyph_and_continuous_optimizer_are_active(self) -> None:
        self.assertEqual(self.diagnostics["glyph"], "g")
        self.assertEqual(self.diagnostics["font"], "Pricedown Black")
        self.assertEqual(
            self.diagnostics["font_sha256"],
            "19f8cd90ce76992c565debe80d167f58e6e1e79a6e0b86f24bd9dce12052b256",
        )
        self.assertGreaterEqual(self.diagnostics["continuous_candidates"], 50_000)
        self.assertGreater(self.diagnostics["control_points"], 200)
        self.assertEqual(self.diagnostics["regularization_iterations"], 24)

    def test_local_field_varies_and_contrasts(self) -> None:
        self.assertGreater(self.diagnostics["local_lightness_range"], 0.03)
        self.assertGreater(self.diagnostics["badge_lightness_range"], 0.03)
        self.assertGreater(self.diagnostics["badge_chroma_range"], 0.01)
        self.assertGreater(self.diagnostics["badge_background_delta_e_p10"], 0.12)

    def test_original_pixels_outside_neon_footprint_are_exact(self) -> None:
        before = np.asarray(self.source.convert("RGBA"))
        after = np.asarray(self.output.convert("RGBA"))
        x0, y0, x1, y1 = self.diagnostics["affected_bbox"]
        outside = np.ones(before.shape[:2], dtype=bool)
        outside[y0:y1, x0:x1] = False
        self.assertTrue(np.array_equal(before[outside], after[outside]))
        self.assertGreater(np.count_nonzero(np.any(before != after, axis=-1)), 100)
        self.assertLess((x1 - x0) * (y1 - y0), before.shape[0] * before.shape[1] * 0.35)

    def test_render_is_deterministic(self) -> None:
        repeated, diagnostics = generate_branded_icon(
            self.source,
            BadgeConfig(placement="bottom-right", scale=0.34, padding=0.04, work_scale=2),
        )
        self.assertEqual(self.output.tobytes(), repeated.tobytes())
        self.assertEqual(self.diagnostics, diagnostics)

    def test_dimensions_and_transparency_are_preserved(self) -> None:
        self.assertEqual(self.output.size, self.source.size)
        self.assertEqual(self.output.mode, "RGBA")
        self.assertEqual(self.output.getpixel((0, 0))[3], 0)

    def test_missing_font_fails_closed(self) -> None:
        with self.assertRaisesRegex(FileNotFoundError, "badge font not found"):
            generate_branded_icon(
                self.source,
                BadgeConfig(placement="bottom-right", scale=0.34, padding=0.04, work_scale=2),
                Path("does-not-exist.png"),
            )

    def test_wrong_font_hash_fails_closed(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "unexpected Pricedown font hash"):
            generate_branded_icon(
                self.source,
                BadgeConfig(placement="bottom-right", scale=0.34, padding=0.04, work_scale=2),
                Path(__file__),
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
