#!/usr/bin/env python3
"""Test stub for every Clerk box script the month-end runner calls (and for `node`).
Records each call in $STUB_ROOT/calls.jsonl and answers from $STUB_ROOT/scenario.json:
  {"<script> <first word>": answer | [answer, answer...]}   (or "<script>": ...)   list = one answer per call, the last repeats
  answer = {"exit": 0, "stdout": {...} or "text", "files": {"<path>": {...}}}
  In file paths, {--flag} is replaced by the value after that flag."""
import json, os, sys
root = os.environ["STUB_ROOT"]
argv = sys.argv[1:]
if os.path.basename(sys.argv[0]) == "node":
    script, args = os.path.basename(argv[0]), argv[1:]
else:
    script, args = os.path.basename(sys.argv[0]), argv
sub = next((a for a in args if not a.startswith("-")), "")
calls = os.path.join(root, "calls.jsonl")
prev = [json.loads(l) for l in open(calls)] if os.path.exists(calls) else []
rec = {"script": script, "sub": sub, "args": args, "cwd": os.getcwd(), "type": os.environ.get("CLERK_MSG_TYPE")}
open(calls, "a").write(json.dumps(rec) + "\n")
sc = json.load(open(os.path.join(root, "scenario.json")))
r = sc.get(f"{script} {sub}", sc.get(script, {"exit": 0, "stdout": {}}))
if isinstance(r, list):
    n = sum(1 for c in prev if c["script"] == script and c["sub"] == sub)
    r = r[min(n, len(r) - 1)]
def flag(f):
    return args[args.index(f) + 1] if f in args else ""
for rel, content in (r.get("files") or {}).items():
    for f in ("--out", "--out-dir", "--payload-out", "--in"):
        rel = rel.replace("{" + f + "}", flag(f))
    p = rel if os.path.isabs(rel) else os.path.join(os.getcwd(), rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write(content if isinstance(content, str) else json.dumps(content))
out = r.get("stdout", {})
print(out if isinstance(out, str) else json.dumps(out))
sys.exit(r.get("exit", 0))
