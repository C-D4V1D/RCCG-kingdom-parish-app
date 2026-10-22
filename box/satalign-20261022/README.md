# satalign-20261022: Fix alignment, box side (logic TESTED offline, wiring UNTESTED on the box)

`satalign.py` = the logic. `test_satalign.py` = 10 offline tests (fake app, fake Telegram, fake mail). App side is PR #443 (live).
Needs `box/satcheck-20261022/satcheck.py` too (portal 0 vs app blank counts as aligned, plus the "why" line).

## Wiring (the operator installs; each item is small)
1. **satmonthend.check_round**: when `not ok`, add a second button row `🛠 Fix alignment` = `mend|<code>|<month>|fix_preview`, shown only to
   `approves_rrr` plus david (same `button_for` list as Generate RRR). Use `satcheck.effective(S)` for `ok`/`bad`, and add `satcheck.why(bad)`.
2. **satbot.button** (`mend`): accept 4 parts, or 5 for `fix_undo` (last part = change id, `[a-z0-9]{6,20}`). Allowed actions add
   `fix_preview, fix_apply, fix_cancel, fix_undo`. Same "own parish only" and same person check as Generate RRR. Write the event into the
   monthend inbox as for the other actions (`action`, `changeId`).
3. **monthend run, `sat_action` events**: for `fix_*` take the same per-parish lock as Generate RRR/Refresh, build `ctx` from the run's
   `runs/run-<month>.json` (`mismatchLines` -> `{item, portal, app}`, after `satcheck.effective`), then call `satalign.run(action, ctx, deps, change_id)`:
   - `call` = `satalign.call_app(APP, CLERK_WATCHDOG_TOKEN, ...)` (the token the watchdog already uses; never logged or sent in a message)
   - `send` = the existing `satmonthend.send(P, [presser], text, key, buttons, button_for=[presser])`
   - `refresh` = the existing refresh path (re-read app breakdown + portal preview, `build-run.py`), returning `{app, portal, bad}`
   - `alert` = `satalign.Alerter("<state dir>/align-alerts.json", mail, topic).alert`, where `mail` = `M.mail_plain` (returns True/False) and `topic` = the ops Telegram topic send (not David's DM).
4. A failed app call: tell the presser "could not reach the app, nothing changed", and send an alert with the error. Never retry an `apply` blindly.

Alert goes to cdavid@mail.instinct.com, subject `[Instinct-alert] satellite alignment <parish name> <month>`, once per parish, month and set of lines.
Undo: restore the previous `satmonthend.py` / `satbot.py`.
