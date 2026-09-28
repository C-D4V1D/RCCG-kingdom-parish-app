"""Test fixture: the part of the Clerk box's /workspace/tools/clerkinfo.py that the collection-reminders update changes."""
import json
def att_lines(runs, months):
    L = []
    for m in months:
        lab = m
        if m in runs: L.append(f"{lab}: filed on the portal"); continue
        L.append(f"{lab}: not filed")
    return L
