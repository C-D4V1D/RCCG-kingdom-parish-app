import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
import satalign as A

CTX = {"code": "659840", "name": "Sanctuary of Favour", "month": "2026-10", "person": "divine",
       "lines": [{"item": "Open Heavens", "portal": 1400, "app": None}]}

class Fake:
    def __init__(self, resp, fail_mail=False, fail_topic=False):
        self.resp, self.sent, self.calls, self.alerts, self.n = resp, [], [], [], 0
    def call(self, action, **kw):
        self.calls.append((action, kw)); return self.resp[action]
    def send(self, text, buttons=None): self.sent.append((text, buttons))
    def refresh(self):
        self.n += 1
        return {"app": 8200.75, "portal": 9600.75, "bad": [1]} if self.n == 1 else {"app": 9600.75, "portal": 9600.75, "bad": []}
    def alert(self, *a): self.alerts.append(a)
    def deps(self): return {"call": self.call, "send": self.send, "refresh": self.refresh, "alert": self.alert}

R = {"preview": {"ok": True, "changes": [{"label": "Open Heavens", "amount": 1400}], "needsPerson": [{"item": "Mystery", "reason": "x"}]},
     "apply": {"ok": True, "applied": True, "changeId": "saabc123", "changes": [{"label": "Open Heavens", "amount": 1400}], "needsPerson": []},
     "undo": {"ok": True, "removed": [{"label": "Open Heavens", "amount": 1400}]}}

HASH = A.set_hash(CTX["lines"], R["preview"]["changes"])

class T(unittest.TestCase):
    def test_stale_or_missing_binding_refuses_and_re_previews(self):
        for bound in ("deadbeef00", None):
            f = Fake(R); A.run("fix_apply", CTX, f.deps(), bound=bound)
            self.assertNotIn("apply", [c[0] for c in f.calls])        # never reached the app's apply
            self.assertIn("nothing was applied", f.sent[0][0]); self.assertIn("Apply", str(f.sent[1][1]))
        changed = dict(CTX, lines=CTX["lines"] + [{"item": "X", "portal": 5, "app": None}])
        f = Fake(R); A.run("fix_apply", changed, f.deps(), bound=HASH)
        self.assertNotIn("apply", [c[0] for c in f.calls])
    def test_proposal_changed_on_app_refuses(self):
        f = Fake(dict(R, preview={"changes": [{"label": "Open Heavens", "amount": 999}], "needsPerson": []}))
        A.run("fix_apply", CTX, f.deps(), bound=HASH); self.assertNotIn("apply", [c[0] for c in f.calls])
    def test_preview_shows_exact_change_and_hands_rest_to_instinct(self):
        f = Fake(R); A.run("fix_preview", CTX, f.deps())
        text, buttons = f.sent[0]
        self.assertIn("Open Heavens: ₦1,400.00", text); self.assertNotIn("Mystery", text); self.assertNotIn("Mystery", "".join(x[0] for x in f.sent))
        h = A.set_hash(CTX["lines"], R["preview"]["changes"])
        self.assertEqual([b["callback_data"] for b in buttons[0]], [f"mend|659840|2026-10|fix_apply|{h}", "mend|659840|2026-10|fix_cancel"])
        self.assertEqual(len(f.alerts), 1); self.assertEqual(f.sent[1][0], "I am handling the rest.")
        self.assertEqual(f.calls[0][0], "preview")            # preview never calls apply
    def test_nothing_fixable_has_no_buttons(self):
        f = Fake({"preview": {"changes": [], "needsPerson": []}}); A.run("fix_preview", CTX, f.deps())
        self.assertIsNone(f.sent[0][1]); self.assertEqual(f.alerts, [])
    def test_apply_reports_before_after_with_undo(self):
        f = Fake(R); text = A.run("fix_apply", CTX, f.deps(), bound=HASH)
        self.assertIn("₦8,200.75 → <b>₦9,600.75</b>", text); self.assertIn("1 → <b>0</b>", text)
        self.assertEqual(f.sent[0][1][0][0]["callback_data"], "mend|659840|2026-10|fix_undo|saabc123")
        self.assertLessEqual(len(f.sent[0][1][0][0]["callback_data"].encode()), 64)
    def test_apply_with_nothing_applied_changes_nothing(self):
        f = Fake({"preview": R["preview"], "apply": {"ok": True, "applied": False, "needsPerson": [{"item": "m"}]}}); A.run("fix_apply", CTX, f.deps(), bound=HASH)
        self.assertEqual(f.sent[0][0], "Nothing was changed."); self.assertEqual(len(f.alerts), 1)
    def test_undo_and_refused_undo(self):
        f = Fake(R); A.run("fix_undo", CTX, f.deps(), "saabc123"); self.assertIn("undone", f.sent[0][0])
        self.assertEqual(f.calls[0][1]["change_id"], "saabc123")
        g = Fake({"undo": {"ok": False}}); A.run("fix_undo", CTX, g.deps(), "x"); self.assertIn("Could not undo", g.sent[0][0])
    def test_cancel(self):
        f = Fake(R); A.run("fix_cancel", CTX, f.deps()); self.assertEqual(f.calls, [])
    def test_http_call_shape(self):
        seen = {}
        class Resp:
            def __enter__(s): return s
            def __exit__(s, *a): pass
            def read(s): return b'{"ok": true}'
        def opener(req, timeout):
            seen.update(url=req.full_url, tok=req.get_header("X-watchdog-token"), ua=req.get_header("User-agent"), body=json.loads(req.data)); return Resp()
        r = A.call_app("https://x.test/", "T0K", "undo", "659840", "2026-10", by="d", change_id="sa1", opener=opener)
        self.assertEqual(seen["url"], "https://x.test/api/internal/satellite-align"); self.assertEqual(seen["tok"], "T0K")
        self.assertEqual(seen["ua"], "kp-box-satalign/1"); self.assertEqual(seen["body"]["changeId"], "sa1"); self.assertTrue(r["ok"])

class TA(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(); self.p = os.path.join(self.d, "s.json"); self.out = []
    def al(self, mail_ok=True, topic_ok=True):
        return A.Alerter(self.p, lambda to, s, b: (self.out.append(("mail", to, s, b)) or mail_ok),
                         lambda t: (self.out.append(("topic", t)) or topic_ok))
    ITEMS = [{"item": "Mystery", "portal": 500, "app": None, "reason": "not a known fixed quota"}]
    def test_once_per_set_of_lines(self):
        a = self.al()
        self.assertEqual(a.alert("659840", "Sanctuary of Favour", "2026-10", self.ITEMS), "email")
        self.assertEqual(a.alert("659840", "Sanctuary of Favour", "2026-10", list(reversed(self.ITEMS))), "duplicate")
        self.assertEqual(len(self.out), 1)
        m = self.out[0]; self.assertEqual(m[1], "cdavid@mail.instinct.com")
        self.assertEqual(m[2], "[Instinct-alert] satellite alignment Sanctuary of Favour 2026-10")
        self.assertIn('"item": "Mystery"', m[3])
        other = self.ITEMS + [{"item": "Other", "portal": 1, "app": None, "reason": "r"}]
        self.assertEqual(a.alert("659840", "Sanctuary of Favour", "2026-10", other), "email")   # new set of lines
        self.assertEqual(a.alert("659840", "Sanctuary of Favour", "2026-11", self.ITEMS), "email")  # new month
    def test_fallback_topic_then_failure_retries(self):
        self.assertEqual(self.al(mail_ok=False).alert("1", "P", "2026-10", self.ITEMS), "topic")
        self.assertEqual(self.al(mail_ok=False, topic_ok=False).alert("2", "P", "2026-10", self.ITEMS), "failed")
        self.assertEqual(self.al().alert("2", "P", "2026-10", self.ITEMS), "email")   # failed one was not recorded
    def test_empty(self):
        self.assertEqual(self.al().alert("1", "P", "m", []), "empty")

if __name__ == "__main__": unittest.main()
