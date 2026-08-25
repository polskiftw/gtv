# gtv

webOS homebrew apps.

`gtv` is a monorepo for maintained webOS homebrew patches. Each application is self-contained and carries its own licensing and attribution.

Current applications are maintained GTV patches of LG App Update Blocker and YouTube AdFree.

## Repository layout

```text
gtv/
├─ branding/
│  ├─ README.md
│  └─ requirements.txt
├─ apps/
│  ├─ <app-name>/
│  │  ├─ LICENSE
│  │  ├─ README.md
│  │  ├─ app.json
│  │  └─ patches/
│  └─ ...
├─ repo/
│  ├─ apps.json
│  ├─ descriptions/
│  ├─ icons/
│  ├─ manifests/
│  └─ packages/
├─ scripts/
│  ├─ build-repository.py
│  ├─ build-smart-icon.py
│  ├─ smart_badge.py
│  └─ validate-repository.py
├─ .github/
│  └─ workflows/
│     └─ build-youtube-dev.yml
└─ README.md
```

The old repo-wide build workflow has been retired. On `dev`, YouTube changes run the YouTube-only DEV workflow: only YouTube patch tests, YouTube packaging, shared branding/version helper tests, and feed validation are performed. Unrelated applications are not rebuilt or tested.

Successful YouTube DEV builds are promoted by the default branch's promotion-only workflow, which copies the finished DEV package/metadata into the main Homebrew feed without rebuilding other applications.

## Homebrew Channel

The contents of `repo/` are generated from the applications under `apps/`. The generated `apps.json` feed is intended to be added to Homebrew Channel as an external repository.

Generated repository files are build outputs. Application source, patch files, metadata, licensing, and attribution live under `apps/`.

`build-repository.py` prunes generated package, manifest, icon, and description files whose application no longer exists, so retired apps do not linger in the published repository.

## Patched-app release notes

Every patched upstream application must define structured `changes` metadata and upstream identity in its `app.json`. The repository build turns that metadata into the full description shown on the Homebrew Channel install/update screen.

Release-note entries describe only functional differences from the pinned upstream application. Repository-only work such as branding, metadata, CI, tests, build plumbing, or documentation does not become application release-note text unless it directly changes runtime behavior.

## Patched-app versioning

Patched GTV builds use a webOS-safe package version whose numeric tail preserves the upstream version while the package major carries the `69` marker and, when needed, a GTV-only revision prefix.

The build derives the expected package version from `upstream.version` and `gtvRevision`; a mismatch fails instead of publishing an incorrectly versioned package.

## Patched-app branding

Patched applications retain their upstream icons but receive a generated lowercase neon `g` in the Pricedown Black GTA logo typeface in both the installed package and Homebrew Channel listing. The implementation and metadata contract are documented in [`branding/README.md`](branding/README.md).

## Licensing

There is intentionally no blanket license covering every application in this repository. Every directory under `apps/` must contain the complete applicable `LICENSE` text. Patched applications preserve and comply with their upstream licenses.
