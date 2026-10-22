"""Command line for shell scripts (clerk-pull.sh and others) to send an error to Instinct instead of Telegram.

  python3 instinct_notify.py --component updater --kind other --fix-certain --error "update skipped: files edited by hand: a.py b.py"
  kinds: money | filing | data_loss | box_down | other.  Flags: --fix-certain  --recovered  --earlier-attempt not_landed|landed|unknown  --refiled-ok
Email goes through the box mailer (tools/mailer.py send --payload), like every other box email. Critical errors also need a David ping:
set CLERK_PING_CMD to a command that reads the text on stdin (left unset, a critical error is emailed only and the exit code is 3).
"""
import argparse, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import alerts as A


def mailer_send(to, subject, body, tools=HERE, run=subprocess.run):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "payload.json")
        json.dump({"to": [to], "subject": subject, "body": body}, open(p, "w"))
        r = run([sys.executable, os.path.join(tools, "mailer.py"), "send", "--payload", p], capture_output=True, text=True, timeout=180)
        return r.returncode == 0 and '"ok": true' in (r.stdout or "")


def ping_cmd(text, run=subprocess.run):
    cmd = os.environ.get("CLERK_PING_CMD")
    if not cmd:
        return False
    return run(cmd, shell=True, input=text, text=True, capture_output=True, timeout=60).returncode == 0


def main(argv=None, deps=None, state=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--component", required=True)
    ap.add_argument("--error", required=True)
    ap.add_argument("--kind", default="other", choices=["money", "filing", "data_loss", "box_down", "other"])
    ap.add_argument("--fix-certain", action="store_true")
    ap.add_argument("--recovered", action="store_true")
    ap.add_argument("--earlier-attempt", choices=["not_landed", "landed", "unknown"])
    ap.add_argument("--refiled-ok", action="store_true")
    a = ap.parse_args(argv)
    facts = {"fix_certain": a.fix_certain, "recovered": a.recovered or a.kind == "other",
             "earlier_attempt": a.earlier_attempt, "refiled_ok": a.refiled_ok}
    d = deps or {"mail": mailer_send, "topic": lambda t: False, "ping": ping_cmd}
    r = A.ErrorRouter(state or os.environ.get("CLERK_ALERT_STATE", "/workspace/state/instinct-alerts.json"), d).report(a.component, a.error, a.kind, facts)
    print(json.dumps(r))
    return 0 if r["how"] != "failed" and (not A.is_critical(r["cls"]) or r["ping"] or r["how"] == "duplicate") else 3


if __name__ == "__main__":
    sys.exit(main())
