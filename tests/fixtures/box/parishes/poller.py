"""Test fixture: only the anchor lines of the Clerk box poller.py that the satellite-parishes patch changes (the test fills in the admin id)."""
import json, os, re, subprocess, threading, traceback
import clerkcfg as C
PEOPLE = {111: "David", 222: "Someone"}
DAVID = C.bot_admin(__DAVID__)
PNAME = {"602757": "Kingdom Parish"}


def notify(st):
    for pid, name in PEOPLE.items():
        print(pid, name)


def first():
    for pid in PEOPLE:
        print(pid)


def second():
    for pid in PEOPLE:
        print(pid)


def finish(st, chat, b, ok):
    if ok:
        b["parish"] = "602757"
    else: b["parish"] = "602757"; _preview(st, chat, b)


def handle_callback(st, cq):
    chat = cq["from"]["id"]; data = cq.get("data") or ""
    return data


def handle_message(st, msg):
    chat = msg.get("chat", {}); frm = msg.get("from", {})
    if chat.get("type") == "private" and ((msg.get("text") or "").strip().lower().split("@")[0].split() or [""])[0] == "/paid":
        return
    return frm
