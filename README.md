# gtv

webOS homebrew apps.

`gtv` is a monorepo for webOS homebrew applications, including original projects and maintained patches of existing software. Each application is self-contained and carries its own licensing and attribution.

## Repository layout

```text
gtv/
├─ branding/
│  ├─ fonts/              # vendored font and its own license
│  ├─ README.md           # dynamic badge algorithm and metadata
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

## Patched-app branding

Patched applications retain their upstream icons but receive a generated lowercase neon `g` in both the installed package and Homebrew Channel listing. Its color is not selected from a fixed palette: the build analyzes the exact source pixels underneath the glyph, optimizes a continuous OKLab color field for local contrast, regularizes neighboring colors into a coherent sign, and renders a colored tube and bloom at high resolution.

Per-app placement, scale, padding, expected dimensions, and source icon paths live in the application's `branding` metadata. The implementation and metadata contract are documented in [`branding/README.md`](branding/README.md).

`apps/<name>/app.json` is the sole authority for a patched package version. The build applies that version before packaging, then validates it against the IPK control metadata, installed `appinfo.json`, installed `packageinfo.json`, generated manifest, and feed. A mismatch fails CI rather than publishing drifted metadata.

## Licensing

There is intentionally no blanket license covering every application in this repository.

Each directory under `apps/` contains its own `LICENSE` file. Patched or derived applications preserve and comply with their upstream licenses. Original applications may use their own separately stated licenses, including non-commercial licenses where chosen.

The `LICENSE` file inside an application directory is authoritative for that application.
