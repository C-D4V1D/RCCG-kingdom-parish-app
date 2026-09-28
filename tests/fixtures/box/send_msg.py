"""Test fixture: the parts of the Clerk box's /workspace/telegram/send_msg.py that the month-close update changes."""
import json, sys
class A: pass
a = A(); a.key = sys.argv[1] if len(sys.argv) > 1 else None
class _Cfg:
    def people(self): return json.loads(sys.argv[2]) if len(sys.argv) > 2 else []
_C = _Cfg()
plan = [("david", "RRR text", None), ("divine", "RRR text", None), ("fabian", "RRR text", None)]
if len(sys.argv) > 3: plan = [("fabian", "t", [[{"text": "Open", "url": "https://x"}]])]
for who, _, kb in plan:
    if kb and who not in ('david', 'divine'): sys.exit(f'refused: buttons only for david/divine, not {who}')
print(json.dumps(plan))
