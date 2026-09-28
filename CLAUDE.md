# RCCG Kingdom Parish app

Cloudflare Pages app (vanilla JS in `src/`, built to `dist/` with `npm run build` — commit the build output) with
Pages Functions in `functions/` and D1. Tests: `npm test`.

## Clerk box, watchdog Worker and the Automations tab

Anything about the Clerk box (the parish's automation VM), the `clerk-watchdog` Worker (`workers/clerk-watchdog/`),
the box installer (`box/`) or the app's Automations tab: load the `clerk-box` skill (`.claude/skills/clerk-box/SKILL.md`)
first. It explains how they connect, where the box's files are (Google Drive mirror), how to ship a box change safely
and how to deploy the Worker.

## Working with the owner

- David is not a developer: give plain-English, step-by-step instructions and copy-paste commands.
- He has authorised merging PRs once CI is green and the work is checked.
- He likes work routed to cheaper models where quality allows (`/frugal`).
