# Personal build

This checkout is DuckDuckGo autoconsent (`upstream` remote) with a personal extension UI on the `personal` branch.
Everything personal lives in new files so `git rebase upstream/main` rarely conflicts:

- `addon/personal/` — dark popup (site toggle + mode), settings page (activity, general, paused sites, rules, advanced),
  local activity log (`activity.ts`), and a background entry that wraps upstream's `addon/background.ts`.
- `scripts/personal/build.sh` — builds upstream, bundles `addon/personal`, patches the manifest, copies to `extension/`.
- `scripts/personal/update.sh` — fetches upstream, rebases `personal` onto it, reinstalls, rebuilds.
- `addon/utils.ts` — the only upstream file edited (debug logging off by default).

`extension/` is the folder loaded unpacked in Helium. After a build, click reload on the extension in
`helium://extensions`. Keep that path stable: moving it changes the extension ID and loses settings and history.

The DuckDuckGo agent skills (`.claude/skills`) need env vars in `.claude/settings.local.json` (git-excluded),
copied from `.claude/user-settings.json.TEMPLATE`.
