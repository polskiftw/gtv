#!/usr/bin/env python3
from __future__ import annotations

import unittest

from versioning import derive_gtv_version


class GTVVersioningTests(unittest.TestCase):
    def test_fresh_baselines(self) -> None:
        self.assertEqual(derive_gtv_version("1.0.0", 0), "691.0.0")
        self.assertEqual(derive_gtv_version("0.5.3", 0), "690.5.3")

    def test_upstream_only_changes_only_upstream_portion(self) -> None:
        self.assertEqual(derive_gtv_version("1.0.1", 0), "691.0.1")
        self.assertEqual(derive_gtv_version("1.1.0", 0), "691.1.0")
        self.assertEqual(derive_gtv_version("0.5.4", 1), "1690.5.4")

    def test_gtv_changes_only_revision_prefix(self) -> None:
        self.assertEqual(derive_gtv_version("1.0.0", 1), "1691.0.0")
        self.assertEqual(derive_gtv_version("1.0.0", 2), "2691.0.0")
        self.assertEqual(derive_gtv_version("0.5.3", 1), "1690.5.3")
        self.assertEqual(derive_gtv_version("0.5.3", 2), "2690.5.3")

    def test_rejects_invalid_inputs(self) -> None:
        for version in ("1.0", "1.0.0gtv", "01.0.0"):
            with self.assertRaises(ValueError):
                derive_gtv_version(version, 0)
        for revision in (-1, True):
            with self.assertRaises(ValueError):
                derive_gtv_version("1.0.0", revision)


if __name__ == "__main__":
    unittest.main(verbosity=2)
