import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import receiptflow as F

CTX = {"rrr": "161528198373", "bill": 79189.41, "month": "2026-10", "parish": "602757", "periodFrom": "2026-09-21", "periodTo": "2026-10-21", "person": "fabian"}
PHOTO = {"bytes": b"\x89PNGfake", "mime": "image/png", "name": "r.png"}

class D:
    def __init__(self, resp=None, boom=None): self.resp, self.boom, self.sent, self.alerts, self.payloads = resp, boom, [], [], []
    def call(self, p):
        self.payloads.append(p)
        if self.boom: raise self.boom
        return self.resp
    def deps(self): return {"call": self.call, "send": self.sent.append, "alert": lambda *a: self.alerts.append(a) or "email"}

class T(unittest.TestCase):
    def test_recorded_with_charge(self):
        d = D({"ok": True, "bill": 79189.41, "charge": 100, "receiptDebit": 79289.41, "date": "2026-10-21", "reference": "FAKE|1"})
        self.assertEqual(F.handle_receipt(CTX, PHOTO, d.deps()), "recorded")
        self.assertIn("₦100.00", d.sent[0]); self.assertIn("Payment recorded", d.sent[0]); self.assertEqual(d.alerts, [])
        p = d.payloads[0]; self.assertEqual((p["action"], p["rrr"], p["billAmount"], p["part"]), ("record", "161528198373", 79189.41, "a"))
        self.assertEqual(p["receipt"]["mimeType"], "image/png"); self.assertTrue(p["receipt"]["imageBase64"])
    def test_already_recorded(self):
        d = D({"ok": True, "already": True, "bill": 1, "date": "x", "reference": "y"}); self.assertEqual(F.handle_receipt(CTX, PHOTO, d.deps()), "already")
        self.assertIn("already recorded", d.sent[0])
    def test_refusal_goes_to_instinct_not_david(self):
        d = D({"ok": False, "needsPerson": "The receipt is for RRR 1, not 2."}); self.assertEqual(F.handle_receipt(CTX, PHOTO, d.deps()), "needs person")
        self.assertIn("Instinct is looking", d.sent[0]); self.assertNotIn("RRR 1", d.sent[0])      # exact reason is not posted to Telegram
        self.assertEqual(len(d.alerts), 1); self.assertIn("not 2", d.alerts[0][2][1])
    def test_network_error(self):
        d = D(boom=OSError("timeout")); self.assertEqual(F.handle_receipt(CTX, PHOTO, d.deps()), "error")
        self.assertIn("nothing was saved", d.sent[0]); self.assertIn("OSError", d.alerts[0][2][1])
    def test_pdf_and_empty_file_never_call_the_app(self):
        d = D({"ok": True}); F.handle_receipt(CTX, dict(PHOTO, mime="application/pdf"), d.deps()); F.handle_receipt(CTX, None, d.deps())
        self.assertEqual(d.payloads, [])
    def test_http_call_shape(self):
        seen = {}
        class R:
            def __enter__(s): return s
            def __exit__(s, *a): pass
            def read(s): return b'{"ok": true}'
        def op(req, timeout): seen.update(url=req.full_url, tok=req.get_header("X-watchdog-token"), ua=req.get_header("User-agent")); return R()
        F.call_app("https://x.test/", "T", {"a": 1}, op)
        self.assertEqual(seen["url"], "https://x.test/api/internal/remittance-receipt"); self.assertEqual(seen["ua"], "kp-box-satalign/1")
if __name__ == "__main__": unittest.main()
