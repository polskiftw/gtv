#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / "apps"
REPO = ROOT / "repo"
PACKAGES = REPO / "packages"
MANIFESTS = REPO / "manifests"
ICONS = REPO / "icons"
RAW_BASE = "https://raw.githubusercontent.com/polskiftw/gtv/main/repo"

REPO.mkdir(exist_ok=True)
PACKAGES.mkdir(exist_ok=True)
MANIFESTS.mkdir(exist_ok=True)
ICONS.mkdir(exist_ok=True)

packages = []
for metadata_path in sorted(APPS.glob("*/app.json")):
    metadata = json.loads(metadata_path.read_text())
    slug = metadata["slug"]
    ipk = PACKAGES / f"{slug}.ipk"
    if not ipk.exists():
        raise SystemExit(f"missing built package: {ipk.relative_to(ROOT)}")

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

    packages.append({
        "id": metadata["id"],
        "title": metadata["title"],
        "iconUri": icon_uri,
        "manifestUrl": f"{RAW_BASE}/manifests/{slug}.json",
        "manifest": manifest,
        "pool": "main",
        "requirements": metadata["requirements"],
        "shortDescription": metadata["shortDescription"],
    })

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
