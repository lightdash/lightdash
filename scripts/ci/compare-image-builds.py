#!/usr/bin/env python3
"""Compare two docker-build-test artifact directories.

    compare-image-builds.py BASELINE_DIR CANDIDATE_DIR

Reports an image config diff, a filesystem manifest diff, and a build timing
comparison. Exits non-zero when the config or the filesystem differs, so a PR
can gate on "this dockerfile change produced an identical image". Timing
differences are informational and never fail.
"""

import argparse
import gzip
import json
import os
import sys

CONFIG_FILE = "image-config.json"
MANIFEST_CANDIDATES = ("fs-manifest.tsv.gz", "fs-manifest.tsv")
TIMING_FILE = "build-timing.json"

MANIFEST_FIELDS = ("type", "mode", "uid", "gid", "size", "sha256", "link")


def load_json(directory, name, required=True):
    path = os.path.join(directory, name)
    if not os.path.exists(path):
        if required:
            sys.exit(f"missing {path}")
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_manifest(directory):
    for name in MANIFEST_CANDIDATES:
        path = os.path.join(directory, name)
        if not os.path.exists(path):
            continue
        opener = gzip.open if path.endswith(".gz") else open
        entries = {}
        with opener(path, "rt", encoding="utf-8") as handle:
            header = handle.readline().rstrip("\n").split("\t")
            for line in handle:
                parts = line.rstrip("\n").split("\t")
                row = dict(zip(header, parts))
                entries[row["path"]] = row
        return entries
    sys.exit(f"no filesystem manifest found in {directory}")


def flatten(value, prefix=""):
    """Flatten nested config JSON to dotted leaf paths for a precise diff.

    An empty dict must stay a leaf: docker encodes `EXPOSE 8080` as
    {"ExposedPorts": {"8080/tcp": {}}}, so recursing into the empty value would
    drop the port key entirely and make differing ports compare equal.
    """
    if isinstance(value, dict) and value:
        for key in sorted(value):
            yield from flatten(value[key], f"{prefix}.{key}" if prefix else key)
    else:
        yield prefix, json.dumps(value, sort_keys=True)


def diff_config(baseline, candidate):
    base = dict(flatten(baseline))
    cand = dict(flatten(candidate))
    rows = []
    for key in sorted(set(base) | set(cand)):
        before = base.get(key, "<absent>")
        after = cand.get(key, "<absent>")
        if before != after:
            rows.append((key, before, after))
    return rows


def diff_manifest(baseline, candidate, ignore_prefixes):
    def keep(path):
        return not any(path.startswith(prefix) for prefix in ignore_prefixes)

    base_paths = {p for p in baseline if keep(p)}
    cand_paths = {p for p in candidate if keep(p)}

    removed = sorted(base_paths - cand_paths)
    added = sorted(cand_paths - base_paths)
    changed = []
    for path in sorted(base_paths & cand_paths):
        before, after = baseline[path], candidate[path]
        fields = [f for f in MANIFEST_FIELDS if before.get(f) != after.get(f)]
        if fields:
            changed.append((path, fields, before, after))
    return removed, added, changed


def print_section(title):
    print(f"\n{title}")
    print("=" * len(title))


def print_capped(items, limit, render):
    for item in items[:limit]:
        print(render(item))
    if len(items) > limit:
        print(f"  ... and {len(items) - limit} more (raise --max-lines to see them)")


def report_timing(baseline, candidate):
    print_section("Build timing (informational)")
    if not baseline or not candidate:
        print("  build-timing.json missing on one side; skipping")
        return

    bt, ct = baseline["totals"], candidate["totals"]
    print(f"  {'metric':<22} {'baseline':>12} {'candidate':>12} {'delta':>12}")
    for label, key in (
        ("wall clock (s)", None),
        ("sum step seconds", "sum_step_seconds"),
        ("steps", "steps"),
        ("cache hits", "cache_hits"),
        ("cache misses", "cache_misses"),
    ):
        if key is None:
            before = baseline.get("wall_clock_seconds")
            after = candidate.get("wall_clock_seconds")
        else:
            before, after = bt.get(key), ct.get(key)
        if before is None or after is None:
            print(f"  {label:<22} {'n/a':>12} {'n/a':>12} {'n/a':>12}")
            continue
        delta = after - before
        print(f"  {label:<22} {before:>12.2f} {after:>12.2f} {delta:>+12.2f}")

    stages = sorted(set(baseline["per_stage"]) | set(candidate["per_stage"]))
    print(f"\n  {'stage':<28} {'baseline s':>11} {'candidate s':>12} {'delta s':>10}")
    for stage in stages:
        before = baseline["per_stage"].get(stage, {}).get("seconds", 0.0)
        after = candidate["per_stage"].get(stage, {}).get("seconds", 0.0)
        print(f"  {stage:<28} {before:>11.2f} {after:>12.2f} {after - before:>+10.2f}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("baseline", help="directory of baseline artifacts")
    parser.add_argument("candidate", help="directory of candidate artifacts")
    parser.add_argument("--max-lines", type=int, default=60, help="cap per diff section")
    parser.add_argument(
        "--ignore-path-prefix",
        action="append",
        default=[],
        metavar="PREFIX",
        help="waive filesystem differences under PREFIX (repeatable)",
    )
    args = parser.parse_args()

    failures = []

    print_section("Image config diff")
    config_rows = diff_config(
        load_json(args.baseline, CONFIG_FILE),
        load_json(args.candidate, CONFIG_FILE),
    )
    if not config_rows:
        print("  identical")
    else:
        failures.append(f"{len(config_rows)} image config difference(s)")
        print_capped(
            config_rows,
            args.max_lines,
            lambda row: f"  {row[0]}\n    baseline:  {row[1]}\n    candidate: {row[2]}",
        )

    print_section("Filesystem manifest diff")
    removed, added, changed = diff_manifest(
        load_manifest(args.baseline),
        load_manifest(args.candidate),
        tuple(args.ignore_path_prefix),
    )
    total = len(removed) + len(added) + len(changed)
    if total == 0:
        print("  identical")
    else:
        failures.append(
            f"{len(removed)} removed, {len(added)} added, {len(changed)} changed path(s)"
        )
        if removed:
            print(f"\n  Only in baseline ({len(removed)}):")
            print_capped(removed, args.max_lines, lambda p: f"    - {p}")
        if added:
            print(f"\n  Only in candidate ({len(added)}):")
            print_capped(added, args.max_lines, lambda p: f"    + {p}")
        if changed:
            print(f"\n  Changed ({len(changed)}):")

            def render(item):
                path, fields, before, after = item
                detail = ", ".join(
                    f"{f}: {before.get(f)} -> {after.get(f)}" for f in fields
                )
                return f"    ~ {path}\n        {detail}"

            print_capped(changed, args.max_lines, render)

    report_timing(
        load_json(args.baseline, TIMING_FILE, required=False),
        load_json(args.candidate, TIMING_FILE, required=False),
    )

    print_section("Verdict")
    if failures:
        for failure in failures:
            print(f"  FAIL: {failure}")
        print("\n  Images are NOT equivalent.")
        return 1
    print("  PASS: image config and filesystem are identical.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
