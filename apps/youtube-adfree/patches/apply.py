#!/usr/bin/env python3
import json
import shutil
import sys
from pathlib import Path

if len(sys.argv) != 4:
    raise SystemExit("usage: apply.py <upstream-source> <patch-directory> <app-metadata>")

source = Path(sys.argv[1]).resolve()
patches = Path(sys.argv[2]).resolve()
metadata_path = Path(sys.argv[3]).resolve()
metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
version = metadata["version"]
upstream_version = metadata["upstream"]["version"]

package_path = source / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
if package.get("version") != upstream_version:
    raise SystemExit(
        f"unexpected upstream package version: {package.get('version')!r}; expected {upstream_version!r}"
    )

upstream_shorts = (source / "src" / "shorts.js").read_text(encoding="utf-8")
required_markers = (
    "TVHTML5_SHELF_RENDERER_TYPE_SHORTS",
    "reelWatchEndpoint",
    "findFirstObject",
)
for marker in required_markers:
    if marker not in upstream_shorts:
        raise SystemExit(f"upstream shorts.js no longer has expected marker: {marker}")

json_stringify_path = source / "src" / "hooks" / "json-stringify.ts"
upstream_json_stringify = json_stringify_path.read_text(encoding="utf-8")
json_stringify_markers = (
    "structuredClone(value)",
    "contentPlaybackContext",
    "isInlinePlaybackNoAd",
)
for marker in json_stringify_markers:
    if marker not in upstream_json_stringify:
        raise SystemExit(
            f"upstream json-stringify.ts no longer has expected marker: {marker}"
        )

config_path = source / "src" / "config.js"
config = config_path.read_text(encoding="utf-8")
old_description = "desc: 'Remove Shorts from subscriptions'"
new_description = "desc: 'Remove Shorts everywhere'"
if config.count(old_description) != 1:
    raise SystemExit("upstream removeShorts config entry changed; review patch before rebasing")
config_path.write_text(config.replace(old_description, new_description, 1), encoding="utf-8")

shutil.copy2(patches / "shorts.js", source / "src" / "shorts.js")
shutil.copy2(patches / "shorts-filter.js", source / "src" / "shorts-filter.js")
shutil.copy2(patches / "json-stringify.ts", json_stringify_path)

package["version"] = version
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
