import os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
import relay_switch as R

class T(unittest.TestCase):
    def test_off_on(self):
        f = os.path.join(tempfile.mkdtemp(), "s", "flag")
        self.assertTrue(R.relay_enabled(f)); R.main(["status", "--flag", f]); self.assertTrue(R.relay_enabled(f))
        R.main(["off", "--flag", f]); self.assertFalse(R.relay_enabled(f))
        R.main(["on", "--flag", f]); self.assertTrue(R.relay_enabled(f))
if __name__ == "__main__": unittest.main()
