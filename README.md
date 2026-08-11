# gtv

webOS homebrew apps.

`gtv` is a monorepo for webOS homebrew applications, including original projects and maintained patches of existing software. Each application is self-contained and carries its own licensing and attribution.

## Repository layout

```text
gtv/
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
│  ├─ manifests/           # generated per-app manifests
│  └─ packages/            # generated IPKs
├─ scripts/
│  └─ build-repository.py
├─ .github/
│  └─ workflows/
│     └─ build-repository.yml
└─ README.md
```

## Homebrew Channel

The contents of `repo/` are generated from the applications under `apps/`. The generated `apps.json` feed is intended to be added to Homebrew Channel as an external repository, allowing the apps here to be browsed, installed, and updated from the TV UI with their own titles, descriptions, icons, versions, and requirements.

Generated repository files are build outputs. Application source, patch files, metadata, licensing, and attribution live under `apps/`.

## Licensing

There is intentionally no blanket license covering every application in this repository.

Each directory under `apps/` contains its own `LICENSE` file. Patched or derived applications preserve and comply with their upstream licenses. Original applications may use their own separately stated licenses, including non-commercial licenses where chosen.

The `LICENSE` file inside an application directory is authoritative for that application.
