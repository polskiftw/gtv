#!/usr/bin/env python3
"""GTV version convention for patched webOS applications."""

from __future__ import annotations


def derive_gtv_version(upstream_version: str, gtv_revision: int) -> str:
    """Encode an upstream version plus GTV patch revision as legal webOS x.y.z.

    webOS requires exactly three numeric components, so suffixes such as
    ``1.0.0gtv`` are not installable. GTV reserves blocks of 1000 in the third
    component: upstream 1.0.0 + GTV rev 1 => 1.0.1001; upstream 0.5.3 + GTV
    rev 2 => 0.5.4002. This preserves upstream ordering while leaving 999 GTV
    revisions per pinned upstream release.
    """
    parts = upstream_version.split(".")
    if len(parts) != 3 or any(not part.isdigit() for part in parts):
        raise ValueError("upstream version must contain exactly three numeric components")
    if any(len(part) > 1 and part.startswith("0") for part in parts):
        raise ValueError("upstream version components must not contain leading zeroes")
    if not isinstance(gtv_revision, int) or isinstance(gtv_revision, bool) or not 1 <= gtv_revision <= 999:
        raise ValueError("gtvRevision must be an integer from 1 through 999")

    major, minor, patch = (int(part) for part in parts)
    encoded_patch = (patch + 1) * 1000 + gtv_revision
    if any(component > 999_999_999 for component in (major, minor, encoded_patch)):
        raise ValueError("derived GTV version exceeds webOS component limits")
    return f"{major}.{minor}.{encoded_patch}"
