# Dynamic `g` branding

Patched applications keep their upstream artwork and receive a lowercase `g` during the repository build. The generated mark has no plate or fixed background: only the font-rendered glyph, its support edge, and its neon bloom are composited onto the source icon.

## Renderer

`scripts/build-smart-icon.py` reads an application's `branding` object and delegates rendering to `scripts/smart_badge.py`.

The renderer:

1. renders a lowercase `g` directly from Pricedown Black, the GTA logo typeface, at four times the final resolution;
2. builds exact glyph, support, and glow masks at the configured placement;
3. samples alpha-aware local neighborhoods under the complete badge footprint;
4. converts those samples to OKLab;
5. searches 60,480 OKLCH starting colors and continuously refines the best result at each control point;
6. applies edge-aware Laplacian regularization across the local color field;
7. blends in a smoothed per-pixel correction so every glyph pixel responds to its own neighborhood;
8. gamut-maps the field without changing its intended hue or lightness;
9. synthesizes a dark support edge, colored bloom, saturated tube, and bright inner core; and
10. downscales with Lanczos while copying untouched source pixels back exactly.

The calculation is deterministic. A missing, modified, invalid, or incorrectly identified font; a missing configured source icon; an unexpected source dimension; or a package/icon validation failure fails the build.

## Application metadata

Patched applications enable the pipeline in `apps/<name>/app.json`:

```json
{
  "branding": {
    "enabled": true,
    "style": "dynamic-g-neon",
    "placement": "bottom-right",
    "scale": 0.3,
    "padding": 0.05,
    "expectedSize": [400, 400],
    "sourceIcons": [
      "assets/icon.png",
      "assets/largeIcon.png"
    ]
  }
}
```

- `enabled` controls whether the build brands the application.
- `style` must be `dynamic-g-neon`.
- `placement` supports `top-left`, `top-right`, `bottom-left`, and `bottom-right`.
- `scale` is the badge size relative to the shorter icon dimension.
- `padding` is the edge inset relative to the shorter icon dimension.
- `expectedSize` makes accidental upstream artwork changes fail loudly.
- `sourceIcons` lists every source-relative icon that must be replaced before packaging. The first also becomes `repo/icons/<slug>.png` for Homebrew Channel.

## Typeface source

The build downloads [Typodermic's official free desktop font bundle](https://typodermicfonts.com/downloads/) and extracts Pricedown Black version 5.200 into the runner's temporary directory. Both the bundle and OTF are pinned by SHA-256 before use; the OTF hash is `19f8cd90ce76992c565debe80d167f58e6e1e79a6e0b86f24bd9dce12052b256`.

Pricedown Black is Copyright 1998–2024 Typodermic Fonts Inc. Typodermic's complimentary desktop license permits creating and distributing static graphics. The font remains temporary build input: it is not committed, modified, embedded in the application, or included in the IPK. Only the finished static PNG icon is published.
