"""Pure helpers for the satellite remittance check message (no I/O, no secrets).

effective(S)  -> (ok, bad, ignored): drops lines where the portal charges nothing (0 or absent) and the app has nothing.
                 Those are not differences. ok = nothing left to differ, the total matches, the portal lines add up.
why(bad)      -> one plain-English line explaining the differences left, or "" when there are none.
"""


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def effective(S):
    S = S or {}
    bad, ignored = [], []
    for x in (S.get("mismatchLines") or []):
        portal, app = _num(x.get("portal")), _num(x.get("app"))
        if (portal is None or abs(portal) < 1) and app is None:
            ignored.append(x)
        else:
            bad.append(x)
    ok = bool(S.get("allAligned")) or (not bad and S.get("totalOk", True) and S.get("portalLinesAddUp", True))
    ok = bool(ok) and bool(S.get("totalOk", True)) and bool(S.get("portalLinesAddUp", True))
    return ok, bad, ignored


def why(bad):
    only_portal, only_app, both = [], [], []
    for x in bad:
        portal, app = _num(x.get("portal")), _num(x.get("app"))
        item = str(x.get("item") or "a line")
        if app is None and portal:
            only_portal.append(item)
        elif portal is None and app:
            only_app.append(item)
        else:
            both.append(item)
    parts = []
    if only_portal:
        parts.append("the portal charges " + ", ".join(only_portal[:2]) + " but the app has nothing for it")
    if only_app:
        parts.append("the app has " + ", ".join(only_app[:2]) + " but the portal does not")
    if both:
        parts.append("the portal and the app have different amounts for " + ", ".join(both[:2]))
    return ("Why they differ: " + "; ".join(parts) + ".") if parts else ""
