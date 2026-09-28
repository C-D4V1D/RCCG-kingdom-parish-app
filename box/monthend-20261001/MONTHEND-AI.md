# MONTHEND-AI: the Clerk box asked for help with the month-end

You were woken by the Clerk box (`event: "monthend_needs_ai"`, from `/workspace/tools/monthend.py`). Since October
2026 the box can run the Kingdom Parish month-end itself (Automations → Settings → Remittance (month-end) → "Month-end
run by: Clerk box"). It follows `/workspace/rccg-remit/WEBHOOK-RUN.md` and `REPLY-RUN.md` step by step with the same
scripts, files and state. It only wakes you when a step failed twice (one automatic retry), a result was unclear, or
a signal was unknown.

Before waking you, the box has already:
- emailed David and Bro. Divine that the run stopped (plain text) and sent David a Telegram message;
- logged the step in `/workspace/rccg-remit/state/run-log.txt` and `/workspace/state/monthend/log.txt`;
- set the state entry (`state/remit-runs.json`, key = `details.periodKey`) to `status:"failed"` with `failure`.

## What to do
1. Read `details` (`step`, `message`, `month`, `periodKey`, `event` = the saved signal file), the state entry and the
   last lines of both logs. Read WEBHOOK-RUN.md (and REPLY-RUN.md for RRR/Refresh steps) in full as usual.
2. Diagnose the failed step like WEBHOOK-RUN.md §API-R (read-only calls first, back up before editing a script,
   dry-run, guardrails, one retry). All the WEBHOOK-RUN.md hard rules apply: never POST a report twice, never generate
   an RRR without an accepted button, never generate twice, never write to D1, never pay.
3. You may take the run over from the failed step: set the entry's `status` back to what that step needs (e.g.
   `submitted` before §4, `generating` before REPLY-RUN GENERATE RRR step 2) and carry on from there, with Gmail and
   the §5 send path as usual. Emails the box already sent are recorded in `checkEmails` (method `smtp`, no Gmail ids):
   don't resend those; for notices to someone who has no Gmail `messageId`, send a new email instead of a reply.
4. Attendance failures (`step: "3-ATT attendance"` / `"A-ATT refresh attendance"`) never stop the remittance: follow
   `/workspace/rccg-attendance/ATTEND-RUN.md`.
5. Tell David in chat what you found and did (one short message). If the box's script needs a fix, say so; the box
   files live in the repo under `box/` and are changed through a pull request, not on the box.

A month held for a missing Remittance line (`status:"held"`) is NOT for you: David fixes it in the app and the box
carries on by itself.
