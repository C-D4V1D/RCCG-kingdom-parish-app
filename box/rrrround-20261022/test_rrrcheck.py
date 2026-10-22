import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rrrcheck as R

OCT = [20790, 884, 26355, 435, 871, 1733.16, 3466.84, 7, 585, 2000, 552.5, 109, 2298.4, 500, 200, 2000, 156.07, 8418.94,
       1740, 1740, 575, 2300, 1150]          # 21 Oct 2026 RRR beneficiary split (23 lines)

class T(unittest.TestCase):
    def test_october_cause(self):
        self.assertEqual(R.half_up_split(8575, [1.82, 98.18]), [R.d("156.07"), R.d("8418.94")])
        self.assertEqual(sum(R.half_up_split(8575, [1.82, 98.18])), R.d("8575.01"))       # the extra kobo
    def test_october_rrr_accepted(self):
        ok, note = R.check_rrr(78866.90, 300, 22.50, 79189.41, OCT)
        self.assertTrue(ok); self.assertEqual(note, "portal rounding +0.01")
    def test_old_strict_rule_would_refuse(self):
        self.assertNotEqual(R.d(78866.90) + R.d(300) + R.d(22.5), R.d(79189.41))          # what make-rrr-email.py compared
    def test_real_mismatches_still_refused(self):
        self.assertFalse(R.check_rrr(78866.90, 300, 22.50, 79189.41 + 5, OCT)[0])         # total off
        self.assertFalse(R.check_rrr(78000.00, 300, 22.50, 79189.41, OCT)[0])             # split far from invoice
        self.assertFalse(R.check_rrr(78866.90, 300, 22.50, 79189.40, OCT)[0])             # total not = split + fees
    def test_exact_case(self):
        self.assertEqual(R.check_rrr(100, 5, 0.38, 105.38, [60, 40]), (True, ""))
if __name__ == "__main__": unittest.main()
