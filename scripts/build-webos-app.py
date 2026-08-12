#!/usr/bin/env python3
"""Build a deterministic webOS IPK from an original application's source tree."""

from __future__ import annotations

import argparse
import gzip
import io
import json
import tarfile
from pathlib import Path


def tar_gz(entries: list[tuple[str, bytes | None, int]]) -> bytes:
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.GNU_FORMAT) as archive:
        for name, data, mode in entries:
            info = tarfile.TarInfo(name)
            info.mtime = 0
            info.uid = 0
            info.gid = 0
            info.uname = "root"
            info.gname = "root"
            info.mode = mode
            if data is None:
                info.type = tarfile.DIRTYPE
                info.size = 0
                archive.addfile(info)
            else:
                info.type = tarfile.REGTYPE
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb", compresslevel=9, mtime=0) as output:
        output.write(raw.getvalue())
    return compressed.getvalue()


def ar_member(name: str, data: bytes) -> bytes:
    encoded_name = (name + "/").encode("ascii")
    header = (
        encoded_name.ljust(16, b" ")
        + b"0".ljust(12, b" ")
        + b"0".ljust(6, b" ")
        + b"0".ljust(6, b" ")
        + b"100644".ljust(8, b" ")
        + str(len(data)).encode("ascii").ljust(10, b" ")
        + b"`\n"
    )
    return header + data + (b"\n" if len(data) % 2 else b"")


def collect_source(source: Path, app_id: str) -> list[tuple[str, bytes | None, int]]:
    app_root = f"usr/palm/applications/{app_id}"
    package_root = f"usr/palm/packages/{app_id}"
    entries: list[tuple[str, bytes | None, int]] = []
    directories = [
        "usr",
        "usr/palm",
        "usr/palm/applications",
        app_root,
        "usr/palm/packages",
        package_root,
    ]
    for directory in directories:
        entries.append((directory + "/", None, 0o755))

    source_directories = sorted(path for path in source.rglob("*") if path.is_dir())
    for directory in source_directories:
        entries.append((f"{app_root}/{directory.relative_to(source).as_posix()}/", None, 0o755))
    for path in sorted(path for path in source.rglob("*") if path.is_file()):
        relative = path.relative_to(source).as_posix()
        entries.append((f"{app_root}/{relative}", path.read_bytes(), 0o644))
    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
    if metadata.get("kind") != "original":
        raise SystemExit("build-webos-app.py only packages original applications")
    app_id = metadata["id"]
    version = metadata["version"]
    appinfo_path = args.source / "appinfo.json"
    appinfo = json.loads(appinfo_path.read_text(encoding="utf-8"))
    if appinfo.get("id") != app_id or appinfo.get("version") != version:
        raise SystemExit("appinfo.json id/version does not match app metadata")

    source_entries = collect_source(args.source, app_id)
    packageinfo = json.dumps(
        {"id": app_id, "version": version, "app": app_id, "services": []},
        indent=2,
    ).encode("utf-8") + b"\n"
    source_entries.append((f"usr/palm/packages/{app_id}/packageinfo.json", packageinfo, 0o644))
    data_archive = tar_gz(source_entries)

    installed_size = sum(len(data) for _, data, _ in source_entries if data is not None)
    control = (
        f"Package: {app_id}\n"
        f"Version: {version}\n"
        "Section: misc\n"
        "Priority: optional\n"
        "Architecture: all\n"
        f"Installed-Size: {installed_size}\n"
        "Maintainer: GTV <nobody@example.com>\n"
        f"Description: {metadata['description']}\n"
        "webOS-Package-Format-Version: 2\n"
        "webOS-Packager-Version: gtv\n"
    ).encode("utf-8")
    control_archive = tar_gz([("control", control, 0o644)])
    package = (
        b"!<arch>\n"
        + ar_member("debian-binary", b"2.0\n")
        + ar_member("control.tar.gz", control_archive)
        + ar_member("data.tar.gz", data_archive)
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(package)
    print(args.output)


if __name__ == "__main__":
    main()
