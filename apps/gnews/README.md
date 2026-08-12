# gnews

`gnews` is an original webOS TV application that reduces local live television to four large remote-friendly tiles: ABC57, WSBT 22, WNDU 16 News Now, and ROAR.

The application intentionally has no settings, source picker, guide, toolbar, or playback controls. Arrow keys move through the 2×2 grid, OK starts the selected stream, and Back stops playback and restores focus to the same tile. A failed source displays only `Stream unavailable`.

## Sources

- ABC uses ABC57's public WBND live HLS feed. ABC57 publishes this scheduled feed on its official live page; it can be off-air between live newscasts, in which case the app reaches the normal `Stream unavailable` state.
- CBS uses the clean public WSBT distribution HLS feed published by Sinclair's Watch page, avoiding the separate Google DAI playback session that is not reliable in webOS's native player. WSBT sends black video outside some scheduled live windows; this originates upstream and is visible in every public WSBT route.
- NBC resolves the public WNDU 16 News Now channel through Zeam immediately before playback because that distributor issues short-lived HLS URLs.
- ROAR uses Sinclair's public ROAR HLS feed; its `/TBD/` path is retained from the channel's former name.

Each tile has exactly one source. The app does not switch providers or attempt fallback streams.

## Version history

- `1.0.2` resolves WNDU with webOS's legacy cross-domain request path and declares both cross-domain metadata variants used across webOS releases.
- `1.0.1` corrects the webOS cross-domain metadata used by WNDU's runtime resolver and moves WSBT playback from its Google DAI session to the direct public distribution feed.
- `1.0.0` is the initial release.

## Artwork

`assets/generate.py` deterministically renders the launcher icon and four opaque tile PNGs from Typodermic's Pricedown Black typeface. The same pinned, hash-verified temporary font used by the GTV branding pipeline is supplied at build time. The font is not embedded in the app or repository; only the generated static PNGs are distributed.

## Development

Run the focused tests from the repository root:

```sh
node --test apps/gnews/tests/*.mjs
python3 apps/gnews/tests/test-package-contract.py
```

Generate assets and build an IPK:

```sh
python3 scripts/prepare-branding-font.py --output /tmp/gtv-fonts/pricedown.otf
python3 apps/gnews/assets/generate.py --font /tmp/gtv-fonts/pricedown.otf --output apps/gnews/src/assets
python3 scripts/build-webos-app.py --metadata apps/gnews/app.json --source apps/gnews/src --output repo/packages/gnews.ipk
```
