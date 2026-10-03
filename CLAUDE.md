# RCCG Kingdom Parish app

Cloudflare Pages app (vanilla JS in `src/`, built to `dist/` with `npm run build` — commit the build output) with
Pages Functions in `functions/` and D1. Tests: `npm test`.

## Clerk box, watchdog Worker and the Automations tab

Anything about the Clerk box (the parish's automation VM), the `clerk-watchdog` Worker (`workers/clerk-watchdog/`),
the box installer (`box/`) or the app's Automations tab: load the `clerk-box` skill (`.claude/skills/clerk-box/SKILL.md`)
first. It explains how they connect, where the box's files are (Google Drive mirror), how to ship a box change safely
and how to deploy the Worker.

## Rules (all agents)

- **Never re-run a retired box installer.** `box/INSTALL-ORDER.md` lists them (they stop unless
  `FORCE_OLD_INSTALLER=1`) and gives the only correct order for building a fresh box. Don't run any box installer
  unless David asked for that one.
- **Box changes = a NEW small patch installer.** Add a new dated `box/<name>-YYYYMMDD/` with an anchored `patch.py`,
  an `install.sh` that offers `--check` and backs up first, and an `undo.sh`. Never copy a whole file over one that
  already exists on the box, never edit an old bundle in place, and add the new folder to `box/INSTALL-ORDER.md`.
- **Follow the app's Automations settings.** People, routing (who gets which message, Telegram or email), handlers
  and times come from the config (`clerkcfg.py` on the box, the Automations tab in the app). Never hard-code them.
- **No personal data in this repo (it is public).** No names with contact details, emails, phone numbers, chat ids,
  tokens, passwords or bank details in code, tests, fixtures or docs. Use placeholders.
- **Keep loading and syncing fast.** No heavy work on page load or in the box's 5-minute cycle. Keep checks light
  (`bash -n`, `python3 -m py_compile`) unless a change really needs more.

## Working with the owner

- David is not a developer: give plain-English, step-by-step instructions and copy-paste commands.
- He has authorised merging PRs once CI is green and the work is checked.
- He likes work routed to cheaper models where quality allows (`/frugal`).
