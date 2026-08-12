#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


APP = Path(__file__).resolve().parents[1]
SRC = APP / "src"


def main() -> None:
    metadata = json.loads((APP / "app.json").read_text(encoding="utf-8"))
    appinfo = json.loads((SRC / "appinfo.json").read_text(encoding="utf-8"))
    assert metadata["kind"] == "original"
    assert metadata["branding"] == {"enabled": False}
    assert metadata["id"] == appinfo["id"] == "com.gtv.gnews"
    assert metadata["version"] == appinfo["version"]
    assert appinfo["resolution"] == "1920x1080"
    assert appinfo["disableBackHistoryAPI"] is True
    assert appinfo["vendorExtensions"]["allowCrossDomain"] is True
    assert "vendorExtension" not in appinfo
    assert appinfo["trustLevel"] == "netcast"

    html = (SRC / "index.html").read_text(encoding="utf-8")
    assert html.count('class="tile"') == 4
    assert re.findall(r'data-channel="([a-z]+)"', html) == ["abc", "cbs", "nbc", "roar"]
    assert "Stream unavailable" in html
    assert "controls" not in re.search(r"<video[^>]*>", html).group(0)

    css = (SRC / "styles.css").read_text(encoding="utf-8")
    assert "grid-template-columns: repeat(2" in css
    assert "grid-template-rows: repeat(2" in css
    assert "transition:" in css and "transform" in css

    for asset in ("icon.png", "abc.png", "cbs.png", "nbc.png", "roar.png"):
        path = SRC / "assets" / asset
        assert path.is_file() and path.stat().st_size > 0, f"missing {path}"

    print("gnews package contract is complete")


if __name__ == "__main__":
    main()
