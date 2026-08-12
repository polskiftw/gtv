#!/usr/bin/env python3
"""GTV version convention for patched webOS applications."""

from __future__ import annotations


def derive_gtv_version(upstream_version: str, gtv_revision: int) -> str:
    """Encode upstream identity plus a GTV-only revision as legal webOS x.y.z.

    The installable version keeps the upstream minor and patch components
    unchanged. The major component is prefixed with the GTV marker ``69``.
    A fresh GTV baseline uses no revision digit before that marker; later
    GTV-only functional revisions prepend their monotonically increasing
    revision number.

    Examples:
      upstream 1.0.0, GTV rev 0 -> 691.0.0
      upstream 1.0.1, GTV rev 0 -> 691.0.1
      upstream 1.0.0, GTV rev 1 -> 1691.0.0
      upstream 0.5.3, GTV rev 0 -> 690.5.3
      upstream 0.5.3, GTV rev 1 -> 1690.5.3

    Upstream-only updates change only the upstream portion. ``gtvRevision``
    changes only when GTV adds or fixes downstream behavior.
    """
    parts = upstream_version.split(".")
    if len(parts) != 3 or any(not part.isdigit() for part in parts):
        raise ValueError("upstream version must contain exactly three numeric components")
    if any(len(part) > 1 and part.startswith("0") for part in parts):
        raise ValueError("upstream version components must not contain leading zeroes")
    if not isinstance(gtv_revision, int) or isinstance(gtv_revision, bool) or gtv_revision < 0:
        raise ValueError("gtvRevision must be a non-negative integer")

    major, minor, patch = parts
    encoded_major = f"{gtv_revision if gtv_revision else ''}69{major}"
    components = (int(encoded_major), int(minor), int(patch))
    if any(component > 999_999_999 for component in components):
        raise ValueError("derived GTV version exceeds webOS component limits")
    return ".".join(str(component) for component in components)
