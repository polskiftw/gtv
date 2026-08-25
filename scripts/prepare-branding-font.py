#!/usr/bin/env python3
"""Fetch and verify the transient Pricedown Black build dependency."""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path


DOWNLOADS_URL = "https://typodermicfonts.com/downloads/"
ARCHIVE_URL = "https://typodermicfonts.com/assets/downloads/typodermic-free-fonts-2026h.zip"
FONT_MEMBER = "Pricedown Bl.otf"
FONT_SHA256 = "19f8cd90ce76992c565debe80d167f58e6e1e79a6e0b86f24bd9dce12052b256"
ARCHIVE_LINK_RE = re.compile(
    r'href=["\']([^"\']*typodermic-free-fonts-[0-9]+[a-z]\.zip)["\']',
    re.IGNORECASE,
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def request_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; gtv deterministic icon builder)",
            "Referer": DOWNLOADS_URL,
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def discover_current_archive_url() -> str:
    page = request_bytes(DOWNLOADS_URL).decode("utf-8", errors="replace")
    match = ARCHIVE_LINK_RE.search(page)
    if not match:
        raise RuntimeError("could not discover current Typodermic free-font archive URL")
    return urllib.parse.urljoin(DOWNLOADS_URL, match.group(1))


def download_archive() -> bytes:
    last_error: Exception | None = None
    urls = [ARCHIVE_URL]

    for attempt in range(3):
        try:
            url = urls[-1]
            return request_bytes(url)
        except (OSError, urllib.error.URLError) as error:
            last_error = error
            if attempt == 0:
                try:
                    discovered = discover_current_archive_url()
                    if discovered not in urls:
                        urls.append(discovered)
                except (OSError, urllib.error.URLError, RuntimeError) as discovery_error:
                    last_error = discovery_error
            if attempt < 2:
                time.sleep(2**attempt)

    raise RuntimeError(f"could not download Typodermic font archive: {last_error}")


def extract_font(archive: bytes) -> bytes:
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            members = [name for name in bundle.namelist() if name == FONT_MEMBER]
            if members != [FONT_MEMBER]:
                raise RuntimeError(f"expected exactly one {FONT_MEMBER!r} in Typodermic archive")
            font = bundle.read(FONT_MEMBER)
    except zipfile.BadZipFile as error:
        raise RuntimeError("Typodermic archive is not a valid ZIP") from error

    # The archive filename/version is allowed to move; the actual font bytes are
    # still pinned so a changed upstream font cannot silently alter GTV artwork.
    digest = sha256(font)
    if digest != FONT_SHA256:
        raise RuntimeError(f"unexpected Pricedown Black font hash: {digest}")
    return font


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    if args.output.is_file() and sha256(args.output.read_bytes()) == FONT_SHA256:
        print(args.output)
        return

    font = extract_font(download_archive())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_name(f".{args.output.name}.{os.getpid()}.tmp")
    temporary.write_bytes(font)
    os.replace(temporary, args.output)
    print(args.output)


if __name__ == "__main__":
    main()
