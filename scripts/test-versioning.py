#!/usr/bin/env python3
from __future__ import annotations

import unittest

from versioning import derive_gtv_version


class GTVVersioningTests(unittest.TestCase):
    def test_examples(self) -> None:
        self.assertEqual(derive_gtv_version("1.0.0", 1), "1.0.1")
        self.assertEqual(derive_gtv_version("1.0.0", 2), "1.0.2")
        self.assertEqual(derive_gtv_version("0.5.3", 1), "0.5.3001")
        self.assertEqual(derive_gtv_version("0.5.3", 2), "0.5.3002")
        self.assertEqual(derive_gtv_version("0.5.4", 1), "0.5.4001")

    def test_rejects_invalid_inputs(self) -> None:
        for version in ("1.0", "1.0.0gtv", "01.0.0"):
            with self.assertRaises(ValueError):
                derive_gtv_version(version, 1)
        for revision in (0, 1000, True):
            with self.assertRaises(ValueError):
                derive_gtv_version("1.0.0", revision)


if __name__ == "__main__":
    unittest.main(verbosity=2)
