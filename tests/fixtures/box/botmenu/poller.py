"""Synthetic stand-in for the box's telegram/srcdoc/poller.py (box-botmenu test): only the anchor lines
(compiled, not run)."""
import html, json, os, re, threading, time, traceback
from datetime import datetime

PEOPLE = {}
DAVID = 0
SATP = {}


def log(*a):
    pass


def handle_callback(st, cq):
    pass


def main():
    while True:
        try: C.balance_events_check()  # bankbalance-fastcheck-20261001: near-instant Refresh pickup
        except Exception: pass
        break
