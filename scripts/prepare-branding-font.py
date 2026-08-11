#!/usr/bin/env python3
"""Fetch and verify the transient Pricedown Black build dependency."""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


ARCHIVE_URL = "https://typodermicfonts.com/wp-content/uploads/2026/08/typodermic-free-fonts-2026g.zip"
ARCHIVE_SHA256 = "8998923f5ca62b2587df7124daec34fdd0c14dca460222167efa924f6a72d974"
FONT_MEMBER = "Pricedown Bl.otf"
FONT_SHA256 = "19f8cd90ce76992c565debe80d167f58e6e1e79a6e0b86f24bd9dce12052b256"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download_archive() -> bytes:
    request = urllib.request.Request(
        ARCHIVE_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; gtv deterministic icon builder)",
            "Referer": "https://typodermicfonts.com/downloads/",
        },
    )
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read()
            digest = sha256(data)
            if digest != ARCHIVE_SHA256:
                raise RuntimeError(f"unexpected Typodermic archive hash: {digest}")
            return data
        except (OSError, urllib.error.URLError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(2**attempt)
    raise RuntimeError(f"could not download pinned Typodermic font archive: {last_error}")


def extract_font(archive: bytes) -> bytes:
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            members = [name for name in bundle.namelist() if name == FONT_MEMBER]
            if members != [FONT_MEMBER]:
                raise RuntimeError(f"expected exactly one {FONT_MEMBER!r} in Typodermic archive")
            font = bundle.read(FONT_MEMBER)
    except zipfile.BadZipFile as error:
        raise RuntimeError("pinned Typodermic archive is not a valid ZIP") from error
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
