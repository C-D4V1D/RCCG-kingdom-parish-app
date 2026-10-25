# instinct-alerts-20261022: errors and David's Telegram messages go to Instinct by email (logic TESTED offline, wiring UNTESTED on the box)
Drop-in files for `tools/` next to `satalign.py` (from satalign-20261022): `alerts.py`, `tgforward.py`, `instinct_notify.py`. Tests: `python3 test_alerts.py`.
The old Telegram-to-WhatsApp relay is NOT touched; its switch-off is the separate `tgrelay-off-20261022` (do not run `off` until Instinct confirms).

## Classes
Critical (email Instinct AND ping David): money/RRR/payment; filing whose earlier attempt is not VERIFIED as not landed (landed, unknown, or the re-file failed);
data loss; any error where the fix is uncertain or major; any unknown kind.
Quiet (email Instinct only): box down and brought back; filing where the earlier attempt is verified not landed and the re-file went through; known minor fixed errors
(incl. the updater notice). Subject `[Instinct-alert] clerk-box <component>`, body = JSON (component, time, exact error, class, facts). Same error not repeated within 6 hours (times and long numbers ignored); a failed send is retried next time.

## Wiring (operator)
1. **Error posts**: wherever a script posts an error to Telegram/WhatsApp, call `python3 /workspace/tools/instinct_notify.py --component <name> --kind <kind> [--fix-certain] [--recovered] [--earlier-attempt not_landed --refiled-ok] --error "<exact error>"`, or `alerts.ErrorRouter(...).report(...)` from Python (`mail` = `M.mail_plain`-style, `ping` = the existing Telegram send to David). Critical needs `CLERK_PING_CMD` (reads the text on stdin and messages David) else exit code 3.
2. **clerk-pull.sh** (I could not read it, it is not in this repo): replace the line that sends the "update skipped, files edited by hand" Telegram notice with
   `python3 /workspace/tools/instinct_notify.py --component updater --kind other --fix-certain --error "update skipped: files edited by hand: $FILES"`  (subject becomes `[Instinct-alert] clerk-box updater`).
3. **Telegram forward**: in the poller, at the top of its per-update handling call `Forwarder("/workspace/state/tg-forward.json", deps).forward(update)` with `deps = {is_david: id == David's bot-admin id, topic_name: f(chat_id, thread_id) (forum topic names the poller already knows, else None), mail: mailer_send}`; call `.flush()` on each poll loop. Subject `[David-telegram] <topic>`, body = full text, topic, message id, chat id, thread id, time. Never sent twice for the same message id; failed sends are queued and retried.
Undo: remove the calls.

Alert and David-telegram email bodies and subjects carry no URLs: every link is written as its host only (satalign.defang, used by alerts, tgforward and the satellite Alerter).
