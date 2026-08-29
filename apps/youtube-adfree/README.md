# YouTube AdFree

GTV-maintained patch of [`webosbrew/youtube-webos`](https://github.com/webosbrew/youtube-webos), pinned to commit `f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914` (upstream version 0.5.3).

GTV modification date: **2026-08-29**.

The upstream application already provides ad blocking, SponsorBlock, quality controls, and a **Remove Shorts** setting. GTV keeps those features while hardening several response-filtering paths that are brittle in upstream 0.5.3.

## GTV modifications

### Global Shorts removal

When **Remove Shorts** is enabled, GTV removes entries that match current YouTube TV Shorts schemas, including known Shorts shelves/tiles, direct `reelItemRenderer` entries, direct renderer/view-model reel navigation commands, and direct Shorts content/style enums. The same toggle also suppresses Shorts-specific startup behaviours such as `launchToShorts` / `resumeToShorts` entries.

Filtering is performed on parsed Innertube response objects before rendering. A single iterative traversal handles browse, search, subscription/channel grids, shelves, pagination/continuations, and response-action continuation arrays without depending on one page-specific outer path. Direct command envelopes such as `navigationEndpoint.reelWatchEndpoint`, `onSelectCommand.reelWatchEndpoint`, and modern `onTap.innertubeCommand.reelWatchEndpoint` are treated as high-confidence Shorts entries; arbitrary nested metadata references still are not.

Revision 8 moved the Shorts `JSON.parse` hook ahead of `app_api`, beside the already-early adblock hook, closing the fresh-launch response race. Revision 9 broadens the direct-entry classifier specifically to cover newer renderer/view-model forms that can appear mixed into channel video lists while keeping every removal behind the existing **Remove Shorts** setting.

The DEV filter also keeps bounded diagnostics for surviving array entries that contain schema-ish `short`/`reel` clues. Revision 9 scans deeper object-wrapper chains and can report a privacy-safe `url:shorts-path` clue without retaining the URL itself. Titles, tracking values, URLs, tokens, video IDs, and arbitrary payload strings are not retained.

The patch changes the setting description from “Remove Shorts from subscriptions” to “Remove Shorts everywhere.”

### Sponsored feed ad hardening

Upstream 0.5.3 removes Home and Search ads only from a few exact schema paths and recognizes the TV masthead only as an immediate `tvMastheadRenderer` item. GTV replaces that page-specific logic with a marker-gated structural filter covering known masthead, promoted, banner, in-feed, and ad-slot renderer variants. GTV also installs the adblock `JSON.parse` hook before `app_api` to close the fresh-launch timing gap.

### Server-side ad playback suppression

Revision 10 adds a player-level fallback for the launch/Home advertisement observed on hardware after the renderer and request-side investigations failed to stop it. The captured request already contained `playbackContext.contentPlaybackContext.isInlinePlaybackNoAd=true` before GTV touched it, the final serialized request still contained `true`, and no known sponsored feed renderer survived. The nearest player response instead carried `adBreakHeartbeatParams` and `playerConfig.adConfig.sendSsdaiMissingAdBreakReasons`, followed by a tiny response with top-level `isAdPlayback=true`.

Revision 7 had already proven that changing that boolean to `false` does not stop the media. Revision 10 therefore leaves the response untouched and uses the exact top-level `isAdPlayback=true` event only as a high-confidence trigger. While that state is active, GTV briefly hides the YouTube player and attempts to seek the current playable item to its own duration using the player's `seekTo` API. If that API is unavailable, it falls back to setting the nested HTML video element to its duration. All operations are guarded, retried for a short bounded window, and released by a visual fail-safe so a missing player API cannot leave the application permanently hidden.

This is intentionally a DEV candidate until hardware confirms that the TV player exposes the expected seek surface and that the launch ad item ends cleanly.

### DEV on-TV diagnostics

The `dev` branch keeps the same application ID (`youtube.leanback.v4`) and uses version `10690.5.3` / GTV revision 10 so it updates in place over earlier DEV builds.

On the DEV build, the **blue remote button** opens a frozen, full-screen paged diagnostics snapshot. Blue advances one generated page and Back closes it. The normal upstream configuration screen remains on **Green**.

DEV diagnostics v6 includes:

- outbound playback-request candidates detected at `JSON.stringify`, showing only safe key names plus the `isInlinePlaybackNoAd` state before patching, whether the copy-on-write patch ran, the state afterward, and whether the final serialized body actually contained `isInlinePlaybackNoAd=true`
- exact response-side `isAdPlayback` booleans with response shape, nearest player response, and bounded before/after response summaries
- named framework/update `*Entity` payload types with safe allowlisted hints
- response-shape, renderer/view-model, ad/promo signal, large-response, and legacy Home-path inventories
- Shorts filtering totals, Shorts survivor diagnostics, and a Shorts signal inventory

Revision 9 **retired** revision 7's standalone `isAdPlayback=true → false` experiment. Hardware testing showed the ad still played even though that exact 369-character response was intercepted and changed. Revision 10 still does not mutate the boolean; it uses the observed true state as the trigger for the player-level skip described above.

The v6 playback-request diagnostics also resolved the request-side question: on the captured launch ad, `isInlinePlaybackNoAd` was already true before GTV's copy-on-write hook and remained true in the final serialized request. That result is why revision 10 moves downstream to the actual ad-playback item instead of adding another request flag experiment.

DEV branding inverts the completed launcher/Homebrew icon colors so the diagnostic build remains visually distinct.

### Sponsored playback overlay suppression

When the existing **AdBlock** setting is enabled, GTV filters parsed player responses and removes `playerOverlays.playerOverlayRenderer.timelyActionRenderers`, the timed playback-overlay collection used for sponsored QR-code and Shop prompts. There is no separate GTV setting for this behavior.

### Playback JSON hook hardening

Upstream sets `playbackContext.contentPlaybackContext.isInlinePlaybackNoAd = true` on playback requests. GTV preserves that behavior while narrowing the hook to the exact playback-context chain, using copy-on-write cloning, leaving caller-owned objects untouched, preserving replacer behavior, and avoiding cloning unrelated JSON serialization. Revision 9 added diagnostics around this hook without changing its ad-prevention behavior.

## Building

The DEV workflow checks out the pinned upstream commit, applies the files under `patches/`, runs feed-ad, DEV-diagnostics, adblock-integration, Shorts, sponsored-overlay, server-side-ad-skipper, and playback-request/hook regression tests, applies GTV icon branding, builds with the upstream pnpm toolchain, and packages the resulting IPK. Successful DEV builds are automatically promoted into the main Homebrew feed by the separate promotion workflow.

The package keeps the upstream application ID, `youtube.leanback.v4`, so the official YouTube TV application must be uninstalled before installation, matching upstream requirements.

## License

This modified application is distributed under the GNU General Public License v3.0, the same license as upstream. See [`LICENSE`](LICENSE).
