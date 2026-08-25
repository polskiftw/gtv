# gtv

webOS homebrew apps.

`gtv` is a monorepo for maintained webOS homebrew patches. Each application is self-contained and carries its own licensing and attribution.

Current applications are maintained GTV patches of LG App Update Blocker and YouTube AdFree.

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
│  │  └─ patches/
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
│     ├─ build-lg-app-update-blocker.yml
│     └─ promote-youtube-dev.yml
└─ README.md
```

The old repo-wide build workflow has been retired. Application work is intentionally scoped so an LG App Update Blocker change does not build or test YouTube, and YouTube DEV promotion does not rebuild unrelated applications.

## Homebrew Channel

The contents of `repo/` are generated from the applications under `apps/`. The generated `apps.json` feed is intended to be added to Homebrew Channel as an external repository, allowing the apps here to be browsed, installed, and updated from the TV UI with their own titles, descriptions, icons, versions, and requirements.

Generated repository files are build outputs. Application source, patch files, metadata, licensing, and attribution live under `apps/`.

`build-repository.py` also prunes generated package, manifest, icon, and description files whose application no longer exists, so retired apps do not linger in the published repository.

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

Patched GTV builds use a deliberately simple webOS-safe package version. The upstream version remains directly visible in the numeric tail, while the package major carries a `69` marker and, only when needed, a GTV-only revision prefix.

A fresh GTV baseline is:

```text
69<upstream major>.<upstream minor>.<upstream patch>
```

Examples:

```text
upstream 1.0.0 -> 691.0.0
upstream 0.5.3 -> 690.5.3
```

`gtvRevision` starts at `0`. It changes only when GTV adds or fixes downstream application behavior. Revision `0` has no extra prefix; revision `1` prepends `1`, revision `2` prepends `2`, and so on:

```text
upstream 1.0.0, GTV revision 0 -> 691.0.0
upstream 1.0.0, GTV revision 1 -> 1691.0.0
upstream 1.0.0, GTV revision 2 -> 2691.0.0
```

An upstream-only update does not change `gtvRevision`; only the upstream portion moves:

```text
691.0.0 -> 691.0.1
1691.0.0 -> 1691.0.1
```

If GTV behavior and upstream both change in the same release, both portions move. The `69` marker itself is not a user-facing release label; Homebrew Channel release notes remain the human-facing record of what GTV added or fixed and which upstream version the package is based on.

The build derives the expected package version from `upstream.version` and `gtvRevision`; a mismatch fails instead of publishing an incorrectly versioned package. `apps/<name>/app.json` remains the source of truth for package metadata. The build applies its version before packaging, then validates it against the IPK control metadata, installed `appinfo.json`, installed `packageinfo.json`, generated manifest, and feed.

## Patched-app branding

Patched applications retain their upstream icons but receive a generated lowercase neon `g` in the Pricedown Black GTA logo typeface in both the installed package and Homebrew Channel listing. Its color is not selected from a fixed palette: the build analyzes the exact source pixels underneath the glyph, optimizes a continuous OKLab color field for local contrast, regularizes neighboring colors into a coherent sign, and renders a colored tube and bloom at high resolution.

The branding pipeline discovers all launcher icon variants declared by the packaged webOS app so Homebrew Channel and the webOS Home screen use consistent GTV branding. Per-app placement, scale, padding, expected dimensions, and canonical source icon paths live in the application's `branding` metadata. The implementation and metadata contract are documented in [`branding/README.md`](branding/README.md).

## Licensing

There is intentionally no blanket license covering every application in this repository.

Every directory under `apps/` must contain a `LICENSE` file with the complete applicable license text stored locally in the repository. Link-only license stubs or files that merely say the license is available elsewhere are not accepted.

Patched or derived applications preserve and comply with their upstream licenses, including the full license text and notices from the pinned upstream source.

The `LICENSE` file inside an application directory is authoritative for that application.
