# YouTube AdFree

GTV-maintained patch of [`webosbrew/youtube-webos`](https://github.com/webosbrew/youtube-webos), pinned to commit `f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914` (upstream version 0.5.3).

GTV modification date: **2026-08-29**.

The upstream application already provides ad blocking, SponsorBlock, quality controls, and a **Remove Shorts** setting. GTV keeps those features while hardening several response-filtering paths that are brittle in upstream 0.5.3.

## GTV modifications

### Global Shorts removal

When **Remove Shorts** is enabled, GTV removes entries that match current YouTube TV Shorts schemas:

- `TVHTML5_SHELF_RENDERER_TYPE_SHORTS` shelves
- `TILE_STYLE_YTLR_SHORTS` tiles
- `TILE_CONTENT_TYPE_SHORTS` entries or tiles
- entries or tiles whose direct selection command contains `reelWatchEndpoint`
- `reelItemRenderer` entries

Filtering is performed on parsed Innertube response objects before rendering. A single iterative traversal handles browse, search, subscription grids, shelves, pagination/continuations, and response-action continuation arrays without depending on one page-specific outer path. Only direct item/shelf signatures are removed; nested metadata references are not treated as proof that the containing item is a Short.

The patch also changes the setting description from “Remove Shorts from subscriptions” to “Remove Shorts everywhere.”

### Sponsored feed ad hardening

Upstream 0.5.3 removes Home and Search ads only from a few exact schema paths and recognizes the TV masthead only as an immediate `tvMastheadRenderer` item. That can miss ads when YouTube changes response wrappers, inserts promotional items through continuations/actions, or delivers the initial Home response before the adblock hook is installed.

When **AdBlock** is enabled, GTV replaces that page-specific logic with a marker-gated structural filter. It recognizes the upstream TV renderers plus known masthead and promoted-content variants such as `videoMastheadAdV3Renderer`, `videoMastheadAdRenderer`, `videoMastheadAdRendererBetaPreview`, `bannerPromoRenderer`, `inFeedAdLayoutRenderer`, promoted video renderers, and branded video promo renderers.

The structural walk is bounded and only runs when the serialized JSON contains a known sponsored renderer marker. Array items are checked through object-only wrapper chains, but detection intentionally stops at nested arrays so one sponsored child does not cause an otherwise valid shelf or section to be deleted. Ads inside those child collections are filtered individually instead.

GTV also moves the adblock module ahead of `app_api` during userscript initialization. This installs the `JSON.parse` hook earlier and closes the fresh-launch timing gap reported in the webOS YouTube fork family, where a sponsored first item could appear on initial app load but disappear after a refresh.

### DEV on-TV diagnostics and revision 7 experiment

The `dev` branch keeps the same application ID (`youtube.leanback.v4`) and uses the higher GTV version `7690.5.3`, allowing it to replace the previous diagnostic build as an update.

On the DEV build, the **blue remote button** opens a frozen, full-screen paged diagnostics snapshot. Blue advances exactly one generated page and Back closes it. The report is deliberately sized for photographing one screen at a time.

DEV diagnostics v4 captures the ad flow observed on a real TV:

- every exact `isAdPlayback` boolean is pinned with its **true/false value**, object path, top-level response shape, nearest previously observed player response, and a bounded set of responses immediately before and after it
- framework/update `payload` objects are inspected only for named `*Entity` children such as `qrCodeEntity`; the report records the entity type/path and safe allowlisted hints such as `style`
- entity events are associated with the most recent `isAdPlayback` event to help reconstruct delayed interactive ad UI such as QR-code side sheets
- the broad renderer/view-model inventory, response-shape counts, large/recent response profiles, notable arrays, and legacy Home-path clues remain available
- ad/promo signal matching tokenizes camel-case names, so unrelated keys such as `payload`, `dynamicReadaheadConfig`, `readAheadGrowthRateMs`, and `adaptiveFormats` do not appear merely because their spelling contains the letters `ad`

Revision 7 adds a deliberately narrow active experiment based on two independent real-TV captures. When **AdBlock** is enabled, if a parsed response has exactly the three top-level keys `responseContext`, `trackingParams`, and `isAdPlayback`, and `isAdPlayback` is `true`, GTV changes only that boolean to `false`. The response envelope is otherwise preserved. The diagnostics observer runs before this neutralizer so the original `true` event remains visible in the report.

The neutralizer intentionally does **not** touch normal player responses, nested `isAdPlayback` fields, already-false state notifications, incomplete envelopes, or objects with any additional top-level fields. This is an experimental DEV-only response to the exact compact 369-character schema captured twice on hardware, rather than another broad renderer heuristic.

Tracking params, continuation tokens, visitor/auth data, cookies, URLs, signatures, and arbitrary payload strings are not retained by diagnostics.

Because upstream uses Blue for Audio-Only mode, the DEV build intentionally takes over that key before upstream `ui.js` receives it. The normal upstream configuration screen remains on Green.

DEV branding also inverts the RGB colors of the completed branded launcher icons and Homebrew Channel icon while preserving alpha, making the diagnostic build visually distinct from the release build.

### Sponsored playback overlay suppression

Upstream 0.5.3 already sets `playbackContext.contentPlaybackContext.isInlinePlaybackNoAd` on playback requests, so GTV does not treat that request flag as the QR/Shop filter.

When the existing **AdBlock** setting is enabled, GTV additionally filters parsed player responses and removes `playerOverlays.playerOverlayRenderer.timelyActionRenderers`, the timed playback-overlay collection used for sponsored QR-code and Shop prompts. The filter handles both the normal top-level player response and the known `playerResponse` wrapper. It intentionally does not recursively search arbitrary response objects, and it leaves sibling player-overlay data untouched.

There is no separate GTV setting for this behavior; it is part of the existing AdBlock path.

### Playback JSON hook hardening

Upstream's playback hook deep-clones every non-primitive value passed to `JSON.stringify` before applying `isInlinePlaybackNoAd`. GTV preserves the same request-side flag behavior but narrows the hook to the exact playback-context chain, uses copy-on-write cloning only when the flag needs to change, leaves caller-owned objects untouched, preserves replacer behavior, and avoids cloning unrelated JSON serialization entirely.

This hook is independent of the QR/Shop response filter above.

## Building

The DEV workflow checks out the pinned upstream commit, applies the files under `patches/`, runs the feed-ad, DEV-diagnostics, standalone ad-playback-state, adblock-integration, Shorts, sponsored-overlay, and playback-hook regression tests, applies GTV icon branding, builds with the upstream pnpm toolchain, and packages the resulting IPK. Successful DEV builds are automatically promoted into the main Homebrew feed by the separate promotion workflow.

The package keeps the upstream application ID, `youtube.leanback.v4`, so the official YouTube TV application must be uninstalled before installation, matching upstream requirements.

## License

This modified application is distributed under the GNU General Public License v3.0, the same license as upstream. See [`LICENSE`](LICENSE).
