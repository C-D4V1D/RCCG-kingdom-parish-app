import datetime, json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, "..", "satalign-20261022"))
import alerts as A, tgforward as F

class Clock:
    t = datetime.datetime(2026, 10, 22, 14, 0, 0)
    def __call__(self): return self.t

class TR(unittest.TestCase):
    def setUp(self):
        self.out, self.clock, self.ok = [], Clock(), {"mail": True, "topic": True}
        d = {"mail": lambda to, s, b: (self.out.append(("mail", to, s, b)) or self.ok["mail"]),
             "topic": lambda t: (self.out.append(("topic", t)) or self.ok["topic"]),
             "ping": lambda t: (self.out.append(("ping", t)) or True), "now": self.clock}
        self.r = A.ErrorRouter(os.path.join(tempfile.mkdtemp(), "e.json"), d)
    def pings(self): return [o for o in self.out if o[0] == "ping"]
    def test_classes(self):
        c = A.classify
        self.assertEqual(c("money"), "money"); self.assertEqual(c("data_loss"), "data_loss")
        self.assertEqual(c("box_down", {"recovered": True, "fix_certain": True}), "quiet_box_down")
        self.assertEqual(c("box_down", {"recovered": False}), "uncertain")
        self.assertEqual(c("filing", {"earlier_attempt": "not_landed", "refiled_ok": True}), "quiet_filing")
        for fa in ({"earlier_attempt": "unknown", "refiled_ok": True}, {"earlier_attempt": "landed", "refiled_ok": True},
                   {"earlier_attempt": "not_landed", "refiled_ok": False}, {}, None):
            self.assertEqual(c("filing", fa), "filing_unverified", fa)
        self.assertEqual(c("weird"), "uncertain"); self.assertEqual(c("other", {"fix_certain": True}), "quiet_other")
        self.assertEqual(c("other", {}), "uncertain")
    def test_quiet_error_emails_instinct_only(self):
        r = self.r.report("monthend", "Connection reset at 14:00:03", "box_down", {"recovered": True, "fix_certain": True})
        self.assertEqual((r["how"], r["ping"]), ("email", False)); self.assertEqual(self.pings(), [])
        m = self.out[0]; self.assertEqual(m[1], "cdavid@mail.instinct.com"); self.assertEqual(m[2], "[Instinct-alert] clerk-box monthend")
        j = json.loads(m[3]); self.assertEqual(j["error"], "Connection reset at 14:00:03"); self.assertEqual(j["component"], "monthend"); self.assertIn("time", j)
    def test_critical_pings_david_too(self):
        r = self.r.report("rrr", "Remita 500", "money"); self.assertTrue(r["ping"]); self.assertEqual(len(self.pings()), 1)
        self.assertNotIn("Remita 500", self.pings()[0][1])          # details only go to Instinct
    def test_dedupe_window_and_after(self):
        self.r.report("c", "boom 14:00:01", "data_loss")
        self.assertEqual(self.r.report("c", "boom 14:07:55", "data_loss")["how"], "duplicate")   # times are ignored
        self.assertEqual(len(self.pings()), 1)
        self.clock.t += datetime.timedelta(hours=7)
        self.assertEqual(self.r.report("c", "boom 21:00:00", "data_loss")["how"], "email")
        self.assertEqual(self.r.report("c", "different error", "data_loss")["how"], "email")
    def test_mail_fail_uses_topic_then_retries(self):
        self.ok["mail"] = False; self.assertEqual(self.r.report("c", "e", "other")["how"], "topic")
        self.ok.update(mail=False, topic=False); self.assertEqual(self.r.report("d", "e", "other")["how"], "failed")
        self.ok["mail"] = True; self.assertEqual(self.r.report("d", "e", "other")["how"], "email")

class TF(unittest.TestCase):
    def setUp(self):
        self.out, self.ok = [], [True]
        d = {"is_david": lambda u: u == 42, "topic_name": lambda c, t: {7: "Remittance"}.get(t),
             "mail": lambda to, s, b: (self.out.append((to, s, b)) or self.ok[0])}
        self.f = F.Forwarder(os.path.join(tempfile.mkdtemp(), "f.json"), d)
    def U(self, mid=1, uid=42, **kw):
        m = {"message_id": mid, "from": {"id": uid}, "chat": {"id": -100}, "date": 1792677600, "text": "Please file it", "message_thread_id": 7}; m.update(kw)
        return {"message": m}
    def test_forward_content(self):
        self.assertEqual(self.f.forward(self.U()), "sent")
        to, s, b = self.out[0]; self.assertEqual(to, "cdavid@mail.instinct.com"); self.assertEqual(s, "[David-telegram] Remittance")
        for x in ("Please file it", "topic: Remittance", "message id: 1", "chat id: -100"): self.assertIn(x, b)
    def test_others_skipped_and_no_double(self):
        self.assertEqual(self.f.forward(self.U(uid=5)), "skipped"); self.assertEqual(self.out, [])
        self.f.forward(self.U()); self.assertEqual(self.f.forward(self.U()), "duplicate"); self.assertEqual(len(self.out), 1)
    def test_general_media_and_queue(self):
        u = self.U(mid=2); u["message"].pop("message_thread_id"); u["message"].pop("text"); u["message"]["photo"] = [{}]; u["message"]["caption"] = "slip"
        self.f.forward(u); self.assertEqual(self.out[0][1], "[David-telegram] general"); self.assertIn("[photo] slip", self.out[0][2])
        self.ok[0] = False; self.assertEqual(self.f.forward(self.U(mid=3)), "queued")
        self.ok[0] = True; n = len(self.out); self.f.flush(); self.assertEqual(len(self.out), n + 1)
        self.assertEqual(self.f.forward(self.U(mid=3)), "duplicate")

class TN(unittest.TestCase):
    def test_updater_notice_is_quiet_email_only(self):
        import instinct_notify as N
        out = []
        d = {"mail": lambda to, s, b: out.append((to, s, b)) or True, "topic": lambda t: False, "ping": lambda t: out.append("PING") or True}
        rc = N.main(["--component", "updater", "--kind", "other", "--fix-certain", "--error", "update skipped: files edited by hand: a.py"],
                    d, os.path.join(tempfile.mkdtemp(), "s.json"))
        self.assertEqual(rc, 0); self.assertEqual(len(out), 1)
        self.assertEqual(out[0][1], "[Instinct-alert] clerk-box updater"); self.assertIn("edited by hand", out[0][2])
    def test_unknown_filing_is_critical(self):
        import instinct_notify as N
        out = []
        d = {"mail": lambda to, s, b: out.append("mail") or True, "topic": lambda t: False, "ping": lambda t: out.append("PING") or True}
        N.main(["--component", "filing", "--kind", "filing", "--error", "x"], d, os.path.join(tempfile.mkdtemp(), "s.json"))
        self.assertEqual(out, ["mail", "PING"])

if __name__ == "__main__": unittest.main()
