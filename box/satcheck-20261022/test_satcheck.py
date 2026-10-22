import os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
import satcheck as C

class T(unittest.TestCase):
    def test_zero_lines_dropped(self):
        S = {"allAligned": False, "totalOk": True, "portalLinesAddUp": True, "mismatchLines": [
            {"item": "Coastline Worship Centre", "portal": 0, "app": None},
            {"item": "Insurance Fund (Min Tithe)", "portal": None, "app": None}]}
        ok, bad, ign = C.effective(S)
        self.assertTrue(ok); self.assertEqual(bad, []); self.assertEqual(len(ign), 2); self.assertEqual(C.why(bad), "")
    def test_real_difference_kept(self):
        S = {"allAligned": False, "totalOk": False, "portalLinesAddUp": True, "mismatchLines": [
            {"item": "Open Heavens", "portal": 1400, "app": None}, {"item": "Coastline", "portal": 0, "app": None}]}
        ok, bad, _ = C.effective(S)
        self.assertFalse(ok); self.assertEqual([x["item"] for x in bad], ["Open Heavens"])
        self.assertEqual(C.why(bad), "Why they differ: the portal charges Open Heavens but the app has nothing for it.")
    def test_total_differs_blocks_ok(self):
        S = {"allAligned": False, "totalOk": False, "mismatchLines": [{"item": "x", "portal": 0, "app": None}]}
        self.assertFalse(C.effective(S)[0])
    def test_both_sides(self):
        self.assertIn("different amounts for RMF", C.why([{"item": "RMF", "portal": 300, "app": 200}]))
        self.assertIn("app has Tithe but the portal does not", C.why([{"item": "Tithe", "portal": None, "app": 80}]))
    def test_already_aligned(self):
        self.assertTrue(C.effective({"allAligned": True, "totalOk": True, "portalLinesAddUp": True})[0])
if __name__ == "__main__": unittest.main()
