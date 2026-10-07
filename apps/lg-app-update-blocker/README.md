# LG App Update Blocker — GTV patch

A maintained patch of [`dr0dr1dr2dr3/lgappupdateblocker`](https://github.com/dr0dr1dr2dr3/lgappupdateblocker) that adds usable 5-way remote navigation, repairs update-domain persistence across TV reboots, and lets a rooted TV inspect and clear cached system-firmware update state directly from the app instead of requiring SSH.

## Changes

- D-pad focus navigation.
- OK/Enter activation for focused buttons.
- Visible focus styling.
- Automatic scrolling to the focused control.
- Focus recovery when controls become enabled after service elevation.
- Reboot-safe update-domain persistence using a direct root boot hook instead of an early-boot Luna service call.
- Existing persistence hooks are upgraded in place rather than rejected just because the file already exists.
- Persistence status validates the current hook and its stored domain list instead of checking file existence alone.
- Host removal and status checks use the packaged domain list rather than assuming a particular domain suffix.
- System firmware update-cache inspection for `/mnt/lg/cmn_data/swupdate/`, including the current `PHASE` value when `Image_Update_Info.xml` contains one.
- Confirmation-gated cleanup of regular files and symlinks directly inside the system update-cache directory. Directories are never recursively removed.
- Firmware-cache controls run through the same elevated Homebrew service as the rest of the app, so no SSH session is required.
- A locally adaptive neon `g` on the original icon that identifies the `gtv` build.

The persistence hook is stored under `/var/lib/webosbrew/init.d/` because Homebrew Channel regenerates `/etc/hosts` at boot before running user init hooks. The hook keeps a persistent copy of the packaged domain list under `/var/lib/webosbrew/appupdateblocker/` and reapplies it directly to the freshly generated hosts file. It does not wait for, recurse through, or self-delete based on Luna service availability.

The firmware-cache panel intentionally limits deletion to non-directory entries immediately inside `/mnt/lg/cmn_data/swupdate/`. Some webOS models do not expose that directory; on those TVs the panel reports that the cache path is unavailable and does nothing.

## Upstream

- Project: `dr0dr1dr2dr3/lgappupdateblocker`
- Pinned upstream commit: `9e48b292ce8fc7e776feb85763314e66c2061d02`
- Upstream version: `1.0.0`
- Patched version authority: [`app.json`](app.json)
- License: BSD 3-Clause

This directory retains the upstream BSD 3-Clause license. The build workflow fetches the pinned upstream source at build time and applies the files in `patches/`; the upstream source tree is not relicensed or copied wholesale into this repository.
