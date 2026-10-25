# satalign-20261022: Fix alignment, box side (logic TESTED offline, wiring UNTESTED on the box)

`satalign.py` = the logic. `test_satalign.py` = 10 offline tests (fake app, fake Telegram, fake mail). App side is PR #443 (live).
Needs `box/satcheck-20261022/satcheck.py` too (portal 0 vs app blank counts as aligned, plus the "why" line).

## Wiring (the operator installs; each item is small)
1. **satmonthend.check_round**: when `not ok`, add a second button row `🛠 Fix alignment` = `mend|<code>|<month>|fix_preview`, shown only to
   the Accountant (Divine) and the Finance Officer (David), resolved with the new shared role resolver (clerk-box PR #252, f8b235c), the same list as Generate RRR. Use `satcheck.effective(S)` for `ok`/`bad`, and add `satcheck.why(bad)`.
2. **satbot.button** (`mend`): accept 4 parts, or 5 for `fix_apply` (set hash, `[0-9a-f]{10}`) and `fix_undo` (change id, `[a-z0-9]{6,20}`). Allowed actions add
   `fix_preview, fix_apply, fix_cancel, fix_undo`. Same "own parish only" rule; the person check uses the same role resolver (Accountant and Finance Officer). `fix_apply` carries a 10-character set hash as a 5th part. Write the event into the
   monthend inbox as for the other actions (`action`, `changeId`).
3. **monthend run, `sat_action` events**: for `fix_*` take the same per-parish lock as Generate RRR/Refresh, build `ctx` from the run's
   `runs/run-<month>.json` (`mismatchLines` -> `{item, portal, app}`, after `satcheck.effective`), then call `satalign.run(action, ctx, deps, change_id=<undo id>, bound=<apply hash>)`. Apply is refused and re-previewed unless the hash still matches the lines and the app's proposal. The presser never sees unfixable item names, only "I am handling the rest"; those go to Instinct through the Alerter:
   - `call` = `satalign.call_app(APP, CLERK_WATCHDOG_TOKEN, ...)` (the token the watchdog already uses; never logged or sent in a message)
   - `send` = the existing `satmonthend.send(P, [presser], text, key, buttons, button_for=[presser])`
   - `refresh` = the existing refresh path (re-read app breakdown + portal preview, `build-run.py`), returning `{app, portal, bad}`
   - `alert` = `satalign.Alerter("<state dir>/align-alerts.json", mail, topic).alert`, where `mail` = `M.mail_plain` (returns True/False) and `topic` = the ops Telegram topic send (not David's DM).
4. A failed app call: tell the presser "could not reach the app, nothing changed", and send an alert with the error. Never retry an `apply` blindly.

Alert goes to cdavid@mail.instinct.com, subject `[Instinct-alert] satellite alignment <parish name> <month>`, once per parish, month and set of lines.
Undo: restore the previous `satmonthend.py` / `satbot.py`.

## 403 on the first live preview (22 Oct): cause and fix
Route expects header `x-watchdog-token` = the app's `CLERK_WATCHDOG_TOKEN` (same token as run-bank-recon). A wrong or missing token gets **401** from the app.
The 403 was **not** the token: Cloudflare in front of the app answers 403 (body `error code: 1010`) to Python's default `Python-urllib` User-Agent,
before the app sees the request (reproduced: same request with a `curl` or custom agent reaches the app and gets 401). `call_app` now sends
`User-Agent: kp-box-satalign/1`. If the operator calls the route another way, set any non-default User-Agent.
