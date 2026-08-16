#!/usr/bin/env python3
"""Validate generated HBC metadata, IPKs, versions, and branded icons."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import tarfile
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / "apps"
REPO = ROOT / "repo"
REPOSITORY_REF = (
    os.environ.get("GTV_REPOSITORY_REF")
    or os.environ.get("GITHUB_REF_NAME")
    or "main"
)
if not re.fullmatch(r"[A-Za-z0-9._-]+", REPOSITORY_REF):
    raise SystemExit(f"unsupported repository ref for raw URLs: {REPOSITORY_REF!r}")
RAW_BASE = f"https://raw.githubusercontent.com/polskiftw/gtv/{REPOSITORY_REF}/repo"


def fail(message: str) -> None:
    raise SystemExit(message)


def read_ar(path: Path) -> dict[str, bytes]:
    data = path.read_bytes()
    if not data.startswith(b"!<arch>\n"):
        fail(f"not a Debian ar package: {path.relative_to(ROOT)}")
    offset = 8
    members: dict[str, bytes] = {}
    while offset < len(data):
        header = data[offset : offset + 60]
        if len(header) != 60 or header[58:60] != b"`\n":
            fail(f"invalid ar member header in {path.relative_to(ROOT)}")
        name = header[:16].decode("ascii").strip().rstrip("/")
        try:
            size = int(header[48:58].decode("ascii").strip())
        except ValueError:
            fail(f"invalid ar member size in {path.relative_to(ROOT)}")
        start = offset + 60
        members[name] = data[start : start + size]
        offset = start + size + (size % 2)
    return members


def read_tar_member(archive: bytes, suffix: str) -> bytes:
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:*") as package:
        matches = [member for member in package.getmembers() if member.isfile() and member.name.endswith(suffix)]
        if len(matches) != 1:
            fail(f"expected one package member ending {suffix!r}, found {len(matches)}")
        extracted = package.extractfile(matches[0])
        if extracted is None:
            fail(f"could not extract package member {matches[0].name}")
        return extracted.read()


def parse_control(data: bytes) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in data.decode("utf-8").splitlines():
        if ":" in line and not line.startswith((" ", "\t")):
            key, value = line.split(":", 1)
            fields[key] = value.strip()
    return fields


def image_array(data: bytes, label: str, expected_size: tuple[int, int]) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            if image.format != "PNG":
                fail(f"{label} must be PNG, got {image.format}")
            if image.size != expected_size:
                fail(f"{label} is {image.size}, expected {expected_size}")
            return np.asarray(image.convert("RGBA"))
    except (OSError, ValueError) as error:
        fail(f"invalid {label}: {error}")


def validate_app(metadata_path: Path, feed_package: dict[str, object]) -> None:
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    slug = metadata["slug"]
    app_id = metadata["id"]
    version = metadata["version"]
    package_path = REPO / "packages" / f"{slug}.ipk"
    manifest_path = REPO / "manifests" / f"{slug}.json"
    if not package_path.is_file() or not manifest_path.is_file():
        fail(f"missing generated package or manifest for {slug}")

    package_bytes = package_path.read_bytes()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected_hash = hashlib.sha256(package_bytes).hexdigest()
    if manifest.get("version") != version:
        fail(f"{slug}: manifest version does not match app.json")
    if manifest.get("ipkHash") != {"sha256": expected_hash} or manifest.get("ipkSize") != len(package_bytes):
        fail(f"{slug}: manifest package hash/size is stale")
    if feed_package.get("manifest") != manifest:
        fail(f"{slug}: embedded feed manifest differs from standalone manifest")
    if feed_package.get("manifestUrl") != f"{RAW_BASE}/manifests/{slug}.json":
        fail(f"{slug}: incorrect manifest URL")

    ar = read_ar(package_path)
    if "control.tar.gz" not in ar or "data.tar.gz" not in ar:
        fail(f"{slug}: package is missing control.tar.gz or data.tar.gz")
    control = parse_control(read_tar_member(ar["control.tar.gz"], "control"))
    appinfo = json.loads(read_tar_member(ar["data.tar.gz"], f"/applications/{app_id}/appinfo.json"))
    packageinfo = json.loads(read_tar_member(ar["data.tar.gz"], f"/packages/{app_id}/packageinfo.json"))
    versions = {
        "app.json": version,
        "manifest": manifest.get("version"),
        "control": control.get("Version"),
        "appinfo.json": appinfo.get("version"),
        "packageinfo.json": packageinfo.get("version"),
    }
    if len(set(versions.values())) != 1:
        fail(f"{slug}: version drift detected: {versions}")
    if control.get("Package") != app_id or appinfo.get("id") != app_id or packageinfo.get("id") != app_id:
        fail(f"{slug}: package identifiers do not match app.json")

    kind = metadata.get("kind")
    branding = metadata.get("branding", {})
    branding_enabled = branding.get("enabled", kind == "upstream-patch")
    if kind == "original":
        if branding_enabled:
            fail(f"{slug}: original app unexpectedly enables patched-app branding")
        icon_metadata = metadata.get("icon")
        if not isinstance(icon_metadata, dict):
            fail(f"{slug}: original app icon metadata is missing")
        expected_size_value = icon_metadata.get("expectedSize")
        source_path_value = icon_metadata.get("sourcePath")
        if not isinstance(expected_size_value, list) or len(expected_size_value) != 2:
            fail(f"{slug}: icon.expectedSize is required")
        if not isinstance(source_path_value, str) or not source_path_value:
            fail(f"{slug}: icon.sourcePath is required")
        expected_size = (int(expected_size_value[0]), int(expected_size_value[1]))
        source_icon_path = metadata_path.parent / source_path_value
        repository_icon_path = REPO / "icons" / f"{slug}.png"
        expected_uri = f"{RAW_BASE}/icons/{slug}.png"
        if manifest.get("iconUri") != expected_uri or feed_package.get("iconUri") != expected_uri:
            fail(f"{slug}: feed/manifest does not reference the original app icon")
        source_icon = image_array(source_icon_path.read_bytes(), f"source icon for {slug}", expected_size)
        repository_icon = image_array(repository_icon_path.read_bytes(), f"repo icon for {slug}", expected_size)
        packaged_icon_name = appinfo.get("icon")
        if not isinstance(packaged_icon_name, str) or not packaged_icon_name:
            fail(f"{slug}: appinfo.json has no icon")
        packaged_icon_data = read_tar_member(ar["data.tar.gz"], f"/applications/{app_id}/{packaged_icon_name}")
        packaged_icon = image_array(packaged_icon_data, f"packaged icon for {slug}", expected_size)
        if not np.array_equal(source_icon, repository_icon) or not np.array_equal(source_icon, packaged_icon):
            fail(f"{slug}: source, packaged, and repository icons are not identical")
    elif branding_enabled:
        expected_size_value = branding.get("expectedSize")
        if not isinstance(expected_size_value, list) or len(expected_size_value) != 2:
            fail(f"{slug}: branding.expectedSize is required")
        expected_size = (int(expected_size_value[0]), int(expected_size_value[1]))
        icon_path = REPO / "icons" / f"{slug}.png"
        if not icon_path.is_file():
            fail(f"{slug}: generated repository icon is missing")
        expected_uri = f"{RAW_BASE}/icons/{slug}.png"
        if manifest.get("iconUri") != expected_uri or feed_package.get("iconUri") != expected_uri:
            fail(f"{slug}: feed/manifest does not reference the generated branded icon")
        repository_icon = image_array(icon_path.read_bytes(), f"repo icon for {slug}", expected_size)
        packaged_icon_name = appinfo.get("icon")
        if not isinstance(packaged_icon_name, str) or not packaged_icon_name:
            fail(f"{slug}: appinfo.json has no icon")
        packaged_icon_data = read_tar_member(
            ar["data.tar.gz"], f"/applications/{app_id}/{packaged_icon_name}"
        )
        packaged_icon = image_array(packaged_icon_data, f"packaged icon for {slug}", expected_size)
        if not np.array_equal(repository_icon, packaged_icon):
            fail(f"{slug}: packaged app icon and HBC icon are not identical")
    elif kind == "upstream-patch":
        expected_uri = metadata["upstream"]["iconUri"]
        if manifest.get("iconUri") != expected_uri or feed_package.get("iconUri") != expected_uri:
            fail(f"{slug}: unbranded icon URL differs from app metadata")
    else:
        fail(f"{slug}: unsupported app kind {kind!r}")

    print(f"validated {slug} {version}: feed, manifest, package, version, and icon are consistent")


def main() -> None:
    feed = json.loads((REPO / "apps.json").read_text(encoding="utf-8"))
    feed_packages = feed.get("packages")
    metadata_paths = sorted(APPS.glob("*/app.json"))
    if not isinstance(feed_packages, list) or len(feed_packages) != len(metadata_paths):
        fail("feed package count does not match apps/*/app.json")
    by_id = {package.get("id"): package for package in feed_packages}
    if len(by_id) != len(feed_packages):
        fail("feed contains duplicate or missing package IDs")
    for metadata_path in metadata_paths:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        feed_package = by_id.get(metadata["id"])
        if not isinstance(feed_package, dict):
            fail(f"feed is missing {metadata['id']}")
        validate_app(metadata_path, feed_package)


if __name__ == "__main__":
    main()
