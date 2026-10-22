# satcheck-20261022: two changes to the satellite check message (box side, UNTESTED on the box)

`satcheck.py` holds the logic; `test_satcheck.py` tests it offline.

1. Portal ₦0 against an app line that is absent is not a difference (Coastline Worship Centre, Insurance Fund). 
2. When lines still differ, the check says in one plain line why.

## Wire-in (satmonthend.py `check_round`, two small edits)
- Copy `satcheck.py` next to `satmonthend.py` and `import satcheck`.
- Replace `ok = S.get("allAligned") and ...` with `ok, bad, _ignored = satcheck.effective(S)`; in the `else` branch use that `bad`
  instead of `S.get("mismatchLines")`.
- After the mismatch bullets add: `w = satcheck.why(bad); if w: L.append(M.esc(w))`.
- The Fix alignment preview (`mend|...|fix_preview`) must send the same filtered `bad`.
Undo: restore the previous `satmonthend.py`.
