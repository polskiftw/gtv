#!/usr/bin/env python3
"""Verify gnews's four public source paths without logging ephemeral URL tokens."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


SOURCES = {
    "ABC": "https://video.abc57.com/live/wbnd/live2/live2.m3u8",
    "CBS": "https://d368mt9otn5oix.cloudfront.net/out/v1/a195f1f4df3e46d6a6a2cd33795896b1/index.m3u8",
    "ROAR": "https://fast-channels.sinclairstoryline.com/TBD/index.m3u8",
}
ABC_PUBLISHER_PAGE = "https://www.abc57.com/stream/live-stream"
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


def verify_hls(label: str, url: str, playlist_bytes: bytes | None = None) -> None:
    playlist = (playlist_bytes if playlist_bytes is not None else fetch(url)).decode(
        "utf-8", errors="replace"
    )
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


def verify_abc() -> None:
    """Verify ABC57 while allowing its published feed to be off-air between newscasts."""
    url = SOURCES["ABC"]
    publisher_page = fetch(ABC_PUBLISHER_PAGE).decode("utf-8", errors="replace")
    if url not in publisher_page:
        raise RuntimeError("ABC: ABC57 no longer publishes the configured HLS endpoint")
    try:
        playlist_bytes = fetch(url)
    except urllib.error.HTTPError as error:
        if error.code not in (404, 410):
            raise
        print("ABC: official HLS endpoint published; currently off-air")
        return
    verify_hls("ABC", url, playlist_bytes)


def main() -> None:
    verify_abc()
    for label, url in SOURCES.items():
        if label == "ABC":
            continue
        verify_hls(label, url)
    resolved = json.loads(fetch(WNDU_RESOLVER))
    stream_url = resolved.get("streamUrl")
    if not isinstance(stream_url, str) or not stream_url.startswith("https://") or ".m3u8" not in stream_url:
        raise RuntimeError("NBC: public WNDU resolver did not return an HLS URL")
    verify_hls("NBC", stream_url)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, urllib.error.URLError) as error:
        raise SystemExit(f"gnews source verification failed: {error}") from error
