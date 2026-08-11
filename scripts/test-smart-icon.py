#!/usr/bin/env python3
"""Focused regression tests for the dynamic neon badge renderer."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from badge_finish import apply_badge_opacity
from smart_badge import DEFAULT_FONT, BadgeConfig, _glyph_mask, generate_branded_icon


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_METADATA = ROOT / "apps" / "lg-app-update-blocker" / "app.json"


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

    def test_production_branding_metadata_is_regression_locked(self) -> None:
        metadata = json.loads(PRODUCTION_METADATA.read_text(encoding="utf-8"))
        branding = metadata["branding"]
        self.assertEqual(metadata["version"], "1.0.6")
        self.assertEqual(branding["expectedSize"], [400, 400])
        self.assertEqual(branding["placement"], "bottom-right")
        self.assertAlmostEqual(float(branding["scale"]), 0.36)
        self.assertAlmostEqual(float(branding["padding"]), 0.05)
        self.assertAlmostEqual(float(branding["opacity"]), 0.92)

    def test_production_glyph_geometry_uses_real_400px_four_x_settings(self) -> None:
        metadata = json.loads(PRODUCTION_METADATA.read_text(encoding="utf-8"))
        config = BadgeConfig.from_metadata(metadata["branding"])
        width, height = metadata["branding"]["expectedSize"]
        work_size = (width * config.work_scale, height * config.work_scale)
        _, (x0, y0, x1, y1) = _glyph_mask(work_size, config, DEFAULT_FONT)

        glyph_extent = max(x1 - x0, y1 - y0) / config.work_scale
        right_gap = (work_size[0] - x1) / config.work_scale
        bottom_gap = (work_size[1] - y1) / config.work_scale

        self.assertGreaterEqual(glyph_extent, 130.0)
        self.assertLessEqual(glyph_extent, 160.0)
        self.assertGreaterEqual(right_gap, 14.0)
        self.assertLessEqual(right_gap, 25.0)
        self.assertGreaterEqual(bottom_gap, 14.0)
        self.assertLessEqual(bottom_gap, 25.0)
        self.assertGreaterEqual(x0 / config.work_scale, 210.0)
        self.assertGreaterEqual(y0 / config.work_scale, 210.0)

    def test_badge_opacity_softens_only_the_branding_delta(self) -> None:
        original = Image.new("RGBA", (2, 2), (40, 80, 120, 255))
        branded = Image.new("RGBA", (2, 2), (220, 20, 180, 255))
        softened = apply_badge_opacity(original, branded, 0.92)

        before = np.asarray(original, dtype=np.int16)
        full = np.asarray(branded, dtype=np.int16)
        soft = np.asarray(softened, dtype=np.int16)
        full_delta = int(np.abs(full - before).sum())
        soft_delta = int(np.abs(soft - before).sum())

        self.assertLess(soft_delta, full_delta)
        self.assertGreater(soft_delta, full_delta * 0.89)
        self.assertTrue(np.array_equal(np.asarray(apply_badge_opacity(original, branded, 1.0)), full))

    def test_invalid_badge_opacity_fails_closed(self) -> None:
        image = Image.new("RGBA", (1, 1), (0, 0, 0, 255))
        with self.assertRaisesRegex(ValueError, "branding.opacity"):
            apply_badge_opacity(image, image, 0.0)
        with self.assertRaisesRegex(ValueError, "branding.opacity"):
            apply_badge_opacity(image, image, 1.01)

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
