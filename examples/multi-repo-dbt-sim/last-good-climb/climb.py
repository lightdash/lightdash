import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

FIXTURE = Path(__file__).resolve().parent
SIM = FIXTURE.parent
PROFILES = FIXTURE / "profiles"
SEED = FIXTURE / "seed"
DISK = FIXTURE / "disk"
PROJECTS = ("proj_alpha", "proj_beta")
UPSTREAMS = {
    "proj_alpha": ("proj_beta",),
    "proj_beta": ("proj_alpha",),
}
BINDINGS = {
    "proj_alpha": {"alpha_report": ["model.proj_beta.measure.v3"]},
    "proj_beta": {"beta_report": ["model.proj_alpha.alpha_base"]},
}
DISK_LATEST = {"measure": 2}
SEED_LATEST = {"measure": 3}
VERSIONED_MODEL = "measure"
REF = re.compile(
    r"ref\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?(?:\s*,\s*v\s*=\s*(\d+))?\s*\)"
)
CYCLE_TEXT = "Found a cycle"
UNRESOLVED_TEXT = "which was not found"
GNU_TIME_RSS = re.compile(r"Maximum resident set size \(kbytes\): (\d+)")


def cold_start_warning(consumer, upstreams):
    names = ", ".join(sorted(upstreams))
    return (
        f'Cold start: dbt source "{consumer}" cannot refresh because '
        f"last-good manifests are not seeded for upstreams: {names}. "
        "Seed each upstream with a successful compile or deploy. "
        "No manifest was invented."
    )


def manifest_path(store, project):
    return Path(store) / project / "manifest.json"


def missing_upstreams(store, upstreams):
    return sorted(
        project for project in upstreams if not manifest_path(store, project).is_file()
    )


def latest_versions(schema_text):
    versions = {}
    current = None
    for line in schema_text.splitlines():
        name = re.match(r"\s*- name: ([A-Za-z0-9_]+)\s*$", line)
        if name:
            current = name.group(1)
        latest = re.match(r"\s*latest_version: (\d+)\s*$", line)
        if latest and current:
            versions[current] = int(latest.group(1))
    return versions


def sql_refs(project_dir):
    refs = {}
    for path in sorted((Path(project_dir) / "models").glob("*.sql")):
        match = re.fullmatch(r"(.+)_v(\d+)", path.stem)
        key = f"{match.group(1)}.v{match.group(2)}" if match else path.stem
        refs[key] = [
            {
                "package": package if model else None,
                "model": model or package,
                "version": int(version) if version else None,
            }
            for package, model, version in REF.findall(path.read_text())
        ]
    return refs


def plain_model_graph(root):
    edges = {}
    for project in PROJECTS:
        for key, refs in sql_refs(Path(root) / project).items():
            logical = key.split(".v", 1)[0]
            node = f"{project}.{logical}"
            edges.setdefault(node, [])
            for ref in refs:
                provider = ref["package"] or project
                edges[node].append(f"{provider}.{ref['model']}")
                edges.setdefault(f"{provider}.{ref['model']}", [])
    return edges


def project_graph(root):
    edges = {project: [] for project in PROJECTS}
    for project in PROJECTS:
        for refs in sql_refs(Path(root) / project).values():
            for ref in refs:
                if ref["package"] and ref["package"] not in edges[project]:
                    edges[project].append(ref["package"])
    return edges


def find_cycle(edges):
    done = set()
    stack = []

    def visit(node):
        if node in stack:
            return stack[stack.index(node) :] + [node]
        if node in done:
            return None
        stack.append(node)
        for dependency in edges.get(node, []):
            cycle = visit(dependency)
            if cycle:
                return cycle
        stack.pop()
        done.add(node)
        return None

    return next((found for node in edges if (found := visit(node))), None)


INJECTED_RESOURCE_TYPES = ("model", "seed", "snapshot")
# Server refresh: DbtCliClient.getDbtManifest. Test & deploy uses `dbt parse`.
REFRESH_COMMAND = ("ls", "--output", "json", "--output-keys", "unique_id")
MANIFEST_COMMAND = ("parse",)


class DuplicateInjectedIdError(RuntimeError):
    """Two upstreams would hand dbt the same injected unique id."""


def resolved_access(node):
    access = node.get("access")
    if access is None and node.get("resource_type") != "model":
        access = (node.get("config") or {}).get("access")
    return access


def _is_real_resource(node):
    return node.get("resource_type") in INJECTED_RESOURCE_TYPES and bool(
        node.get("path") or node.get("original_file_path")
    )


def _injected_ids(node):
    version = node.get("version")
    suffix = "" if version is None else f".v{version}"
    resource_type = node.get("resource_type") or "model"
    return {
        node["unique_id"],
        f"{resource_type}.{node['package_name']}.{node['name']}{suffix}",
    }


def _public_payloads(nodes):
    payloads = []
    for node in nodes:
        if not _is_real_resource(node) or resolved_access(node) != "public":
            continue
        payload = {
            "name": node["name"],
            "package_name": node["package_name"],
            "identifier": node.get("alias") or node["name"],
            "schema": node["schema"],
            "database": node.get("database"),
            "relation_name": node.get("relation_name"),
            "version": node.get("version"),
            "latest_version": node.get("latest_version"),
            "access": "public",
            "depends_on_nodes": list((node.get("depends_on") or {}).get("nodes") or []),
            "ids": _injected_ids(node),
        }
        if node.get("resource_type") != "model":
            payload["resource_type"] = node["resource_type"]
        payloads.append(payload)
    return payloads


def canonical_injected_id(payload):
    version = payload.get("version")
    suffix = "" if version is None else f".v{version}"
    resource_type = payload.get("resource_type") or "model"
    return f"{resource_type}.{payload['package_name']}.{payload['name']}{suffix}"


def _restrict_depends_on(payloads):
    injected_ids = set()
    for payload in payloads:
        injected_ids.update(payload["ids"])
    restricted = []
    for payload in payloads:
        item = {key: value for key, value in payload.items() if key != "ids"}
        item["depends_on_nodes"] = [
            dependency
            for dependency in payload["depends_on_nodes"]
            if dependency in injected_ids
        ]
        restricted.append(item)
    return restricted


def external_nodes(manifest):
    return _restrict_depends_on(_public_payloads(manifest["nodes"].values()))


def model_edges(manifest, real_only):
    selected = {}
    for key, node in manifest["nodes"].items():
        if node.get("resource_type") != "model":
            continue
        external = not node.get("path") and not node.get("original_file_path")
        if real_only and external:
            continue
        selected[key] = node
    return {
        key: [
            dependency
            for dependency in node.get("depends_on", {}).get("nodes", [])
            if dependency in selected
        ]
        for key, node in selected.items()
    }


def store_digest(store):
    return {
        project: hashlib.sha256(manifest_path(store, project).read_bytes()).hexdigest()
        for project in PROJECTS
        if manifest_path(store, project).is_file()
    }


def manifest_files(directory):
    root = Path(directory)
    if not root.exists():
        return []
    return sorted(
        str(path.relative_to(root))
        for path in root.rglob("manifest.json")
        if path.is_file()
    )


def dbt_environment(external_nodes_path=None):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(FIXTURE)
    env["DBT_SEND_ANONYMOUS_USAGE_STATS"] = "false"
    env["DBT_PARTIAL_PARSE"] = "false"
    env.setdefault("PGHOST", "127.0.0.1")
    env.setdefault("PGPORT", "1")
    env.setdefault("PGUSER", "sim")
    env.setdefault("PGPASSWORD", "sim")
    env.setdefault("PGDATABASE", "sim")
    env.pop("LIGHTDASH_DBT_EXTERNAL_NODES", None)
    if external_nodes_path is not None:
        env["LIGHTDASH_DBT_EXTERNAL_NODES"] = str(external_nodes_path)
    return env


def dbt_argv(
    dbt,
    project_dir,
    target,
    *,
    profiles_dir=None,
    profile="last_good_climb",
    variables=None,
    command=MANIFEST_COMMAND,
):
    logs = Path(target).parent / f"{Path(target).name}-logs"
    return [
        dbt,
        "--no-use-colors",
        "--no-partial-parse",
        *tuple(command),
        "--project-dir",
        str(project_dir),
        "--profiles-dir",
        str(profiles_dir or PROFILES),
        "--profile",
        profile,
        "--target",
        "dev",
        "--target-path",
        str(target),
        "--log-path",
        str(logs),
        *(["--vars", variables] if variables is not None else []),
    ]


def run_parse(
    dbt,
    project_dir,
    target,
    external_nodes_path=None,
    *,
    profiles_dir=None,
    profile="last_good_climb",
    variables=None,
    timeout=180,
    gnu_time=False,
    command=MANIFEST_COMMAND,
):
    logs = target.parent / f"{target.name}-logs"
    if target.exists():
        shutil.rmtree(target)
    if logs.exists():
        shutil.rmtree(logs)
    target.mkdir(parents=True)
    argv = dbt_argv(
        dbt,
        project_dir,
        target,
        profiles_dir=profiles_dir,
        profile=profile,
        variables=variables,
        command=command,
    )
    timing_path = target.parent / f"{target.name}.time"
    if gnu_time:
        if timing_path.exists():
            timing_path.unlink()
        argv = ["/usr/bin/time", "-v", "-o", str(timing_path), *argv]
    started = time.perf_counter()
    completed = subprocess.run(
        argv,
        cwd=project_dir,
        env=dbt_environment(external_nodes_path),
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    elapsed = time.perf_counter() - started
    output = f"{completed.stdout}\n{completed.stderr}"
    manifest = None
    manifest_file = target / "manifest.json"
    if manifest_file.is_file() and completed.returncode == 0:
        manifest = json.loads(manifest_file.read_text())
    result = {
        "returncode": completed.returncode,
        "output": output,
        "manifest": manifest,
        "cycle_error": CYCLE_TEXT in output,
        "unresolved": UNRESOLVED_TEXT in output,
        "parse_seconds": round(elapsed, 3),
        "command": list(command),
    }
    if gnu_time:
        timing = timing_path.read_text(encoding="utf-8")
        match = GNU_TIME_RSS.search(timing)
        if match is None:
            raise RuntimeError("GNU time did not report maximum resident set size")
        result["peak_rss_bytes"] = int(match.group(1)) * 1024
        result["rss_measurement"] = {
            "tool": "/usr/bin/time -v",
            "field": "Maximum resident set size (kbytes)",
            "bytes": "reported kilobytes * 1024",
            "scope": f"the timed dbt {next(iter(command))} process",
        }
    return result


def publish_manifest(target, store, project):
    destination = manifest_path(store, project)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(target / "manifest.json", destination)


def injection_for(store, upstreams):
    payloads = []
    owners = {}
    for upstream in upstreams:
        path = manifest_path(store, upstream)
        if not path.is_file():
            raise FileNotFoundError(path)
        for payload in _public_payloads(json.loads(path.read_text())["nodes"].values()):
            node_id = canonical_injected_id(payload)
            previous = owners.get(node_id)
            if previous is not None and previous != upstream:
                raise DuplicateInjectedIdError(
                    f'External model "{node_id}" is provided by several dbt '
                    f'sources: "{previous}", "{upstream}". Connect only one '
                    "source for this model."
                )
            if previous == upstream:
                payloads = [
                    item for item in payloads if canonical_injected_id(item) != node_id
                ]
            owners[node_id] = upstream
            payloads.append(payload)
    return _restrict_depends_on(payloads)


def binding(manifest, project, model):
    node = manifest["nodes"].get(f"model.{project}.{model}")
    if node is None:
        return None
    return list(node.get("depends_on", {}).get("nodes", []))


def seed_last_good(dbt, work):
    store = work / "last-good"
    if store.exists():
        shutil.rmtree(store)
    alpha_target = work / "seed-target" / "proj_alpha"
    alpha = run_parse(dbt, SEED / "proj_alpha", alpha_target)
    if alpha["returncode"] != 0:
        raise RuntimeError(alpha["output"])
    publish_manifest(alpha_target, store, "proj_alpha")
    beta_nodes = work / "seed-target" / "proj_beta-nodes.json"
    beta_nodes.write_text(json.dumps(injection_for(store, UPSTREAMS["proj_beta"])))
    beta_target = work / "seed-target" / "proj_beta"
    beta = run_parse(dbt, SEED / "proj_beta", beta_target, beta_nodes)
    if beta["returncode"] != 0:
        raise RuntimeError(beta["output"])
    publish_manifest(beta_target, store, "proj_beta")
    return store


def present_case(dbt, work, store):
    before = store_digest(store)
    results = {}
    for project in PROJECTS:
        missing = missing_upstreams(store, UPSTREAMS[project])
        if missing:
            raise RuntimeError(cold_start_warning(project, missing))
        nodes_path = work / "present" / f"{project}-nodes.json"
        nodes_path.parent.mkdir(parents=True, exist_ok=True)
        nodes = injection_for(store, UPSTREAMS[project])
        nodes_path.write_text(json.dumps(nodes))
        parsed = run_parse(
            dbt,
            DISK / project,
            work / "present" / project,
            nodes_path,
            command=REFRESH_COMMAND,
        )
        if parsed["command"] != list(REFRESH_COMMAND):
            raise RuntimeError("present refresh did not run dbt ls")
        if parsed["manifest"] is None:
            raise RuntimeError(parsed["output"])
        bindings = {
            model: binding(parsed["manifest"], project, model)
            for model in BINDINGS[project]
        }
        results[project] = {
            "returncode": parsed["returncode"],
            "cycle_error": parsed["cycle_error"]
            or find_cycle(model_edges(parsed["manifest"], True)) is not None
            or find_cycle(model_edges(parsed["manifest"], False)) is not None,
            "bindings": bindings,
            "injected": sorted(
                (
                    {
                        "package_name": node["package_name"],
                        "name": node["name"],
                        "version": node["version"],
                        "latest_version": node["latest_version"],
                    }
                    for node in nodes
                ),
                key=lambda node: (
                    node["package_name"],
                    node["name"],
                    "" if node["version"] is None else str(node["version"]),
                ),
            ),
        }
    return {
        "command": list(REFRESH_COMMAND),
        "success": all(
            row["returncode"] == 0
            and not row["cycle_error"]
            and row["bindings"] == BINDINGS[project]
            for project, row in results.items()
        ),
        "store_unchanged": store_digest(store) == before,
        "projects": results,
    }


def withheld_case(dbt, work, store):
    empty = work / "withheld-store"
    if empty.exists():
        shutil.rmtree(empty)
    empty.mkdir()
    before_store = store_digest(store)
    before_files = manifest_files(empty)
    projects = {}
    warnings = []
    for project in PROJECTS:
        missing = missing_upstreams(empty, UPSTREAMS[project])
        warning = cold_start_warning(project, missing)
        warnings.append(warning)
        print(warning, flush=True)
        if not missing:
            raise RuntimeError(
                f"Withheld store unexpectedly contained manifests for {project}"
            )
        parsed = run_parse(
            dbt,
            DISK / project,
            work / "withheld" / project,
            command=REFRESH_COMMAND,
        )
        if parsed["command"] != list(REFRESH_COMMAND):
            raise RuntimeError("withheld refresh did not run dbt ls")
        excerpt = [
            line
            for line in parsed["output"].splitlines()
            if UNRESOLVED_TEXT in line or line.startswith("Failure")
        ]
        projects[project] = {
            "returncode": parsed["returncode"],
            "unresolved": parsed["unresolved"],
            "cycle_error": parsed["cycle_error"],
            "success": parsed["returncode"] == 0,
            "error_excerpt": excerpt,
        }
    return {
        "command": list(REFRESH_COMMAND),
        "success": False,
        "partial_success": False,
        "invented_manifests": manifest_files(empty),
        "warnings": warnings,
        "unseeded_upstreams": sorted(
            {name for project in PROJECTS for name in UPSTREAMS[project]}
        ),
        "projects": projects,
        "withheld_store_unchanged": manifest_files(empty) == before_files,
        "seeded_store_unchanged": store_digest(store) == before_store,
        "passed": all(
            not row["success"] and row["unresolved"] and not row["cycle_error"]
            for row in projects.values()
        )
        and manifest_files(empty) == []
        and store_digest(store) == before_store,
    }


def toolchain(dbt):
    if not Path(dbt).is_file():
        raise RuntimeError(f"dbt executable is missing: {dbt}")
    shown = subprocess.run(
        [sys.executable, "-m", "pip", "show", "dbt-core", "dbt-postgres"],
        text=True,
        capture_output=True,
        timeout=60,
        check=True,
    )
    packages = {}
    name = None
    for line in shown.stdout.splitlines():
        if line.startswith("Name: "):
            name = line.removeprefix("Name: ")
        elif line.startswith("Version: ") and name:
            packages[name] = line.removeprefix("Version: ")
    requirements = (FIXTURE / "requirements.txt").read_text().splitlines()
    return {
        "requirements": requirements,
        "packages": packages,
        "dbt_loom_installed": importlib.util.find_spec("dbt_loom") is not None,
        "python": sys.version.split()[0],
    }


def cyclic_injection():
    def node(name, dependency):
        return {
            "name": name,
            "package_name": "proj_cycle",
            "identifier": name,
            "schema": "analytics",
            "database": "sim",
            "relation_name": f'"sim"."analytics"."{name}"',
            "version": None,
            "latest_version": None,
            "access": "public",
            "depends_on_nodes": [dependency],
        }

    return [
        node("left", "model.proj_cycle.right"),
        node("right", "model.proj_cycle.left"),
    ]


def write_leaf_project(root):
    project = Path(root) / "proj_leaf"
    (project / "models").mkdir(parents=True, exist_ok=True)
    (project / "dbt_project.yml").write_text(
        "name: proj_leaf\n"
        "version: '1.0.0'\n"
        "config-version: 2\n"
        "profile: last_good_climb\n"
        "model-paths: [models]\n"
        "models:\n"
        "    proj_leaf:\n"
        "        +materialized: view\n"
        "        +schema: proj_leaf\n",
        encoding="utf-8",
    )
    (project / "models" / "leaf.sql").write_text(
        "select * from {{ ref('proj_cycle', 'left') }}\n",
        encoding="utf-8",
    )
    (project / "models" / "schema.yml").write_text(
        "version: 2\nmodels:\n    - name: leaf\n      access: public\n",
        encoding="utf-8",
    )
    return project


def refresh_cycle_probe(dbt, work):
    """An injected cycle must be visible to refresh (`dbt ls`) and not to parse."""
    project = write_leaf_project(work / "command-fidelity")
    nodes = work / "command-fidelity" / "nodes.json"
    nodes.write_text(json.dumps(cyclic_injection()), encoding="utf-8")
    listed = run_parse(
        dbt,
        project,
        work / "command-fidelity" / "ls",
        nodes,
        command=REFRESH_COMMAND,
    )
    parsed = run_parse(
        dbt,
        project,
        work / "command-fidelity" / "parse",
        nodes,
        command=MANIFEST_COMMAND,
    )
    return {
        "ls": {
            "command": listed["command"],
            "returncode": listed["returncode"],
            "cycle_error": listed["cycle_error"],
        },
        "parse": {
            "command": parsed["command"],
            "returncode": parsed["returncode"],
            "cycle_error": parsed["cycle_error"],
        },
    }


def assert_contract(present, withheld, fidelity, pins):
    errors = []
    if pins["packages"].get("dbt-core") != "1.12.0":
        errors.append("dbt-core is not pinned to 1.12.0")
    if pins["dbt_loom_installed"]:
        errors.append("dbt-loom is installed on the server-shaped path")
    if present.get("command") != list(REFRESH_COMMAND):
        errors.append("present climb did not use dbt ls")
    if withheld.get("command") != list(REFRESH_COMMAND):
        errors.append("withheld climb did not use dbt ls")
    if (
        fidelity["ls"]["command"] != list(REFRESH_COMMAND)
        or fidelity["ls"]["returncode"] == 0
        or not fidelity["ls"]["cycle_error"]
    ):
        errors.append("dbt ls did not report an injected cycle")
    if (
        fidelity["parse"]["command"] != list(MANIFEST_COMMAND)
        or fidelity["parse"]["returncode"] != 0
        or fidelity["parse"]["cycle_error"]
    ):
        errors.append("dbt parse did not accept the injected cycle")
    measure = [
        node
        for node in present["projects"]["proj_alpha"]["injected"]
        if node["name"] == VERSIONED_MODEL
    ]
    if not present["success"] or not present["store_unchanged"]:
        errors.append("present climb did not match the expected bindings")
    if [node["version"] for node in measure] != [3]:
        errors.append("present climb did not inject last-good measure.v3")
    if [node["latest_version"] for node in measure] != [3]:
        errors.append("present climb used the on-disk latest version")
    if not withheld["passed"]:
        errors.append("withheld run did not fail closed")
    if any(row["success"] for row in withheld["projects"].values()):
        errors.append("withheld run was partially green")
    if withheld["invented_manifests"]:
        errors.append("withheld run invented a manifest")
    return errors


def relative_output(value):
    return json.loads(
        json.dumps(value).replace(str(SIM), "examples/multi-repo-dbt-sim")
    )


def main():
    parser = argparse.ArgumentParser(
        description="Prove last-good manifest climb against a project ring."
    )
    parser.add_argument("--dbt", required=True)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)
    pins = toolchain(args.dbt)
    print(
        f"dbt-core {pins['packages'].get('dbt-core')} "
        f"dbt-postgres {pins['packages'].get('dbt-postgres')} "
        f"loom {pins['dbt_loom_installed']}",
        flush=True,
    )
    store = seed_last_good(args.dbt, args.work)
    seeded = {
        project: {
            "latest_version": json.loads(manifest_path(store, project).read_text())[
                "nodes"
            ][f"model.{project}.{VERSIONED_MODEL}.v3"]["latest_version"]
            if project == "proj_beta"
            else None,
            "nodes": sorted(
                key
                for key, node in json.loads(manifest_path(store, project).read_text())[
                    "nodes"
                ].items()
                if node.get("resource_type") == "model"
                and (node.get("path") or node.get("original_file_path"))
            ),
        }
        for project in PROJECTS
    }
    present = present_case(args.dbt, args.work, store)
    withheld = withheld_case(args.dbt, args.work, store)
    fidelity = refresh_cycle_probe(args.dbt, args.work)
    errors = assert_contract(present, withheld, fidelity, pins)
    report = relative_output(
        {
            "case": "last-good-manifest-climb",
            "toolchain": pins,
            "disk_latest_version": DISK_LATEST,
            "seed_latest_version": SEED_LATEST,
            "expected_bindings": BINDINGS,
            "seed_command": list(MANIFEST_COMMAND),
            "refresh_command": list(REFRESH_COMMAND),
            "seeded_manifests": seeded,
            "present": present,
            "refresh_command_fidelity": fidelity,
            "withheld": {
                key: value for key, value in withheld.items() if key != "projects"
            }
            | {
                "projects": {
                    project: {
                        **row,
                        "error_excerpt": [
                            line.replace(str(args.work), ".work/last-good-climb")
                            for line in row["error_excerpt"]
                        ],
                    }
                    for project, row in withheld["projects"].items()
                }
            },
            "errors": errors,
        }
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"wrote {args.report}", flush=True)
    if errors:
        for error in errors:
            print(error, file=sys.stderr, flush=True)
        return 1
    print("present PASS withheld PASS", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired:
        print("dbt command timed out", file=sys.stderr)
        raise SystemExit(1) from None
