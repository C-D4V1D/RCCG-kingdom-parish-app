# Fix alignment (satellite parish remittance check)

A third button, "🛠 Fix alignment", under a satellite parish's remittance check in Telegram (next to Generate RRR and Refresh).
It makes the app match the portal only where that is safe, shows what it will do first, logs it, and can be undone.
It never touches the portal side or any payment.

## App side (this repo)
`POST /api/internal/satellite-align`, accepted only with the box's `x-watchdog-token`.
Body: `{ action: preview|apply|undo, parish, month, lines:[{item, portal, app}], by, changeId }`.
- `preview` writes nothing: returns `changes` (what would be added), `noops`, `needsPerson` (what a script must not fix, with reasons).
- `apply` adds each safe change to `settings.satQuotas[parish]`, logs it in `settings.satAlignLog` (id, who, when, list before, lines added), audits it, syncs the parish database at once, returns `changeId`.
- `undo` removes the lines that change added, only while they still hold the amount it set.
The rule set is `functions/_lib/sat-align.js`: one case is fixed by script, a line the portal charges that the app shows as nothing, which Kingdom already has as a fixed quota label, where the portal amount is not above Kingdom's own amount for that label and the parish does not already have it. Lines where both sides are 0 or empty are ignored. Everything else (unknown line, both sides differ, app has more, amount above Kingdom's, parish already has the quota) is `needsPerson`.

## Box side (spec for the Clerk box)
1. `satmonthend.check_round`: when the check is not aligned, add a second button row `🛠 Fix alignment` (callback `mend|<code>|<month>|fix_preview`) for the same people who get Generate RRR (`approves_rrr` plus the Area office). Aligned checks show no such button.
2. `satbot.button`: new actions, same person check as Generate RRR, same "only for the person's own parish" rule.
   - `fix_preview`: call the app `preview` with the check's `mismatchLines` as `{item, portal, app}` (portal/app null when absent). Reply to the presser with exactly what it will add and what it cannot fix, plus buttons `✅ Apply` (`...|fix_apply`) and `✖ Cancel`. If there is nothing the script can fix, send no buttons and go to step 4.
   - `fix_apply`: call `apply` (same lines, `by` = presser key). Then run the existing refresh path (re-read the app figures and the portal, `check_round` with refresh) and reply with measured before/after: app total, portal total, lines that differ, plus a `↩ Undo` button (`...|fix_undo|<changeId>`).
   - `fix_undo`: call `undo`, refresh, reply with the new numbers.
3. Do not run twice at once: take the same per-parish lock the Generate RRR and Refresh actions use.
4. Anything in `needsPerson` is not sent to the parish people or to David. The box sends one alert to Instinct (below) with the exact lines and reasons, once per parish, month and set of lines, and tells the presser only "I am handling the rest".
5. Treat a portal 0 against an app line that is absent as aligned in the check itself, so these lines stop showing as differences.
