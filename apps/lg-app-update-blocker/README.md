# LG App Update Blocker — GTV patch

A maintained patch of [`dr0dr1dr2dr3/lgappupdateblocker`](https://github.com/dr0dr1dr2dr3/lgappupdateblocker) that adds usable 5-way remote navigation, repairs update-domain persistence across TV reboots, and lets a rooted TV inspect and clear the secondary app-update dependency cache and cached system-firmware update state directly from the app instead of requiring SSH, plus an opt-in launch-gate diagnostic for apps missing from those caches.

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
- Separate inspection and confirmation-gated clearing of `/mnt/lg/cmn_data/var/palm/data/com.webos.appInstallService/updateDependencyInfo` without modifying the original `updateInfo` controls. Contents are shown as escaped, formatted JSON; clearing is disabled for empty, absent, malformed, or non-regular files and preserves array/object JSON root type.
- System firmware update-cache inspection for `/mnt/lg/cmn_data/swupdate/`, including the current `PHASE` value when `Image_Update_Info.xml` contains one.
- Confirmation-gated cleanup of regular files and symlinks directly inside the system update-cache directory. Directories are never recursively removed.
- Firmware-cache controls run through the same elevated Homebrew service as the rest of the app, so no SSH session is required.
- **Live App Launch Diagnostic** reads the installed-app inventory through Homebrew Channel's rooted service, showing the installed version and any reported checkUpdateOnLaunch manifest value. It compares the selected exact app ID against the two known update caches and, where permitted, reads the app's live load status.
- **Launch Without Update Check** is a separate, opt-in action that sends checkUpdateOnLaunch:false to the public webOS TV Application Manager. It does not call the store, approve an update, modify an installed app, clear cache files, or install anything. The launcher request may be ignored or a prompt may originate inside the app itself, so a successful service response is **not** confirmation that an update gate was bypassed.
- The last launch-test response is retained in this application's localStorage for review after switching back from the target app.
- **Fix Original Home Icon** changes only the `checkUpdateOnLaunch` property in the selected *installed Content Store app's* `appinfo.json` to `false`, after saving the previous value to a protected local record. The title, icon, app ID, and Home-screen ordering are unchanged. A **full TV restart is required once** so SAM rereads the changed manifest; turning the TV off into Quick Start+/standby is not sufficient.
- **Restore Original Launch Setting** restores only the saved `checkUpdateOnLaunch` property or its prior absence, leaving all other app manifest settings intact; also requires one full restart. Both actions use atomic temp-file writes and reject symlinks, mismatched app IDs, malformed manifests and non-Content-Store paths.
- The original Home icon override is *not* automatically applied to every app and never runs by itself; only an explicit confirmation for a selected Content Store app makes changes. LG app updates could overwrite the setting. On read-only/system/preinstalled app paths, the feature reports unsupported rather than altering system partitions or restarting SAM automatically.
- A locally adaptive neon `g` on the original icon that identifies the `gtv` build.

The persistence hook is stored under `/var/lib/webosbrew/init.d/` because Homebrew Channel regenerates `/etc/hosts` at boot before running user init hooks. The hook keeps a persistent copy of the packaged domain list under `/var/lib/webosbrew/appupdateblocker/` and reapplies it directly to the freshly generated hosts file. It does not wait for, recurse through, or self-delete based on Luna service availability.

The secondary app-update panel works independently of **Blocked Apps Status**. Only pressing **Clear Dependency Update Info** changes `updateDependencyInfo`. The app does not automatically clear either cache, and the new action never changes `updateInfo`. A full TV restart may be needed before the launcher notices the cleared state. LG services may repopulate the caches when reachable.

The firmware-cache panel intentionally limits deletion to non-directory entries immediately inside `/mnt/lg/cmn_data/swupdate/`. Some webOS models do not expose that directory; on those TVs the panel reports that the cache path is unavailable and does nothing.

## Upstream

- Project: `dr0dr1dr2dr3/lgappupdateblocker`
- Pinned upstream commit: `9e48b292ce8fc7e776feb85763314e66c2061d02`
- Upstream version: `1.0.0`
- Patched version authority: [`app.json`](app.json)
- License: BSD 3-Clause

This directory retains the upstream BSD 3-Clause license. The build workflow fetches the pinned upstream source at build time and applies the files in `patches/`; the upstream source tree is not relicensed or copied wholesale into this repository.


## Troubleshooting apps that still ask to update

1. While the normal app icon refuses to launch, open **Live App Launch Diagnostic**.
2. Choose the app from the paged installed-app list using the TV remote and select **Inspect Update Gate**. This *reads* app metadata and the two existing update caches; it never modifies them.
3. Select **Launch Without Update Check** to try opening the existing app using an explicit checkUpdateOnLaunch:false launch request. This does not approve or perform an update.
4. If the app opens, the normal launcher/update-check path is implicated. If the same prompt persists, its origin may be an in-app check, another webOS service or additional runtime state. Report the outcome and the saved launch response.

An absent cache match is only evidence about updateInfo and updateDependencyInfo, not every possible update gate. checkUpdateOnLaunch is part of the open-source SAM schema but is not documented by LG for this TV public launch API; firmware may ignore it. Inventory and live status calls may fail on some firmware builds and surface their errors instead of pretending success.


## Keep the original Home-screen tile working (no extra launcher)

1. Update LG App Update Blocker to the latest GTV build, open **Live App Launch Diagnostic**, and select the affected Content Store app.
2. Under **Use the Original Home Screen Icon**, press **Fix Original Home Icon**, and confirm. This updates one app manifest property on disk and saves its previous value for recovery. It does **not** approve an LG app update or change the app executable.
3. Use Homebrew Channel's **Reboot** feature to perform **one actual system restart** (not the remote standby button). After startup, launch the app from its **original Home icon**. No family member needs to open LG App Update Blocker.
4. If needed, select the same app and use **Restore Original Launch Setting**, then reboot once. The separate **Launch Without Update Check** manual bypass remains available.

**Limitations:** This uses the documented open-source SAM app-manifest flag, but LG retail firmware may differ. A store app can also replace its appinfo.json in a future reinstall or update. The policy editor deliberately only changes regular app manifests in `/media/cryptofs/apps/usr/palm/applications/`. For system, preinstalled, read-only, or custom directory apps the editor declines to operate rather than risk rewriting firmware files. The new behavior has been tested in CI; its effect on the original icon must be confirmed on the TV.
