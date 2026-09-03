#!/usr/bin/env python3
"""Unpack the packed output of extract_events_bq.sql into the flat events.tsv
that sessionise.py reads.

Input: one or more JSON files, each the saved result of an MCP run_sql call
(either {"result": {"rows": [...]}} or a bare list of rows). Each row holds
user_uuid, project_uuid, day, n and `events` (a JSON array string).

Usage:
  python3 unpack_events.py page1.json page2.json ... > events.tsv
"""
import json
import sys


def rows_of(path: str):
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    if isinstance(doc, dict):
        doc = doc.get("result", doc).get("rows", [])
    return doc


def main() -> int:
    seen = set()
    total = 0
    for path in sys.argv[1:]:
        for row in rows_of(path):
            key = (row["user_uuid"], row["project_uuid"], row["day"])
            if key in seen:
                continue
            seen.add(key)
            for ev in json.loads(row["events"]):
                payload = ev.get("payload") or ""
                # payload is already a JSON string from TO_JSON_STRING
                sys.stdout.write("\t".join([
                    row["user_uuid"], row["user_uuid"], row["project_uuid"], ev["ts"], ev["kind"],
                    ev.get("context") or "", ev.get("explore") or "", ev.get("ref_uuid") or "",
                    payload.replace("\t", " ").replace("\n", " "),
                ]) + "\n")
                total += 1
    sys.stderr.write(f"groups {len(seen)} events {total}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
