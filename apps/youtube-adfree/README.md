# YouTube AdFree

GTV-maintained patch of [`webosbrew/youtube-webos`](https://github.com/webosbrew/youtube-webos), pinned to commit `f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914` (upstream version 0.5.3).

GTV modification date: **2026-08-11**.

The upstream application already provides ad blocking, SponsorBlock, quality controls, and a **Remove Shorts** setting. Upstream Shorts removal is scoped primarily to Subscription-tab renderer shapes. This patch keeps the existing setting and extends its behavior across YouTube TV content responses.

## GTV modification

When **Remove Shorts** is enabled, GTV removes entries that match current YouTube TV Shorts schemas:

- `TVHTML5_SHELF_RENDERER_TYPE_SHORTS` shelves
- `TILE_STYLE_YTLR_SHORTS` tiles
- `TILE_CONTENT_TYPE_SHORTS` entries or tiles
- entries or tiles whose direct selection command contains `reelWatchEndpoint`
- `reelItemRenderer` entries

Filtering is performed on parsed Innertube response objects before rendering. A single iterative traversal handles browse, search, subscription grids, shelves, pagination/continuations, and response-action continuation arrays without depending on one page-specific outer path. Only direct item/shelf signatures are removed; nested metadata references are not treated as proof that the containing item is a Short.

The patch also changes the setting description from “Remove Shorts from subscriptions” to “Remove Shorts everywhere.”

## Building

The repository workflow checks out the pinned upstream commit, applies the files under `patches/`, runs the Shorts schema regression test, applies GTV icon branding, builds with the upstream pnpm toolchain, and packages the resulting IPK.

The package keeps the upstream application ID, `youtube.leanback.v4`, so the official YouTube TV application must be uninstalled before installation, matching upstream requirements.

## License

This modified application is distributed under the GNU General Public License v3.0, the same license as upstream. See [`LICENSE`](LICENSE).
