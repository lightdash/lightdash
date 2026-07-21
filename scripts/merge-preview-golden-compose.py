#!/usr/bin/env python3
"""Merge golden VolumeSnapshot labels into the preview compose file.

Writes a single compose file suitable for `okteto deploy -f` (single-file only).
Labels are taken from docker/docker-compose.preview.golden.yml.
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys


def extract_labels(overlay_text: str) -> str:
    match = re.search(
        r"postgres_data:\n(?P<body>(?:[ \t]+.+\n)+)",
        overlay_text,
    )
    if not match:
        raise SystemExit("Could not parse postgres_data labels from golden overlay")
    return match.group("body")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base",
        default="docker/docker-compose.preview.yml",
        type=pathlib.Path,
    )
    parser.add_argument(
        "--overlay",
        default="docker/docker-compose.preview.golden.yml",
        type=pathlib.Path,
    )
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--snapshot", default="")
    parser.add_argument("--namespace", default="")
    args = parser.parse_args()

    labels = extract_labels(args.overlay.read_text())
    if args.snapshot:
        labels = re.sub(
            r"(from-snapshot-name:\s*).*",
            rf"\1{args.snapshot}",
            labels,
        )
    if args.namespace:
        labels = re.sub(
            r"(from-snapshot-namespace:\s*).*",
            rf"\1{args.namespace}",
            labels,
        )

    text = args.base.read_text()
    needle = "    postgres_data:\n"
    if needle not in text:
        print(f"Could not find {needle!r} in {args.base}", file=sys.stderr)
        return 1

    head, _, tail = text.partition(needle)
    if "services:" not in tail:
        print("Compose file missing services: section", file=sys.stderr)
        return 1

    services_at = tail.index("services:")
    volumes_tail = tail[:services_at]
    rest = tail[services_at:]
    if re.search(r"^\s+labels:", volumes_tail, re.M):
        merged = text
    else:
        merged = head + needle + labels + volumes_tail + rest

    args.output.write_text(merged)
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
