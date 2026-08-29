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

adblock_path = source / "src" / "adblock.js"
adblock = adblock_path.read_text(encoding="utf-8")
adblock_import = "import { configRead } from './config';\n"
adblock_guard = "  if (!configRead('enableAdBlock')) {\n    return r;\n  }\n\n"
legacy_feed_start = "  // remove ads from home\n"
legacy_feed_end = "  if (Array.isArray(r?.entries)) {\n"
legacy_helper_marker = "\n// Drop `adSlotRenderer`\n"

if adblock.count(adblock_import) != 1 or adblock.count(adblock_guard) != 1:
    raise SystemExit("upstream adblock.js changed; review GTV adblock patch before rebasing")
if adblock.count(legacy_feed_start) != 1 or adblock.count(legacy_feed_end) != 1:
    raise SystemExit("upstream feed-ad block changed; review hardened feed filter before rebasing")
if adblock.count(legacy_helper_marker) != 1:
    raise SystemExit("upstream ad-slot helper changed; review hardened feed filter before rebasing")

adblock = adblock.replace(
    adblock_import,
    adblock_import
    + "import { removeSponsoredFeedAds } from './feed-ad-filter';\n"
    + "import { neutralizeStandaloneAdPlayback } from './ad-playback-state-filter';\n"
    + "import { removeSponsoredPlaybackOverlays } from './playback-overlay-filter';\n",
    1,
)
adblock = adblock.replace(
    adblock_guard,
    adblock_guard
    + "  const removedPlaybackOverlays = removeSponsoredPlaybackOverlays(r);\n"
    + "  if (removedPlaybackOverlays) {\n"
    + "    console.info('[adblock] Removed sponsored playback overlays');\n"
    + "  }\n\n",
    1,
)

feed_start = adblock.index(legacy_feed_start)
feed_end = adblock.index(legacy_feed_end, feed_start)
adblock = (
    adblock[:feed_start]
    + "  const removedFeedAds = removeSponsoredFeedAds(r, arguments[0]);\n"
    + "  if (removedFeedAds) {\n"
    + "    console.info(`[adblock] Removed ${removedFeedAds} sponsored feed renderer(s)`);\n"
    + "  }\n\n"
    + "  const neutralizedAdPlayback = neutralizeStandaloneAdPlayback(r);\n"
    + "  if (neutralizedAdPlayback) {\n"
    + "    console.info('[adblock] Neutralized standalone isAdPlayback=true response');\n"
    + "  }\n\n"
    + adblock[feed_end:]
)

helper_start = adblock.index(legacy_helper_marker)
adblock = adblock[:helper_start].rstrip() + "\n"
adblock_path.write_text(adblock, encoding="utf-8")

# Install the JSON.parse hook before app_api and the rest of the app bootstrap.
# The DEV diagnostics import is placed immediately after adblock so its capture-
# phase blue-key listener is registered before upstream ui.js claims that key.
user_script_path = source / "src" / "userScript.ts"
user_script = user_script_path.read_text(encoding="utf-8")
adblock_user_import = "import './adblock.js';\n"
dev_diagnostics_import = "import './dev-diagnostics.js';\n"
domrect_import = "import './domrect-polyfill';\n"
late_import_pair = "import './app_api/index';\nimport './adblock.js';\n"
if (
    user_script.count(adblock_user_import) != 1
    or user_script.count(domrect_import) != 1
    or user_script.count(late_import_pair) != 1
    or dev_diagnostics_import in user_script
):
    raise SystemExit("upstream userScript.ts import order changed; review early adblock/dev diagnostics patch")
user_script = user_script.replace(
    domrect_import,
    domrect_import + adblock_user_import + dev_diagnostics_import,
    1,
)
user_script = user_script.replace(late_import_pair, "import './app_api/index';\n", 1)
user_script_path.write_text(user_script, encoding="utf-8")

config_path = source / "src" / "config.js"
config = config_path.read_text(encoding="utf-8")
old_description = "desc: 'Remove Shorts from subscriptions'"
new_description = "desc: 'Remove Shorts everywhere'"
if config.count(old_description) != 1:
    raise SystemExit("upstream removeShorts config entry changed; review patch before rebasing")
config_path.write_text(config.replace(old_description, new_description, 1), encoding="utf-8")

shutil.copy2(patches / "shorts.js", source / "src" / "shorts.js")
shutil.copy2(patches / "shorts-filter.js", source / "src" / "shorts-filter.js")
shutil.copy2(patches / "feed-ad-filter.js", source / "src" / "feed-ad-filter.js")
shutil.copy2(patches / "ad-playback-state-filter.js", source / "src" / "ad-playback-state-filter.js")
shutil.copy2(patches / "playback-overlay-filter.js", source / "src" / "playback-overlay-filter.js")
shutil.copy2(patches / "json-stringify.ts", json_stringify_path)
shutil.copy2(patches / "dev-diagnostics.js", source / "src" / "dev-diagnostics.js")

package["version"] = version
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
