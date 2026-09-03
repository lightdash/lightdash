#!/usr/bin/env python3
"""Fill chart/dashboard names into events.tsv from an id→name lookup.

The raw saved_chart_view / dashboard_view telemetry events carry null names, so
the names are joined afterwards from the analytics charts/dashboards models.

Usage: python3 apply_names.py names.json < events.tsv > events_named.tsv
names.json: saved run_sql result with rows of {kind: 'chart'|'dash', id, name}.
"""
import json
import sys

doc = json.load(open(sys.argv[1], encoding="utf-8"))
rows = doc.get("result", doc).get("rows", []) if isinstance(doc, dict) else doc
names = {(r["kind"], r["id"]): r["name"] for r in rows}
hit = miss = 0
for line in sys.stdin:
    parts = line.rstrip("\n").split("\t")
    if len(parts) != 9:
        continue
    kind, ref, payload = parts[4], parts[7], parts[8]
    try:
        p = json.loads(payload) if payload else {}
    except json.JSONDecodeError:
        p = {}
    if kind == "dash_view" and not p.get("dashboard_name"):
        name = names.get(("dash", ref)); p["dashboard_name"] = name
        hit += name is not None; miss += name is None
    elif kind == "chart_view" and not p.get("chart_name"):
        name = names.get(("chart", ref)); p["chart_name"] = name
        hit += name is not None; miss += name is None
    parts[8] = json.dumps(p, ensure_ascii=False)
    sys.stdout.write("\t".join(parts) + "\n")
sys.stderr.write(f"named {hit} unresolved {miss}\n")
