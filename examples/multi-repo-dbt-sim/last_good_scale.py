import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

SIM = Path(__file__).resolve().parent
sys.path.insert(0, str(SIM))
sys.path.insert(0, str(SIM / "last-good-climb"))

import climb

BOOTSTRAP_VARS = "{sim_bootstrap: true}"
SKIP_DIRS = {"target", "logs", "dbt_packages", ".git"}
INJECTION_POLICY = "all-real-models"
RSS_MEASUREMENT = {
    "tool": "/usr/bin/time -v",
    "field": "Maximum resident set size (kbytes)",
    "bytes": "reported kilobytes * 1024",
    "scope": "peak_rss_bytes is the climb dbt parse. injector_peak_rss_bytes is a separate Python process that loads the other manifests and writes the external-node payload. baseline.peak_rss_bytes is the highest of the per-source stubbed parses. Each timed command is one process.",
}
NOT_MEASURED = [
    "Git pack transfer and the product disk-eviction counters. This probe does not start the loopback Git server or the source-fetch pool. checkout_bytes is the materialized project tree.",
    "Concurrent parse RSS. The large-org profile compiles with concurrency 4. These parses are serial, so peak_rss_bytes is one dbt process.",
]
TOP_LEVEL = (
    "fixture",
    "source_count",
    "models",
    "manifest_model_nodes",
    "artefact_bytes_per_source",
    "artefact_bytes_total",
    "injection_policy",
    "consumer",
    "injected_node_count",
    "injected_payload_bytes",
    "public_injected_node_count",
    "ref_filtered_node_count",
    "ref_filtered_payload_bytes",
    "peak_rss_bytes",
    "parse_seconds",
    "climb",
    "baseline",
    "withheld",
)


def tree_bytes(root):
    total = 0
    root = Path(root)
    for path in root.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        if SKIP_DIRS.intersection(path.relative_to(root).parts):
            continue
        total += path.stat().st_size
    return total


def real_model_nodes(manifest):
    return sum(
        1
        for node in manifest["nodes"].values()
        if node.get("resource_type") == "model"
        and (node.get("path") or node.get("original_file_path"))
    )


def project_refs(project_dir):
    refs = []
    models = Path(project_dir) / "models"
    if not models.is_dir():
        return refs
    for path in sorted(models.rglob("*.sql")):
        for package, model, version in climb.REF.findall(
            path.read_text(encoding="utf-8")
        ):
            refs.append(
                {
                    "package": package if model else None,
                    "model": model or package,
                    "version": int(version) if version else None,
                }
            )
    return refs


def choose_consumer(sources):
    ranked = sorted(
        sources,
        key=lambda source: (-len(source.get("upstreams") or []), source["name"]),
    )
    for source in ranked:
        if source.get("upstreams"):
            return source["name"]
    raise RuntimeError("No source has an upstream to climb")


def ref_filtered(nodes, refs):
    qualified = {
        (ref["package"], ref["model"]) for ref in refs if ref["package"] is not None
    }
    unqualified = {ref["model"] for ref in refs if ref["package"] is None}
    return [
        node
        for node in nodes
        if (node["package_name"], node["name"]) in qualified
        or node["name"] in unqualified
    ]


def payload_bytes(nodes):
    return len(json.dumps(nodes).encode("utf-8"))


def case_report(measurement):
    climb_row = measurement["climb"]
    return {
        "fixture": measurement["fixture"],
        "source_count": measurement["source_count"],
        "models": measurement["models"],
        "manifest_model_nodes": measurement["manifest_model_nodes"],
        "artefact_bytes_per_source": measurement["artefact_bytes_per_source"],
        "artefact_bytes_total": measurement["artefact_bytes_total"],
        "injection_policy": INJECTION_POLICY,
        "consumer": measurement["consumer"],
        "injected_node_count": measurement["injected_node_count"],
        "injected_payload_bytes": measurement["injected_payload_bytes"],
        "public_injected_node_count": measurement["public_injected_node_count"],
        "ref_filtered_node_count": measurement["ref_filtered_node_count"],
        "ref_filtered_payload_bytes": measurement["ref_filtered_payload_bytes"],
        "peak_rss_bytes": climb_row["dbt_peak_rss_bytes"],
        "parse_seconds": climb_row["parse_seconds"],
        "climb": climb_row,
        "baseline": measurement["baseline"],
        "withheld": measurement["withheld"],
    }


def report_document(cases, pins, command):
    primary = cases[0]
    document = {
        "command": command,
        "rss_measurement": RSS_MEASUREMENT,
        "injection_policy": INJECTION_POLICY,
        "injection_policy_note": (
            "The two-project present/withheld proof injects access=public models. "
            "This scale parse injects every real model from every other source "
            "and does not apply the ref filter. ref_filtered_* is the smaller "
            "payload that filter would keep; it was not the timed parse."
        ),
        "not_measured": NOT_MEASURED,
        "toolchain": pins,
    }
    document.update({key: primary[key] for key in TOP_LEVEL})
    document["fixtures"] = cases
    return document


def prepare_fixture(name, out):
    out = Path(out)
    if out.exists():
        raise RuntimeError(f"Refusing to reuse an existing fixture directory: {out}")
    if name == "large-org":
        import large_org_fixture

        registry = large_org_fixture.generate(out, "healthy", 42)
    elif name == "full":
        import generate

        registry = generate.generate(out, "full", 42, "baseline")
    else:
        raise ValueError(f"Unknown scale fixture: {name}")
    return registry


def _excerpt(output, root):
    lines = [line for line in output.splitlines() if line.strip()]
    text = "\n".join(lines[-30:])
    return text.replace(str(root), ".")


def _parse(dbt, project_dir, target, fixture_root, **kwargs):
    parsed = climb.run_parse(
        dbt,
        project_dir,
        target,
        profiles_dir=fixture_root / "profiles",
        profile="multi_repo_sim",
        timeout=1800,
        gnu_time=True,
        **kwargs,
    )
    if parsed["returncode"] != 0 and kwargs.get("variables") == BOOTSTRAP_VARS:
        raise RuntimeError(_excerpt(parsed["output"], fixture_root))
    return parsed


def write_injection(store, upstreams, nodes_path):
    nodes = climb.injection_for(store, upstreams, public_only=False)
    nodes.sort(
        key=lambda node: (
            node["package_name"],
            node["name"],
            "" if node["version"] is None else str(node["version"]),
        )
    )
    Path(nodes_path).parent.mkdir(parents=True, exist_ok=True)
    Path(nodes_path).write_text(json.dumps(nodes), encoding="utf-8")
    return len(nodes)


def inject_nodes(python, store, upstreams, nodes_path):
    timing = Path(nodes_path).with_suffix(".time")
    if timing.exists():
        timing.unlink()
    started = time.perf_counter()
    completed = subprocess.run(
        [
            "/usr/bin/time",
            "-v",
            "-o",
            str(timing),
            str(python),
            str(Path(__file__).resolve()),
            "--inject-only",
            "--store",
            str(store),
            "--upstreams",
            json.dumps(list(upstreams)),
            "--nodes",
            str(nodes_path),
        ],
        text=True,
        capture_output=True,
        timeout=1800,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stdout + "\n" + completed.stderr)
    match = climb.GNU_TIME_RSS.search(timing.read_text(encoding="utf-8"))
    if match is None:
        raise RuntimeError("GNU time did not report injector resident set size")
    return {
        "peak_rss_bytes": int(match.group(1)) * 1024,
        "seconds": round(time.perf_counter() - started, 3),
    }


def measure_fixture(dbt, work, name):
    fixture_root = work / name
    registry = prepare_fixture(name, fixture_root)
    sources = registry["sources"]
    consumer = choose_consumer(sources)
    store = work / f"{name}-last-good"
    store.mkdir(parents=True)
    checkouts = []
    artefacts = []
    baseline_sources = []
    manifest_nodes = 0
    for source in sources:
        project = source["name"]
        repo = fixture_root / "repos" / project
        checkout = tree_bytes(repo)
        checkouts.append({"source": project, "bytes": checkout})
        parsed = _parse(
            dbt,
            repo,
            work / name / "baseline-target" / project,
            fixture_root,
            variables=BOOTSTRAP_VARS,
        )
        manifest_nodes += real_model_nodes(parsed["manifest"])
        parsed["manifest"] = None
        climb.publish_manifest(
            work / name / "baseline-target" / project, store, project
        )
        artefact = climb.manifest_path(store, project).stat().st_size
        artefacts.append(
            {"source": project, "bytes": artefact, "models": len(source["models"])}
        )
        baseline_sources.append(
            {
                "source": project,
                "checkout_bytes": checkout,
                "artefact_bytes": artefact,
                "parse_seconds": parsed["parse_seconds"],
                "peak_rss_bytes": parsed["peak_rss_bytes"],
                "returncode": parsed["returncode"],
            }
        )
        shutil.rmtree(work / name / "baseline-target" / project)
        print(
            f"{name} baseline {project} bytes={artefact} "
            f"rss={parsed['peak_rss_bytes']} seconds={parsed['parse_seconds']}",
            flush=True,
        )
    artefacts.sort(key=lambda item: item["source"])
    checkouts.sort(key=lambda item: item["source"])
    baseline_sources.sort(key=lambda item: item["source"])
    others = [source["name"] for source in sources if source["name"] != consumer]
    nodes_path = work / name / "climb-nodes.json"
    nodes_path.parent.mkdir(parents=True, exist_ok=True)
    injected = inject_nodes(Path(dbt).with_name("python"), store, others, nodes_path)
    nodes = json.loads(nodes_path.read_text(encoding="utf-8"))
    refs = project_refs(fixture_root / "repos" / consumer)
    filtered = ref_filtered(nodes, refs)
    climb_parse = _parse(
        dbt,
        fixture_root / "repos" / consumer,
        work / name / "climb-target",
        fixture_root,
        external_nodes_path=nodes_path,
    )
    if climb_parse["returncode"] != 0 or climb_parse["manifest"] is None:
        raise RuntimeError(_excerpt(climb_parse["output"], fixture_root))
    cycle = climb.find_cycle(climb.model_edges(climb_parse["manifest"], False))
    climb_parse["manifest"] = None
    if cycle is not None or climb_parse["cycle_error"]:
        raise RuntimeError(f"Climb reported a model cycle: {cycle}")
    withheld_parse = _parse(
        dbt,
        fixture_root / "repos" / consumer,
        work / name / "withheld-target",
        fixture_root,
    )
    if withheld_parse["returncode"] == 0 or not withheld_parse["unresolved"]:
        raise RuntimeError(
            "Withheld scale parse did not fail unresolved:\n"
            + _excerpt(withheld_parse["output"], fixture_root)
        )
    if climb.manifest_files(work / f"{name}-withheld-empty"):
        raise RuntimeError("Scale probe invented a manifest for the withheld path")
    measurement = {
        "fixture": name,
        "source_count": registry["stats"]["sourceCount"],
        "models": registry["stats"]["totalModels"],
        "manifest_model_nodes": manifest_nodes,
        "artefact_bytes_per_source": artefacts,
        "artefact_bytes_total": sum(item["bytes"] for item in artefacts),
        "consumer": consumer,
        "injected_node_count": len(nodes),
        "injected_payload_bytes": nodes_path.stat().st_size,
        "public_injected_node_count": sum(
            1 for node in nodes if node.get("access") == "public"
        ),
        "ref_filtered_node_count": len(filtered),
        "ref_filtered_payload_bytes": payload_bytes(filtered),
        "climb": {
            "dbt_peak_rss_bytes": climb_parse["peak_rss_bytes"],
            "parse_seconds": climb_parse["parse_seconds"],
            "returncode": climb_parse["returncode"],
            "cycle_error": False,
            "injector_peak_rss_bytes": injected["peak_rss_bytes"],
            "injector_seconds": injected["seconds"],
            "rss_measurement": RSS_MEASUREMENT,
        },
        "baseline": {
            "kind": "serial dbt parse of every checkout with cross-repo refs stubbed; no last-good injection",
            "checkout_bytes_per_source": checkouts,
            "checkout_bytes_total": sum(item["bytes"] for item in checkouts),
            "parse_seconds": round(
                sum(item["parse_seconds"] for item in baseline_sources), 3
            ),
            "peak_rss_bytes": max(item["peak_rss_bytes"] for item in baseline_sources),
            "sources": baseline_sources,
        },
        "withheld": {
            "returncode": withheld_parse["returncode"],
            "unresolved": True,
            "invented_manifests": [],
            "parse_seconds": withheld_parse["parse_seconds"],
            "peak_rss_bytes": withheld_parse["peak_rss_bytes"],
            "warning": climb.cold_start_warning(consumer, others),
        },
    }
    return case_report(measurement)


def main():
    parser = argparse.ArgumentParser(
        description="Measure last-good manifest bytes, climb RSS, and a no-store baseline."
    )
    parser.add_argument("--inject-only", action="store_true")
    parser.add_argument("--store", type=Path)
    parser.add_argument("--upstreams")
    parser.add_argument("--nodes", type=Path)
    parser.add_argument("--dbt")
    parser.add_argument("--work", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument(
        "--fixture", choices=("large-org", "full", "both"), default="large-org"
    )
    args = parser.parse_args()
    if args.inject_only:
        if args.store is None or args.upstreams is None or args.nodes is None:
            parser.error("--inject-only requires --store, --upstreams and --nodes")
        print(write_injection(args.store, json.loads(args.upstreams), args.nodes))
        return 0
    if args.dbt is None or args.work is None or args.report is None:
        parser.error("--dbt, --work and --report are required")
    names = ["large-org", "full"] if args.fixture == "both" else [args.fixture]
    args.work.mkdir(parents=True, exist_ok=True)
    pins = climb.toolchain(args.dbt)
    if pins["packages"].get("dbt-core") != "1.12.0" or pins["dbt_loom_installed"]:
        raise SystemExit("Scale probe requires dbt-core 1.12.0 and no dbt-loom")
    cases = []
    command = "examples/multi-repo-dbt-sim/run-last-good-scale"
    if args.fixture != "large-org":
        command += f" --fixture {args.fixture}"
    for name in names:
        print(f"scale fixture {name}", flush=True)
        cases.append(measure_fixture(args.dbt, args.work, name))
        document = report_document(cases, pins, command)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
        print(
            f"{name} sources={cases[-1]['source_count']} models={cases[-1]['models']} "
            f"artefacts={cases[-1]['artefact_bytes_total']} "
            f"climb_rss={cases[-1]['peak_rss_bytes']} "
            f"climb_seconds={cases[-1]['parse_seconds']}",
            flush=True,
        )
    print(f"wrote {args.report}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
