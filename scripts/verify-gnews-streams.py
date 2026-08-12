#!/usr/bin/env python3
"""Verify gnews's four public source paths without logging ephemeral URL tokens."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


SOURCES = {
    "ABC": "https://video.abc57.com/live/wbnd/live2/live2.m3u8",
    "CBS": "https://dai.google.com/linear/hls/event/kv2Ka1pgQUWzWHpBmOkQiA/master.m3u8",
    "ROAR": "https://fast-channels.sinclairstoryline.com/TBD/index.m3u8",
}
WNDU_RESOLVER = "https://zeam.com/api/services/StreamInfo?stationId=12772"


def fetch(url: str, limit: int = 512 * 1024, byte_range: bool = False) -> bytes:
    headers = {"User-Agent": "gtv-gnews-source-check/1.0"}
    if byte_range:
        headers["Range"] = "bytes=0-4095"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status not in (200, 206):
            raise RuntimeError(f"HTTP {response.status}")
        return response.read(limit)


def verify_hls(label: str, url: str) -> None:
    playlist = fetch(url).decode("utf-8", errors="replace")
    if not playlist.lstrip().startswith("#EXTM3U"):
        raise RuntimeError(f"{label}: response is not an HLS playlist")
    if "#EXT-X-STREAM-INF" in playlist:
        lines = [line.strip() for line in playlist.splitlines() if line.strip()]
        variant = next(
            (lines[index + 1] for index, line in enumerate(lines[:-1]) if line.startswith("#EXT-X-STREAM-INF")),
            None,
        )
        if not variant or variant.startswith("#"):
            raise RuntimeError(f"{label}: master playlist has no variant URL")
        media_url = urllib.parse.urljoin(url, variant)
        media_playlist = fetch(media_url).decode("utf-8", errors="replace")
    else:
        media_url = url
        media_playlist = playlist
    if "#EXTINF" not in media_playlist:
        raise RuntimeError(f"{label}: HLS playlist has no playable entries")
    segment = next(
        (line.strip() for line in media_playlist.splitlines() if line.strip() and not line.startswith("#")),
        None,
    )
    if not segment:
        raise RuntimeError(f"{label}: media playlist has no segment URL")
    segment_bytes = fetch(urllib.parse.urljoin(media_url, segment), limit=4096, byte_range=True)
    if len(segment_bytes) < 188:
        raise RuntimeError(f"{label}: first media segment is unexpectedly short")
    print(f"{label}: public HLS playlist and media verified")


def main() -> None:
    for label, url in SOURCES.items():
        verify_hls(label, url)
    resolved = json.loads(fetch(WNDU_RESOLVER))
    stream_url = resolved.get("streamUrl")
    if not isinstance(stream_url, str) or not stream_url.startswith("https://") or ".m3u8" not in stream_url:
        raise RuntimeError("NBC: public WNDU resolver did not return an HLS URL")
    verify_hls("NBC", stream_url)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, urllib.error.URLError) as error:
        raise SystemExit(f"gnews source verification failed: {error}") from error
