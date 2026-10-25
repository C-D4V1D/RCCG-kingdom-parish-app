"""Switch for the old Telegram-to-WhatsApp relay. Ships SEPARATE from the email forward and does nothing until run.

    python3 relay_switch.py status|off|on [--flag PATH]

`off` creates the flag file; `on` removes it. The relay's send path must call relay_enabled() and skip when it returns False.
Run `off` only after Instinct (main) confirms the email forward is measured working and delivering.
"""
import argparse, os, sys

FLAG = "/workspace/state/tg-relay-off"


def relay_enabled(flag=FLAG):
    return not os.path.exists(flag)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "off", "on"])
    ap.add_argument("--flag", default=FLAG)
    a = ap.parse_args(argv)
    if a.cmd == "off":
        os.makedirs(os.path.dirname(a.flag) or ".", exist_ok=True)
        open(a.flag, "w").write("relay off\n")
    elif a.cmd == "on" and os.path.exists(a.flag):
        os.remove(a.flag)
    print("relay " + ("on" if relay_enabled(a.flag) else "off"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
