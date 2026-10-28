# AutoConsent layout

This repo is DuckDuckGo autoconsent (`upstream` remote) plus the AutoConsent extension UI on `main`.
Everything AutoConsent-specific lives in new files so merging `upstream/main` rarely conflicts:

- `addon/personal/` — popup (site toggle + mode), settings page (activity, general, paused sites, rules, advanced),
  local activity log (`activity.ts`), and a background entry that wraps upstream's `addon/background.ts`.
- `addon/personal/brand/` — logo SVGs and rendered PNGs (`render.sh` regenerates them). Toolbar state icons replace
  upstream's cookie icons at build time.
- `addon/personal/VERSION` — the extension version. The engine version comes from `package.json`.
- `scripts/personal/build.sh` — builds upstream, bundles `addon/personal`, brands the manifest, copies to `extension/`.
- `scripts/personal/update.sh` — merges `upstream/main`, reinstalls, rebuilds.
- `scripts/personal/release.sh` — builds and zips `extension/` for a GitHub release.
- `.github/README.md` — the repo README GitHub shows (upstream's root `README.md` is left untouched).
- `addon/utils.ts` — the only upstream file edited (debug logging off by default).

`extension/` is the folder loaded unpacked in the browser. After a build, click reload on the extension. Keep that path
stable: moving it changes the extension ID and loses settings and history.

The DuckDuckGo agent skills (`.claude/skills`) need env vars in `.claude/settings.local.json` (git-excluded),
copied from `.claude/user-settings.json.TEMPLATE`.
