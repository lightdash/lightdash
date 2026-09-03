#!/usr/bin/env python3
"""Prepare an application-DB events.tsv for reading.

Hashes user ids and emails, drops machine contexts, and collapses the
high-volume UI plumbing to one event per user/object/minute so that the same
episode rules apply as in the telemetry run:
  chart_view            -> one per user/project/minute (n views, k charts)
  dash_view             -> one per user/project/dashboard/minute
  query dashboardView   -> one per user/project/minute (one dashboard load, n tiles)
  query metricsExplorer -> one per user/project/explore/minute (first shape kept)
Dropped: api, cli, calculateTotal, calculateSubtotal.

Usage: python3 prepare_events.py < events.tsv > events_prepared.tsv
"""
import hashlib
import json
import sys
from collections import OrderedDict

DROP = {"api", "cli", "calculateTotal", "calculateSubtotal"}


def h(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:10]


groups: "OrderedDict[tuple, list]" = OrderedDict()
out = []
dropped = 0
for line in sys.stdin:
    parts = line.rstrip("\n").split("\t")
    if len(parts) != 9:
        continue
    user, email, project, ts, kind, ctx, explore, ref, payload = parts
    if ctx in DROP:
        dropped += 1
        continue
    parts[0] = h(user)
    parts[1] = h(email or user)
    minute = ts[:16]
    key = None
    if kind == "chart_view":
        key = (parts[0], project, "chart_view", minute)
    elif kind == "dash_view":
        key = (parts[0], project, "dash_view", ref, minute)
    elif kind == "query" and ctx == "dashboardView":
        # query_history keys tile queries by chart, so one dashboard load is many
        # rows: collapse per user/project/minute (one load, n tiles)
        key = (parts[0], project, "q_dash", minute)
    elif kind == "query" and ctx == "metricsExplorer":
        key = (parts[0], project, "q_me", explore, minute)
    if key is None:
        out.append(parts)
    else:
        groups.setdefault(key, []).append(parts)

for key, rows in groups.items():
    first = rows[0]
    try:
        p = json.loads(first[8]) if first[8] else {}
    except json.JSONDecodeError:
        p = {}
    p["n"] = len(rows)
    if key[2] == "chart_view":
        names = []
        for r in rows:
            try:
                nm = json.loads(r[8]).get("chart_name")
            except Exception:
                nm = None
            if nm and nm not in names:
                names.append(nm)
        p["charts"] = len({r[7] for r in rows})
        p["chart_name"] = " | ".join(names[:4])
    first[8] = json.dumps(p, ensure_ascii=False)
    out.append(first)

out.sort(key=lambda r: (r[0], r[2], r[3]))
for r in out:
    sys.stdout.write("\t".join(r) + "\n")
sys.stderr.write(f"in-groups {sum(len(v) for v in groups.values())} collapsed-to {len(groups)} dropped {dropped} out {len(out)}\n")
