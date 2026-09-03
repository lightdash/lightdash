#!/usr/bin/env python3
"""Stitch Lightdash usage events into analysis episodes and render them as traces.

Input: the TSV produced by extract_events.sql (one event per line).
Output:
  episodes.jsonl   one JSON object per episode
  episodes.md      the sample of episodes rendered as readable traces
  stdout           summary statistics

Usage:
  python3 sessionise.py events.tsv --gap-minutes 20 --sample 50 --out-dir ./out

Sessionisation rule: one user, one project, consecutive events less than
--gap-minutes apart. Each query step is diffed against the previous query step in
the same episode so the trace reads as "added X, removed Y, filtered Z" instead
of a dump of field lists.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta

EXPLORATION_CONTEXTS = {
    "exploreView", "viewUnderlyingData", "sqlRunner", "composeSqlRunner",
    "multiSourceQuery", "calculateTotal", "calculateSubtotal",
}
# The metrics catalog auto-runs a preview per visible metric; a step there is
# browsing, not a deliberate query. Counted as neither exploration nor consumption.
BROWSE_CONTEXTS = {"metricsExplorer"}
CONSUMPTION_CONTEXTS = {"dashboardView", "chartView", "sqlChartView", "embed", "chartHistory"}
AGENT_CONTEXTS = {"ai", "mcp.run_metric_query", "mcp.run_sql", "mcp.search_field_values"}


MAX_RENDERED_STEPS = 80


@dataclass
class Event:
    user_uuid: str
    email: str
    project_uuid: str
    ts: datetime
    kind: str
    context: str
    explore: str | None
    ref_uuid: str | None
    payload: dict


@dataclass
class Episode:
    user_uuid: str
    email: str
    project_uuid: str
    events: list[Event] = field(default_factory=list)

    @property
    def start(self) -> datetime:
        return self.events[0].ts

    @property
    def end(self) -> datetime:
        return self.events[-1].ts

    @property
    def minutes(self) -> float:
        return (self.end - self.start).total_seconds() / 60


def parse_line(line: str) -> Event | None:
    parts = line.rstrip("\n").split("\t")
    if len(parts) != 9:
        return None
    user_uuid, email, project_uuid, ts, kind, context, explore, ref_uuid, payload = parts
    try:
        payload_obj = json.loads(payload) if payload else {}
    except json.JSONDecodeError:
        payload_obj = {}
    return Event(
        user_uuid=user_uuid,
        email=email,
        project_uuid=project_uuid,
        ts=datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ"),
        kind=kind,
        context=context,
        explore=explore or None,
        ref_uuid=ref_uuid or None,
        payload=payload_obj,
    )


def read_events(path: str) -> list[Event]:
    events: list[Event] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            ev = parse_line(line)
            if ev is not None:
                events.append(ev)
    events.sort(key=lambda e: (e.user_uuid, e.project_uuid, e.ts))
    return events


def sessionise(events: list[Event], gap: timedelta) -> list[Episode]:
    episodes: list[Episode] = []
    current: Episode | None = None
    for ev in events:
        same = (
            current is not None
            and current.user_uuid == ev.user_uuid
            and current.project_uuid == ev.project_uuid
            and ev.ts - current.end < gap
        )
        if not same:
            current = Episode(ev.user_uuid, ev.email, ev.project_uuid)
            episodes.append(current)
        current.events.append(ev)
    return episodes


def filter_fields(filters: dict | None) -> list[str]:
    """Flatten a Filters object to 'fieldId operator' strings."""
    out: list[str] = []

    def walk(group):
        if not isinstance(group, dict):
            return
        items = group.get("and") or group.get("or") or []
        for item in items:
            if not isinstance(item, dict):
                continue
            if "and" in item or "or" in item:
                walk(item)
                continue
            target = item.get("target") or {}
            field_id = target.get("fieldId")
            if field_id:
                out.append(f"{field_id} {item.get('operator', '?')}")

    for key in ("dimensions", "metrics", "tableCalculations"):
        walk((filters or {}).get(key))
    return out


COUNT_KEYS = (("mets", "metric"), ("dims", "dimension"), ("filters", "filter"), ("sorts", "sort"), ("tc", "table calc"), ("addl", "custom metric"), ("custom_sql", "custom dimension"))


def count_shape(p: dict) -> dict:
    """Telemetry payloads carry field counts, not field ids (see extract_events_bq.sql)."""
    return {"counts": {k: int(p.get(k) or 0) for k, _ in COUNT_KEYS}}


def diff_counts(prev: dict | None, cur: dict) -> str:
    c = cur["counts"]
    if prev is None or "counts" not in prev:
        parts = [f"{c[k]} {label}{'s' if c[k] != 1 else ''}" for k, label in COUNT_KEYS if c[k]]
        return "starts: " + (", ".join(parts) if parts else "empty query")
    changes = []
    for k, label in COUNT_KEYS:
        d = c[k] - prev["counts"][k]
        if d:
            changes.append(f"{'+' if d > 0 else ''}{d} {label}{'s' if abs(d) != 1 else ''}")
    return "; ".join(changes) if changes else "re-run, same shape"


def query_shape(ev: Event) -> dict:
    p = ev.payload
    if isinstance(p.get("dims"), int) or isinstance(p.get("mets"), int):
        return count_shape(p)
    return {
        "dimensions": list(p.get("dimensions") or []),
        "metrics": list(p.get("metrics") or []) + list(p.get("additionalMetrics") or []),
        "filters": filter_fields(p.get("filters")),
        "sorts": [f"{s.get('fieldId')}{' desc' if s.get('descending') else ''}" for s in (p.get("sorts") or []) if isinstance(s, dict)],
        "custom": list(p.get("customDimensions") or []) + list(p.get("tableCalculations") or []),
    }


def diff_shape(prev: dict | None, cur: dict) -> str:
    if "counts" in cur:
        return diff_counts(prev, cur)
    if prev is None:
        parts = []
        if cur["metrics"]:
            parts.append("metrics " + ", ".join(cur["metrics"]))
        if cur["dimensions"]:
            parts.append("by " + ", ".join(cur["dimensions"]))
        if cur["filters"]:
            parts.append("where " + "; ".join(cur["filters"]))
        if cur["custom"]:
            parts.append("custom " + ", ".join(cur["custom"]))
        return "starts: " + (" | ".join(parts) if parts else "empty query")
    if "counts" in prev:
        return diff_shape(None, cur)
    changes = []
    for key, label in (("metrics", "metric"), ("dimensions", "dimension"), ("filters", "filter"), ("custom", "custom field")):
        added = [x for x in cur[key] if x not in prev[key]]
        removed = [x for x in prev[key] if x not in cur[key]]
        if added:
            changes.append(f"+{label} " + ", ".join(added))
        if removed:
            changes.append(f"-{label} " + ", ".join(removed))
    if prev["sorts"] != cur["sorts"] and cur["sorts"]:
        changes.append("sort " + ", ".join(cur["sorts"]))
    return "; ".join(changes) if changes else "re-run, same shape"


def describe(ev: Event, prev_shape: dict | None) -> tuple[str, dict | None]:
    p = ev.payload
    if ev.kind == "query":
        shape = query_shape(ev)
        where = ev.context
        head = f"{where} · {ev.explore or 'sql'}"
        if ev.context in ("sqlRunner", "composeSqlRunner", "mcp.run_sql"):
            text = "runs SQL"
            shape = None
        else:
            text = diff_shape(prev_shape, shape)
        tail = []
        if p.get("n") and p.get("n") > 1:
            tail.append(f"{p['n']} queries")
        if p.get("status") == "error":
            tail.append("ERROR " + (p.get("error") or "")[:80])
        elif p.get("rows") is not None:
            tail.append(f"{p['rows']} rows")
        # A side look at underlying rows is a detour: describe it, but keep the
        # explore baseline so the next explore step diffs against the real path.
        next_shape = prev_shape if ev.context == "viewUnderlyingData" else shape
        return f"{head} — {text}" + (f" ({'; '.join(tail)})" if tail else ""), next_shape
    if ev.kind == "chart_save":
        verb = "creates chart" if p.get("is_first_version") else "updates chart"
        return f"{verb} “{p.get('chart_name')}” ({p.get('chart_type')}, {ev.explore})", prev_shape
    if ev.kind == "dash_save":
        return f"saves dashboard “{p.get('dashboard_name')}”", prev_shape
    if ev.kind == "chart_view":
        extra = f" (+{p['charts'] - 1} more)" if p.get("charts", 1) > 1 else ""
        return f"views chart “{p.get('chart_name')}”{extra}", prev_shape
    if ev.kind == "dash_view":
        return f"views dashboard “{p.get('dashboard_name')}”", prev_shape
    if ev.kind == "ai_prompt":
        text = f"asks agent: “{(p.get('prompt') or '').strip()}”"
        if p.get("human_score") is not None:
            text += f" [score {p['human_score']}]"
        if p.get("human_feedback"):
            text += f" [feedback: {p['human_feedback']}]"
        if p.get("dimensions") or p.get("metrics"):
            shape = query_shape(ev)
            text += " → agent " + diff_shape(prev_shape, shape).replace("starts: ", "queries ")
        return text, prev_shape
    return f"{ev.kind} {ev.context}", prev_shape


def classify(ep: Episode) -> str:
    contexts = Counter(e.context for e in ep.events)
    kinds = Counter(e.kind for e in ep.events)
    exploring = sum(v for k, v in contexts.items() if k in EXPLORATION_CONTEXTS)
    # a prompt, or a query the agent / MCP ran on the person's behalf
    agent = kinds.get("ai_prompt", 0) + sum(v for k, v in contexts.items() if k in AGENT_CONTEXTS and v)
    saves = kinds.get("chart_save", 0) + kinds.get("dash_save", 0)
    if exploring == 0 and agent == 0:
        return "consumption"
    if exploring >= 2 and saves > 0:
        return "exploration→save"
    if exploring >= 2:
        return "exploration, no save"
    if agent > 0 and exploring == 0:
        return "agent only"
    return "single query"


def render(ep: Episode, index: int) -> str:
    lines = [f"## Episode {index} · {ep.email} · {ep.start:%Y-%m-%d %H:%M}Z · {ep.minutes:.0f} min · {len(ep.events)} steps · {classify(ep)}", ""]
    prev_shape: dict | None = None
    for i, ev in enumerate(ep.events):
        if i >= MAX_RENDERED_STEPS:
            lines.append(f"- … {len(ep.events) - i} more steps")
            break
        text, prev_shape = describe(ev, prev_shape)
        lines.append(f"- `{ev.ts:%H:%M:%S}` {text}")
    lines.append("")
    return "\n".join(lines)


def to_json(ep: Episode) -> dict:
    return {
        "user_uuid": ep.user_uuid,
        "project_uuid": ep.project_uuid,
        "start": ep.start.isoformat() + "Z",
        "end": ep.end.isoformat() + "Z",
        "minutes": round(ep.minutes, 1),
        "steps": len(ep.events),
        "class": classify(ep),
        "explores": sorted({e.explore for e in ep.events if e.explore}),
        "events": [
            {"ts": e.ts.isoformat() + "Z", "kind": e.kind, "context": e.context, "explore": e.explore, "ref": e.ref_uuid, "payload": e.payload}
            for e in ep.events
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("events_tsv")
    ap.add_argument("--gap-minutes", type=int, default=20)
    ap.add_argument("--sample", type=int, default=50)
    ap.add_argument("--out-dir", default=".")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    events = read_events(args.events_tsv)
    episodes = sessionise(events, timedelta(minutes=args.gap_minutes))
    os.makedirs(args.out_dir, exist_ok=True)

    with open(os.path.join(args.out_dir, "episodes.jsonl"), "w", encoding="utf-8") as fh:
        for ep in episodes:
            fh.write(json.dumps(to_json(ep), default=str) + "\n")

    classes = Counter(classify(ep) for ep in episodes)
    steps = sorted(len(ep.events) for ep in episodes)
    median_steps = steps[len(steps) // 2] if steps else 0
    multi = [ep for ep in episodes if len(ep.events) >= 3]

    # Sample: everything that looks like reasoning first, then fill with the rest.
    random.seed(args.seed)
    reasoning = [ep for ep in episodes if classify(ep) in ("exploration→save", "exploration, no save")]
    others = [ep for ep in multi if ep not in reasoning]
    random.shuffle(reasoning)
    random.shuffle(others)
    sample = (reasoning + others)[: args.sample]
    sample.sort(key=lambda ep: ep.start)

    with open(os.path.join(args.out_dir, "episodes.md"), "w", encoding="utf-8") as fh:
        fh.write(f"# Analysis episodes · {len(sample)} of {len(episodes)} · gap {args.gap_minutes} min\n\n")
        for i, ep in enumerate(sample, 1):
            fh.write(render(ep, i) + "\n")

    print(f"events            {len(events)}")
    print(f"users             {len({e.user_uuid for e in events})}")
    print(f"episodes          {len(episodes)}")
    print(f"episodes >=3 steps {len(multi)}")
    print(f"median steps      {median_steps}")
    for cls, n in classes.most_common():
        print(f"  {cls:<24} {n}")
    print(f"sample written    {len(sample)} → {os.path.join(args.out_dir, 'episodes.md')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
