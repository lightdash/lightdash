#!/usr/bin/env python3
"""Generate comparable artifacts describing a built Docker image.

Subcommands:
  config    normalise `docker image inspect` output into a stable config JSON
  manifest  read a `docker export` tar stream on stdin, emit a sorted fs manifest
  buildlog  parse a `--progress plain` BuildKit log into timing + cache stats
"""

import argparse
import gzip
import hashlib
import json
import re
import sys
import tarfile
from collections import defaultdict

# Fields that describe what the image *is*. Everything else reported by
# `docker image inspect` (Id, Created, RepoTags, RootFS layer digests, GraphDriver)
# varies between builds of identical inputs and would make every diff fail.
CONFIG_FIELDS = (
    "Entrypoint",
    "Cmd",
    "Env",
    "WorkingDir",
    "ExposedPorts",
    "Labels",
    "User",
    "Volumes",
    "StopSignal",
    "Shell",
    "Healthcheck",
    "OnBuild",
)

# Labels stamped with per-build identity. Present in the release build via
# docker/metadata-action; excluded so a harness build and a release build of the
# same tree still compare equal.
VOLATILE_LABEL_PREFIXES = ("org.opencontainers.image.created", "org.opencontainers.image.revision")

# `docker export` serialises the *container* rootfs, so it includes files the
# daemon injects at container-create time rather than anything the image built.
RUNTIME_INJECTED_PATHS = frozenset(
    {"/.dockerenv", "/etc/hostname", "/etc/hosts", "/etc/resolv.conf"}
)
RUNTIME_INJECTED_PREFIXES = ("/dev/", "/proc/", "/sys/")

TAR_TYPES = {
    tarfile.REGTYPE: "file",
    tarfile.AREGTYPE: "file",
    tarfile.LNKTYPE: "hardlink",
    tarfile.SYMTYPE: "symlink",
    tarfile.DIRTYPE: "dir",
    tarfile.FIFOTYPE: "fifo",
    tarfile.CHRTYPE: "char",
    tarfile.BLKTYPE: "block",
}

MANIFEST_HEADER = "path\ttype\tmode\tuid\tgid\tsize\tsha256\tlink"


def normalise_path(name):
    name = name.lstrip("./")
    return "/" + name.rstrip("/") if name else "/"


def is_runtime_injected(path):
    return path in RUNTIME_INJECTED_PATHS or path.startswith(RUNTIME_INJECTED_PREFIXES)


def cmd_config(args):
    inspected = json.load(sys.stdin)
    if isinstance(inspected, list):
        if not inspected:
            sys.exit("image inspect output was an empty list")
        inspected = inspected[0]

    raw_config = inspected.get("Config") or {}
    config = {}
    for field in CONFIG_FIELDS:
        value = raw_config.get(field)
        if field == "Env" and value:
            value = sorted(value)
        if field == "Labels" and value:
            value = {
                k: v
                for k, v in sorted(value.items())
                if not k.startswith(VOLATILE_LABEL_PREFIXES)
            }
        config[field] = value

    out = {
        "architecture": inspected.get("Architecture"),
        "os": inspected.get("Os"),
        "config": config,
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(out, handle, indent=2, sort_keys=True)
        handle.write("\n")


def cmd_manifest(args):
    rows = []
    skipped = 0
    # Stream mode ("r|"): the tar is consumed once, forwards only, so nothing is
    # buffered to disk. A multi-GB image never lands on the runner twice.
    with tarfile.open(fileobj=sys.stdin.buffer, mode="r|*") as tar:
        for member in tar:
            path = normalise_path(member.name)
            if is_runtime_injected(path):
                skipped += 1
                continue

            kind = TAR_TYPES.get(member.type, "other")
            digest = "-"
            size = member.size if member.isreg() else 0
            if member.isreg():
                stream = tar.extractfile(member)
                if stream is not None:
                    hasher = hashlib.sha256()
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        hasher.update(chunk)
                    digest = hasher.hexdigest()

            rows.append(
                (
                    path,
                    kind,
                    format(member.mode & 0o7777, "04o"),
                    str(member.uid),
                    str(member.gid),
                    str(size),
                    digest,
                    member.linkname or "-",
                )
            )

    rows.sort(key=lambda row: row[0])
    opener = gzip.open if args.output.endswith(".gz") else open
    with opener(args.output, "wt", encoding="utf-8") as handle:
        handle.write(MANIFEST_HEADER + "\n")
        for row in rows:
            handle.write("\t".join(row) + "\n")

    summary = {
        "entries": len(rows),
        "runtime_injected_skipped": skipped,
        "total_file_bytes": sum(int(row[5]) for row in rows),
    }
    if args.summary:
        with open(args.summary, "w", encoding="utf-8") as handle:
            json.dump(summary, handle, indent=2)
            handle.write("\n")
    print(json.dumps(summary), file=sys.stderr)


VERTEX_NAME_RE = re.compile(r"^#(\d+) \[([^\]]*)\] (.*)$")
VERTEX_DONE_RE = re.compile(r"^#(\d+) DONE ([0-9.]+)s$")
VERTEX_CACHED_RE = re.compile(r"^#(\d+) CACHED$")
VERTEX_ERROR_RE = re.compile(r"^#(\d+) ERROR: (.*)$")
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
# "[build-backend 3/7]", "[internal]", "[duckdb-extensions 1/2]".
# BuildKit right-aligns the index, so a stage with 10+ steps prints
# "[build-final  1/10]" but "[build-final 10/10]" — match any run of spaces or
# the stage name picks up a trailing one and splits into two buckets.
STAGE_RE = re.compile(r"^(.*?)\s*(?:(\d+)/(\d+))?$")


def cmd_buildlog(args):
    steps = {}
    order = []
    with open(args.log, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = ANSI_RE.sub("", line.rstrip("\n"))

            match = VERTEX_NAME_RE.match(line)
            if match:
                vertex, bracket, instruction = match.groups()
                if vertex not in steps:
                    steps[vertex] = {
                        "vertex": int(vertex),
                        "stage": None,
                        "step": None,
                        "instruction": instruction.strip(),
                        "seconds": None,
                        "cached": False,
                        "error": None,
                    }
                    order.append(vertex)
                    stage_match = STAGE_RE.match(bracket.strip())
                    stage, index, total = stage_match.groups()
                    steps[vertex]["stage"] = (stage or "").strip() or bracket.strip()
                    if index:
                        steps[vertex]["step"] = f"{index}/{total}"
                continue

            match = VERTEX_CACHED_RE.match(line)
            if match and match.group(1) in steps:
                steps[match.group(1)]["cached"] = True
                continue

            match = VERTEX_DONE_RE.match(line)
            if match and match.group(1) in steps:
                steps[match.group(1)]["seconds"] = float(match.group(2))
                continue

            match = VERTEX_ERROR_RE.match(line)
            if match and match.group(1) in steps:
                steps[match.group(1)]["error"] = match.group(2)

    ordered = [steps[vertex] for vertex in order]
    per_stage = defaultdict(lambda: {"seconds": 0.0, "steps": 0, "cached": 0})
    for step in ordered:
        bucket = per_stage[step["stage"]]
        bucket["steps"] += 1
        bucket["seconds"] += step["seconds"] or 0.0
        bucket["cached"] += 1 if step["cached"] else 0

    cached = sum(1 for step in ordered if step["cached"])
    result = {
        "wall_clock_seconds": args.wall_clock,
        "totals": {
            "steps": len(ordered),
            "cache_hits": cached,
            "cache_misses": len(ordered) - cached,
            "cache_hit_ratio": round(cached / len(ordered), 4) if ordered else 0.0,
            "sum_step_seconds": round(sum(s["seconds"] or 0.0 for s in ordered), 2),
        },
        "per_stage": {
            stage: {
                "steps": data["steps"],
                "cached": data["cached"],
                "seconds": round(data["seconds"], 2),
            }
            for stage, data in sorted(per_stage.items(), key=lambda kv: -kv[1]["seconds"])
        },
        "steps": ordered,
    }
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")
    print(json.dumps(result["totals"]), file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    config = sub.add_parser("config", help="normalise docker image inspect JSON from stdin")
    config.add_argument("--output", required=True)
    config.set_defaults(func=cmd_config)

    manifest = sub.add_parser("manifest", help="build an fs manifest from a docker export tar on stdin")
    manifest.add_argument("--output", required=True, help="path; .gz suffix enables gzip")
    manifest.add_argument("--summary", help="optional JSON summary path")
    manifest.set_defaults(func=cmd_manifest)

    buildlog = sub.add_parser("buildlog", help="parse a BuildKit plain-progress log")
    buildlog.add_argument("--log", required=True)
    buildlog.add_argument("--output", required=True)
    buildlog.add_argument("--wall-clock", type=float, default=None)
    buildlog.set_defaults(func=cmd_buildlog)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
