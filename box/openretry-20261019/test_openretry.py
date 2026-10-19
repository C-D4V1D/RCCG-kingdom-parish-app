import datetime, importlib, json, os, shutil, sys, tempfile, unittest
SRC = os.path.dirname(os.path.abspath(__file__))
TOOLSRC = os.environ.get("TOOLS_SRC", "/workspace/tools")

def setup():
    root = tempfile.mkdtemp()
    os.environ["CLERK_ROOT"] = root
    for d in ("tools", "rccg-remit/state", "state/monthend"):
        os.makedirs(os.path.join(root, d))
    for f in ("monthend.py", "monthinfo.py", "clerkcfg.py"):
        if os.path.exists(os.path.join(TOOLSRC, f)):
            shutil.copy(os.path.join(TOOLSRC, f), os.path.join(root, "tools", f))
    shutil.copy(os.path.join(SRC, "openretry.py"), os.path.join(root, "tools", "openretry.py"))
    for m in ("monthend", "monthinfo", "clerkcfg", "openretry"):
        sys.modules.pop(m, None)
    sys.path.insert(0, os.path.join(root, "tools"))
    O = importlib.import_module("openretry")
    return root, O

BOX = {"event": "cutoff_collection_saved", "collectionDate": "2026-10-18", "periodStart": "2026-09-21", "periodEnd": "2026-10-18",
       "action": "created", "recordId": "INC-1", "savedAt": "2026-10-18T14:10:11Z", "parish": "602757", "month": "2026-10", "handler": "box"}

class T(unittest.TestCase):
    def mk(self, day, rc, cutoff=21, enabled=True, key="2026-09-21..2026-10-18"):
        root, O = setup(); M = O.M
        M.wjson(M.STATE, {key: {"month": "2026-10", "status": "failed", "handler": "box", "boxEvent": dict(BOX),
                               "failure": {"step": "1e pre-check", "message": "remittance is not open on the portal for this month yet"}}})
        if enabled: open(O.ENABLED, "w").write("1")
        self.calls = {"node": 0, "tg": [], "live": [], "ping": []}
        O.MI.app_get = lambda p: {"remCutoffDatesByYear": {"2026": [0, 0, 0, 0, 0, 0, 0, 0, 20, cutoff, 0, 0]}}
        O.today = lambda: datetime.date(2026, 10, day)
        def node(*a, **k):
            self.calls["node"] += 1; return rc, {}, ""
        M.node = node
        M.tg = lambda who, text, key: self.calls["tg"].append((who, text, key))
        M.live_cutoff = lambda ev, resumed=False: self.calls["live"].append((ev, resumed))
        M.log = lambda *a, **k: None
        O.ping = lambda s="": self.calls["ping"].append(s)
        return root, O, M

    def test_disabled(self):
        _, O, _ = self.mk(21, 0, enabled=False)
        self.assertEqual(O.run_once(), "disabled"); self.assertEqual(self.calls["node"], 0)

    def test_before_cutoff_date_no_portal_check(self):
        _, O, _ = self.mk(20, 0)
        self.assertEqual(O.run_once(), "waiting"); self.assertEqual(self.calls["node"], 0)

    def test_portal_closed_is_silent(self):
        _, O, _ = self.mk(21, 10)
        self.assertEqual(O.run_once(), "waiting"); self.assertEqual(self.calls["node"], 1)
        self.assertEqual(self.calls["tg"], []); self.assertEqual(self.calls["live"], [])

    def test_api_trouble_is_silent_no_start(self):
        _, O, _ = self.mk(21, 11)
        self.assertEqual(O.run_once(), "waiting"); self.assertEqual(self.calls["tg"], []); self.assertEqual(self.calls["live"], [])

    def test_open_starts_once_with_app_cutoff(self):
        _, O, M = self.mk(21, 0)
        self.assertEqual(O.run_once(), "started")
        self.assertEqual(len(self.calls["tg"]), 1); self.assertEqual(len(self.calls["live"]), 1)
        ev, resumed = self.calls["live"][0]
        self.assertEqual((ev["periodStart"], ev["periodEnd"], ev["month"], resumed), ("2026-09-21", "2026-10-21", "2026-10", False))
        self.assertEqual(ev["recordId"], "INC-1")
        self.assertEqual(O.run_once(), "waiting")  # never twice
        self.assertEqual(len(self.calls["live"]), 1)

    def test_same_period_goes_through_held_resume(self):
        _, O, M = self.mk(18, 0, cutoff=18)
        # the stub live_cutoff leaves the state as set by the hold step
        self.assertEqual(O.run_once(), "started")
        ev, resumed = self.calls["live"][0]
        self.assertTrue(resumed); self.assertEqual(ev["periodEnd"], "2026-10-18")
        self.assertEqual(M.rjson(M.STATE)["2026-09-21..2026-10-18"]["status"], "held")

    def test_settings_unreadable_raises_for_health_alarm(self):
        _, O, _ = self.mk(21, 0)
        def bad(p): raise OSError("down")
        O.MI.app_get = bad
        with self.assertRaises(RuntimeError): O.run_once()
        self.assertEqual(O.main(), 1); self.assertIn("/fail", self.calls["ping"])

    def test_main_pings_ok_when_waiting(self):
        _, O, _ = self.mk(21, 10)
        self.assertEqual(O.main(), 0); self.assertEqual(self.calls["ping"], [""])

if __name__ == "__main__":
    unittest.main(verbosity=2)
