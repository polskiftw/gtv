#!/usr/bin/env python3
import hashlib
import html
import json
import os
import re
from pathlib import Path

from versioning import derive_gtv_version

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / "apps"
REPO = ROOT / "repo"
PACKAGES = REPO / "packages"
MANIFESTS = REPO / "manifests"
ICONS = REPO / "icons"
DESCRIPTIONS = REPO / "descriptions"

# GitHub Actions exposes the checked-out branch as GITHUB_REF_NAME. Keep a
# deterministic main fallback for local builds, while allowing an explicit
# override for tests or non-Actions builders.
REPOSITORY_REF = (
    os.environ.get("GTV_REPOSITORY_REF")
    or os.environ.get("GITHUB_REF_NAME")
    or "main"
)
if not re.fullmatch(r"[A-Za-z0-9._-]+", REPOSITORY_REF):
    raise SystemExit(f"unsupported repository ref for raw URLs: {REPOSITORY_REF!r}")
RAW_BASE = f"https://raw.githubusercontent.com/polskiftw/gtv/{REPOSITORY_REF}/repo"

REPO.mkdir(exist_ok=True)
PACKAGES.mkdir(exist_ok=True)
MANIFESTS.mkdir(exist_ok=True)
ICONS.mkdir(exist_ok=True)
DESCRIPTIONS.mkdir(exist_ok=True)


def build_patch_description(metadata: dict[str, object]) -> str:
    changes = metadata.get("changes")
    upstream = metadata.get("upstream")
    if not isinstance(changes, dict) or not isinstance(upstream, dict):
        raise SystemExit(f"{metadata['slug']}: patched apps require changes and upstream metadata")

    lines: list[str] = []
    change_count = 0
    for key, label in (("added", "Added"), ("fixed", "Fixed")):
        items = changes.get(key, [])
        if not isinstance(items, list) or not all(isinstance(item, str) and item.strip() for item in items):
            raise SystemExit(f"{metadata['slug']}: changes.{key} must be a string list")
        for item in items:
            lines.append(f"<p><strong>{label}</strong> {html.escape(item.strip())}</p>")
            change_count += 1

    if change_count == 0:
        raise SystemExit(f"{metadata['slug']}: patched apps require at least one functional change")

    upstream_name = upstream.get("name")
    upstream_version = upstream.get("version")
    source_url = upstream.get("sourceUrl")
    if not all(isinstance(value, str) and value.strip() for value in (upstream_name, upstream_version, source_url)):
        raise SystemExit(f"{metadata['slug']}: upstream name, version, and sourceUrl are required")
    label = html.escape(f"{upstream_name} {upstream_version}")
    href = html.escape(source_url, quote=True)
    lines.append(f'<p>Based on <a href="{href}">{label}</a></p>')
    return "\n".join(lines) + "\n"


metadata_entries: list[tuple[Path, dict[str, object]]] = []
for metadata_path in sorted(APPS.glob("*/app.json")):
    metadata_entries.append((metadata_path, json.loads(metadata_path.read_text())))

valid_slugs = {str(metadata["slug"]) for _, metadata in metadata_entries}

# Generated repository artifacts should exactly mirror the current app set.
# This prevents removed/retired apps from lingering indefinitely in repo/.
for directory, suffix in (
    (PACKAGES, ".ipk"),
    (MANIFESTS, ".json"),
    (ICONS, ".png"),
    (DESCRIPTIONS, ".html"),
):
    for path in directory.glob(f"*{suffix}"):
        if path.stem not in valid_slugs:
            path.unlink()

packages = []
for metadata_path, metadata in metadata_entries:
    slug = metadata["slug"]
    ipk = PACKAGES / f"{slug}.ipk"
    if not ipk.exists():
        raise SystemExit(f"missing built package: {ipk.relative_to(ROOT)}")

    kind = metadata.get("kind")
    if kind == "upstream-patch":
        expected_version = derive_gtv_version(metadata["upstream"]["version"], metadata["gtvRevision"])
        if metadata["version"] != expected_version:
            raise SystemExit(
                f"{slug}: version {metadata['version']} does not match derived GTV version {expected_version}"
            )
        description_path = DESCRIPTIONS / f"{slug}.html"
        description_path.write_text(build_patch_description(metadata), encoding="utf-8")
        full_description_url = f"{RAW_BASE}/descriptions/{slug}.html"
    elif kind == "original":
        if metadata.get("branding", {}).get("enabled"):
            raise SystemExit(f"{slug}: original apps must not use patched-app branding")
        if not isinstance(metadata.get("sourceUrl"), str) or not metadata["sourceUrl"].strip():
            raise SystemExit(f"{slug}: original apps require sourceUrl")
        icon = ICONS / f"{slug}.png"
        if not icon.is_file() or icon.stat().st_size == 0:
            raise SystemExit(f"missing original app icon: {icon.relative_to(ROOT)}")
        icon_uri = f"{RAW_BASE}/icons/{slug}.png"
        full_description_url = None
    else:
        raise SystemExit(f"{slug}: unsupported app kind {kind!r}")

    if kind == "upstream-patch":
        branding = metadata.get("branding", {})
        if branding.get("enabled", True):
            icon = ICONS / f"{slug}.png"
            if not icon.is_file() or icon.stat().st_size == 0:
                raise SystemExit(f"missing generated branded icon: {icon.relative_to(ROOT)}")
            icon_uri = f"{RAW_BASE}/icons/{slug}.png"
        else:
            icon_uri = metadata["upstream"]["iconUri"]

    if kind != "upstream-patch":
        full_description_url = None

    digest = hashlib.sha256(ipk.read_bytes()).hexdigest()
    manifest = {
        "id": metadata["id"],
        "version": metadata["version"],
        "type": "web",
        "title": metadata["title"],
        "appDescription": metadata["description"],
        "iconUri": icon_uri,
        "sourceUrl": metadata["upstream"]["sourceUrl"] if kind == "upstream-patch" else metadata["sourceUrl"],
        "rootRequired": metadata["rootRequired"],
        "ipkUrl": f"{RAW_BASE}/packages/{slug}.ipk",
        "ipkHash": {"sha256": digest},
        "ipkSize": ipk.stat().st_size,
    }
    manifest_path = MANIFESTS / f"{slug}.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    package = {
        "id": metadata["id"],
        "title": metadata["title"],
        "iconUri": icon_uri,
        "manifestUrl": f"{RAW_BASE}/manifests/{slug}.json",
        "manifest": manifest,
        "pool": "main",
        "requirements": metadata["requirements"],
        "shortDescription": metadata["shortDescription"],
    }
    if full_description_url:
        package["fullDescriptionUrl"] = full_description_url
    packages.append(package)

feed = {
    "paging": {
        "page": 1,
        "count": len(packages),
        "maxPage": 1,
        "itemsTotal": len(packages),
        "prevUrl": None,
        "nextUrl": None,
    },
    "packages": packages,
}
(REPO / "apps.json").write_text(json.dumps(feed, indent=2) + "\n")
