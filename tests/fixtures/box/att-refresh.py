"""Test fixture: the part of the Clerk box's /workspace/tools/att-refresh.py that the collection-reminders update changes."""
import os
def load(p, d): return d
def out(state, msg): raise SystemExit(msg)
def apply(m, who):
    runs = load("state/att-runs.json", {})
    if m not in runs: out("error", "This month wasn't filed by this flow, so it can't be refreshed here.")
    n = len(runs[m].get("refreshes", [])) + 1
    runs = load("state/att-runs.json", {})
    runs[m].setdefault("refreshes", []).append({"n": n})
    return runs
