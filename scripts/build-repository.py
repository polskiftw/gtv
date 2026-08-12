#!/usr/bin/env python3
import hashlib
import html
import json
from pathlib import Path

from versioning import derive_gtv_version

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / "apps"
REPO = ROOT / "repo"
PACKAGES = REPO / "packages"
MANIFESTS = REPO / "manifests"
ICONS = REPO / "icons"
DESCRIPTIONS = REPO / "descriptions"
RAW_BASE = "https://raw.githubusercontent.com/polskiftw/gtv/main/repo"

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


packages = []
for metadata_path in sorted(APPS.glob("*/app.json")):
    metadata = json.loads(metadata_path.read_text())
    slug = metadata["slug"]
    ipk = PACKAGES / f"{slug}.ipk"
    if not ipk.exists():
        raise SystemExit(f"missing built package: {ipk.relative_to(ROOT)}")

    if metadata.get("kind") == "upstream-patch":
        expected_version = derive_gtv_version(metadata["upstream"]["version"], metadata["gtvRevision"])
        if metadata["version"] != expected_version:
            raise SystemExit(
                f"{slug}: version {metadata['version']} does not match derived GTV version {expected_version}"
            )
        description_path = DESCRIPTIONS / f"{slug}.html"
        description_path.write_text(build_patch_description(metadata), encoding="utf-8")
        full_description_url = f"{RAW_BASE}/descriptions/{slug}.html"
    else:
        full_description_url = None

    branding = metadata.get("branding", {})
    if branding.get("enabled", metadata.get("kind") == "upstream-patch"):
        icon = ICONS / f"{slug}.png"
        if not icon.is_file() or icon.stat().st_size == 0:
            raise SystemExit(f"missing generated branded icon: {icon.relative_to(ROOT)}")
        icon_uri = f"{RAW_BASE}/icons/{slug}.png"
    else:
        icon_uri = metadata["upstream"]["iconUri"]

    digest = hashlib.sha256(ipk.read_bytes()).hexdigest()
    manifest = {
        "id": metadata["id"],
        "version": metadata["version"],
        "type": "web",
        "title": metadata["title"],
        "appDescription": metadata["description"],
        "iconUri": icon_uri,
        "sourceUrl": metadata["upstream"]["sourceUrl"],
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
