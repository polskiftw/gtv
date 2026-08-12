# gtv

webOS homebrew apps.

`gtv` is a monorepo for webOS homebrew applications, including original projects and maintained patches of existing software. Each application is self-contained and carries its own licensing and attribution.

## Repository layout

```text
gtv/
├─ branding/
│  ├─ README.md           # dynamic badge algorithm and typeface provenance
│  └─ requirements.txt    # pinned image-build dependencies
├─ apps/
│  ├─ <app-name>/
│  │  ├─ LICENSE
│  │  ├─ README.md
│  │  ├─ app.json
│  │  ├─ patches/          # patched upstream apps
│  │  └─ src/              # original apps, when applicable
│  └─ ...
├─ repo/
│  ├─ apps.json            # generated Homebrew Channel feed
│  ├─ descriptions/        # generated patched-app details/release notes
│  ├─ icons/               # generated branded HBC icons
│  ├─ manifests/           # generated per-app manifests
│  └─ packages/            # generated IPKs
├─ scripts/
│  ├─ build-repository.py
│  ├─ build-smart-icon.py
│  ├─ smart_badge.py
│  └─ validate-repository.py
├─ .github/
│  └─ workflows/
│     └─ build-repository.yml
└─ README.md
```

## Homebrew Channel

The contents of `repo/` are generated from the applications under `apps/`. The generated `apps.json` feed is intended to be added to Homebrew Channel as an external repository, allowing the apps here to be browsed, installed, and updated from the TV UI with their own titles, descriptions, icons, versions, and requirements.

Generated repository files are build outputs. Application source, patch files, metadata, licensing, and attribution live under `apps/`.

## Patched-app release notes

Every patched upstream application must define structured `changes` metadata and upstream identity in its `app.json`. The repository build turns that metadata into the full description shown on the Homebrew Channel install/update screen.

The standard presentation is intentionally brief:

```text
Added <change>

Fixed <change>

Based on <upstream app name> <upstream version>
```

Release-note entries describe only functional differences from the pinned upstream application: user-visible behavior, reliability, compatibility, correctness, or performance. Repository-only work such as GTV branding, metadata, package-feed changes, CI, tests, build plumbing, documentation, or other maintenance must not appear unless it directly changes the application's runtime behavior.

`Based on ...` links to the original upstream repository. The version on that line is always the actual pinned upstream application version, not GTV's package version. If more than one added or fixed functional change is relevant, each is emitted as its own `Added ...` or `Fixed ...` line. Empty categories are omitted.

## Patched-app versioning

webOS requires application versions to contain exactly three numeric components, and LG explicitly forbids leading zeroes inside those components. Suffixes such as `1.0.0gtv` and a literal installable version such as `1.0.0001` are therefore not valid webOS versions.

GTV conceptually uses `x.x.xyyy`: the upstream patch component is followed by a three-digit GTV revision. `gtvRevision` starts at `1` for each pinned upstream release. The installable third component is the numeric form of:

```text
upstream patch component + zero-padded three-digit GTV revision
```

Equivalently, the build calculates:

```text
(upstream patch version * 1000) + gtvRevision
```

Examples:

```text
upstream 1.0.0 + GTV revision 1 -> conceptual 1.0.0001 -> installable 1.0.1
upstream 1.0.0 + GTV revision 2 -> conceptual 1.0.0002 -> installable 1.0.2
upstream 0.5.3 + GTV revision 1 -> 0.5.3001
upstream 0.5.3 + GTV revision 2 -> 0.5.3002
upstream 0.5.4 + GTV revision 1 -> 0.5.4001
```

This leaves 999 GTV revisions for each pinned upstream version and preserves numeric update ordering. The build derives the expected package version from `upstream.version` and `gtvRevision`; a mismatch fails instead of publishing an incorrectly versioned package.

`apps/<name>/app.json` remains the source of truth for the package metadata. The build applies its version before packaging, then validates it against the IPK control metadata, installed `appinfo.json`, installed `packageinfo.json`, generated manifest, and feed.

## Patched-app branding

Patched applications retain their upstream icons but receive a generated lowercase neon `g` in the Pricedown Black GTA logo typeface in both the installed package and Homebrew Channel listing. Its color is not selected from a fixed palette: the build analyzes the exact source pixels underneath the glyph, optimizes a continuous OKLab color field for local contrast, regularizes neighboring colors into a coherent sign, and renders a colored tube and bloom at high resolution.

The branding pipeline discovers all launcher icon variants declared by the packaged webOS app so Homebrew Channel and the webOS Home screen use consistent GTV branding. Per-app placement, scale, padding, expected dimensions, and canonical source icon paths live in the application's `branding` metadata. The implementation and metadata contract are documented in [`branding/README.md`](branding/README.md).

## Licensing

There is intentionally no blanket license covering every application in this repository.

Each directory under `apps/` contains its own `LICENSE` file. Patched or derived applications preserve and comply with their upstream licenses. Original applications may use their own separately stated licenses, including non-commercial licenses where chosen.

The `LICENSE` file inside an application directory is authoritative for that application.
