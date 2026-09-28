#!/usr/bin/env python3
"""Month-end update (monthend-20261001): let the app's Remittance lines drive the box's mapping. All or nothing.

  python3 patch.py --check    only test that every change fits the files on this box (changes nothing)
  python3 patch.py            apply (each file is changed only if EVERY change for EVERY file fits and compiles)

A change finds its line by content (spaces don't matter) and must find it exactly once.
Files that already carry the marker are skipped, so running it twice is safe."""
import os, py_compile, re, shutil, subprocess, sys, tempfile

ROOT = os.environ.get("CLERK_ROOT", "/workspace")
MARK = "monthend-20261001"


def norm(s):
    return re.sub(r"\s+", " ", s.strip())


# (op, anchor, lines)   op: replace | before | after.  anchor "^..." = the line starts with that text.
P = {}

# remit_match.py: the app's Automations -> Remittance lines (saved in the app, read through clerkcfg.py) replace the
# built-in category -> portal line list. No saved lines (or any error) -> the built-in lists, exactly as before.
P["rccg-remit/remit_match.py"] = [
    ("after", "WEEKLY_FORM_QUOTAS = ['Regional Contribution']", [
        "# " + MARK + ": the app's Automations -> Remittance lines override the two lists above once saved in the app.",
        "# NOT_REMITTED_APP_KEYS = categories David marked 'Not remitted (stays in the parish)': never entered on the portal.",
        "NOT_REMITTED_APP_KEYS = set()",
        "try:",
        "    import sys as _sys",
        "    if '/workspace/tools' not in _sys.path: _sys.path.insert(0, '/workspace/tools')",
        "    import clerkcfg as _C",
        "    _o = _C.remittance_overrides(APP_KEY_TO_WEEKLY_LINE, UNMAPPED_APP_KEYS)",
        "    if _o: APP_KEY_TO_WEEKLY_LINE, UNMAPPED_APP_KEYS, NOT_REMITTED_APP_KEYS = [list(_o[0]), dict(_o[1]), set(_o[2])]",
        "except Exception:",
        "    pass"]),
]

# api-fill.js: two categories on the same portal line are added together (the portal takes one amount per line per week).
P["rccg-remit/api-fill.js"] = [
    ("replace", "for (const [k, nm] of map.weekly) if (c[k]) entries.push([nm, c[k]]);", [
        "for (const [k, nm] of map.weekly) if (c[k]) { // " + MARK + ": categories sharing a portal line are added together",
        "  const e = entries.find(x => x[0] === nm); if (e) e[1] = r2(e[1] + c[k]); else entries.push([nm, c[k]]);",
        "}"]),
]


def apply_ops(text, ops, name):
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(nl)
    for spec in ops:
        op, anchor, new = spec[0], spec[1], spec[2]
        nth = spec[3] if len(spec) > 3 else None
        pre = anchor.startswith("^")
        a = norm(anchor[1:] if pre else anchor)
        hits = [i for i, l in enumerate(lines) if (norm(l).startswith(a) if pre else norm(l) == a)]
        if nth is not None:
            if len(hits) < nth:
                raise ValueError(f"{name}: line not found (#{nth}): {anchor[:70]}")
            i = hits[nth - 1]
        else:
            if len(hits) != 1:
                raise ValueError(f"{name}: expected 1 match, found {len(hits)}: {anchor[:70]}")
            i = hits[0]
        ind = re.match(r"[ \t]*", lines[i]).group(0)
        block = [ind + x if x else x for x in new]
        if op == "replace":
            lines[i:i + 1] = block
        elif op == "before":
            lines[i:i] = block
        elif op == "after":
            lines[i + 1:i + 1] = block
    out = nl.join(lines)
    if not out.endswith(nl):
        out += nl
    return out + (("// " if name.endswith(".js") else "# ") + MARK + nl)


def check_syntax(path, name):
    if name.endswith(".py"):
        py_compile.compile(path, doraise=True)
    elif name.endswith(".js"):
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        if r.returncode:
            raise ValueError(f"{name}: javascript syntax: {r.stderr.strip()[:200]}")
    else:
        shell = "sh" if open(path).readline().startswith("#!/bin/sh") else "bash"
        r = subprocess.run([shell, "-n", path], capture_output=True, text=True)
        if r.returncode:
            raise ValueError(f"{name}: shell syntax: {r.stderr.strip()[:200]}")


def main():
    check = "--check" in sys.argv
    tmp = tempfile.mkdtemp(prefix="clerk-patch-")
    staged, skipped, errors = [], [], []
    for name, ops in P.items():
        src = os.path.join(ROOT, name)
        try:
            text = open(src, encoding="utf-8").read()
        except Exception as e:
            errors.append(f"{name}: cannot read ({e})"); continue
        if MARK in text:
            skipped.append(name); continue
        try:
            out = apply_ops(text, ops, name)
            dst = os.path.join(tmp, name.replace("/", "__"))
            open(dst, "w", encoding="utf-8").write(out)
            check_syntax(dst, name)
            staged.append((src, dst, name))
        except Exception as e:
            errors.append(str(e).splitlines()[0][:300])
    if errors:
        print("NOT CHANGED. These changes did not fit this box's files:")
        for e in errors: print("  -", e)
        shutil.rmtree(tmp, ignore_errors=True); sys.exit(1)
    if check:
        print(f"CHECK OK: {len(staged)} file(s) would be changed" + (f", {len(skipped)} already done" if skipped else ""))
        shutil.rmtree(tmp, ignore_errors=True); return
    for src, dst, name in staged:
        shutil.copymode(src, dst)
        os.replace(dst, src) if os.stat(src).st_dev == os.stat(dst).st_dev else shutil.copyfile(dst, src)
        print("patched", name)
    for name in skipped: print("already patched", name)
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
