#!/usr/bin/env python3
import datetime, os, sys, time
sys.path.insert(0, "/workspace/tools"); from common import *
FIN = "/workspace/fin-statement"; os.chdir(FIN)
import clerkcfg as C; os.environ["CLERK_CONTEXT"] = "statement"  # automations-20260928
def cycle():
    rc, out, err = run(["node", "make-statement.js", "--check-due"], FIN, 120)
    if rc == 10: return
    due = js(out) or {}
    frm, to = due.get("from"), due.get("to")
    rc, out, err = run(["node", "make-statement.js", "--live"], FIN, 1200)
    res = js(out) or {}
def test():
    rc, out, err = run(["node", "make-statement.js", "--month", "2026-09", "--render-only", "tok", "--out", "/tmp/x.pdf"], FIN, 900)
# tgstyle-20260927
# automations-20260928
