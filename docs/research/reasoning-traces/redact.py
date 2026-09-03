#!/usr/bin/env python3
"""Replace customer organisation names in a rendered episodes.md with [customer].

Usage: python3 redact.py names.json < episodes.md > episodes.redacted.md
names.json: a JSON list of organisation names (not committed).
"""
import json
import re
import sys

names = sorted({n for n in json.load(open(sys.argv[1], encoding="utf-8")) if len(n) >= 4}, key=len, reverse=True)
pattern = re.compile(r"(?<![A-Za-z0-9])(" + "|".join(re.escape(n) for n in names) + r")(?![A-Za-z0-9])", re.IGNORECASE)
text = sys.stdin.read()
out, n = pattern.subn("[customer]", text)
sys.stderr.write(f"redacted {n} occurrences\n")
sys.stdout.write(out)
