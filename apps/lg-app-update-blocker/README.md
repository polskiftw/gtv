# LG App Update Blocker — remote navigation patch

A maintained patch of [`dr0dr1dr2dr3/lgappupdateblocker`](https://github.com/dr0dr1dr2dr3/lgappupdateblocker) that adds usable 5-way remote navigation to the application's TV interface.

## Changes

- D-pad focus navigation.
- OK/Enter activation for focused buttons.
- Visible focus styling.
- Automatic scrolling to the focused control.
- Focus recovery when controls become enabled after service elevation.
- A locally adaptive neon `g` on the original icon that identifies the `gtv` build.

The blocking service behavior is unchanged.

## Upstream

- Project: `dr0dr1dr2dr3/lgappupdateblocker`
- Pinned upstream commit: `9e48b292ce8fc7e776feb85763314e66c2061d02`
- Upstream version: `1.0.0`
- Patched version authority: [`app.json`](app.json)
- License: BSD 3-Clause

This directory retains the upstream BSD 3-Clause license. The build workflow fetches the pinned upstream source at build time and applies the files in `patches/`; the upstream source tree is not relicensed or copied wholesale into this repository.
