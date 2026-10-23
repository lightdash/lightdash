import argparse
import hashlib
import importlib.metadata
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
PROJECT_UUID = "7d1f3c2e-9a4b-4c5d-8e6f-0b1c2d3e4f5a"
CONNECTION_GROUP = "original"
CONFIRMED_EVENT = "dbt.compile.crossSourceLastGoodConfirmed"
RESOLVED_EVENT = "dbt.compile.crossSourceRefsResolved"
CONFIRMED_PATTERN = re.compile(
    r"^dbt\.compile\.crossSourceLastGoodConfirmed rowsWritten=(\d+) "
    r"projectUuid=(\S+) connectionGroup=(\S+)$"
)
RESOLVED_PATTERN = re.compile(
    r"^dbt\.compile\.crossSourceRefsResolved diskEvictions=(\d+) "
    r"diskRecreations=(\d+) ownedInjected=(\d+) packageNodesOmitted=(\d+)$"
)
EXPECTED_OWNED_INJECTED = {"proj_alpha": 3, "proj_beta": 1}
PACKAGE = FIXTURE / "package"
PACKAGE_NAME = "shared_pkg"
PACKAGE_OWNERS = ("proj_owner_one", "proj_owner_two")
PACKAGE_CONSUMER = "proj_consumer"
PACKAGE_BINDINGS = {
    "report": [
        "model.proj_owner_one.shared_model",
        "model.proj_owner_two.owned_other",
    ]
}
PACKAGE_NODE_ID = f"model.{PACKAGE_NAME}.shared_model"


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


def owner_identity(manifest):
    return (manifest.get("metadata") or {}).get("project_name") or None


def confirmed_message(
    rows_written, project_uuid=PROJECT_UUID, connection_group=CONNECTION_GROUP
):
    message = (
        f"{CONFIRMED_EVENT} rowsWritten={rows_written} "
        f"projectUuid={project_uuid} connectionGroup={connection_group}"
    )
    return (
        message,
        {
            "event": CONFIRMED_EVENT,
            "projectUuid": project_uuid,
            "connectionGroup": connection_group,
            "rowsWritten": rows_written,
        },
    )


def resolved_message(
    owned_injected, package_nodes_omitted, sources, project_uuid=PROJECT_UUID
):
    message = (
        f"{RESOLVED_EVENT} diskEvictions=0 diskRecreations=0 "
        f"ownedInjected={owned_injected} packageNodesOmitted={package_nodes_omitted}"
    )
    return (
        message,
        {
            "event": RESOLVED_EVENT,
            "projectUuid": project_uuid,
            "diskEvictions": 0,
            "diskRecreations": 0,
            "cacheRowsLoaded": len(
                {name for source in sources for name in source["injectedFrom"]}
            ),
            "ownedInjected": owned_injected,
            "packageNodesOmitted": package_nodes_omitted,
            "sources": sources,
        },
    )


class EventLog:
    def __init__(self):
        self.entries = []

    def info(self, message, meta):
        print(message, flush=True)
        self.entries.append({"message": message, "meta": meta})

    def named(self, event):
        return [entry for entry in self.entries if entry["meta"]["event"] == event]


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


def _public_payloads(nodes, project_name):
    payloads = []
    if project_name is None:
        return payloads
    for node in nodes:
        if not _is_real_resource(node) or node.get("package_name") != project_name:
            continue
        if resolved_access(node) != "public":
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


def package_nodes_omitted(manifest):
    owner = owner_identity(manifest)
    if owner is None:
        return 0
    return sum(
        1
        for node in manifest["nodes"].values()
        if _is_real_resource(node) and node.get("package_name") != owner
    )


def projection(manifest, project_name=None):
    owner = owner_identity(manifest) if project_name is None else project_name
    return _public_payloads(manifest["nodes"].values(), owner)


def external_nodes(manifest, project_name=None):
    return _restrict_depends_on(projection(manifest, project_name))


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


def store_digest(store, projects=PROJECTS):
    return {
        project: hashlib.sha256(manifest_path(store, project).read_bytes()).hexdigest()
        for project in projects
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


def injection_report(store, upstreams):
    payloads = []
    owners = {}
    identities = {}
    omitted = 0
    for upstream in upstreams:
        path = manifest_path(store, upstream)
        if not path.is_file():
            raise FileNotFoundError(path)
        manifest = json.loads(path.read_text())
        identities[upstream] = owner_identity(manifest)
        omitted += package_nodes_omitted(manifest)
        for payload in projection(manifest):
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
    nodes = _restrict_depends_on(payloads)
    return {
        "nodes": nodes,
        "owners": identities,
        "owned_injected": len(nodes),
        "package_nodes_omitted": omitted,
    }


def injection_for(store, upstreams):
    return injection_report(store, upstreams)["nodes"]


def binding(manifest, project, model):
    node = manifest["nodes"].get(f"model.{project}.{model}")
    if node is None:
        return None
    return list(node.get("depends_on", {}).get("nodes", []))


def confirm_store(store, published, events):
    for project in published:
        if not manifest_path(store, project).is_file():
            raise RuntimeError(f"last-good store has no manifest for {project}")
    events.info(*confirmed_message(len(published)))


def seed_last_good(dbt, work, events):
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
    confirm_store(store, PROJECTS, events)
    return store


def present_case(dbt, work, store, events):
    before = store_digest(store)
    results = {}
    sources = []
    owned_injected = 0
    omitted = 0
    for project in PROJECTS:
        missing = missing_upstreams(store, UPSTREAMS[project])
        if missing:
            raise RuntimeError(cold_start_warning(project, missing))
        nodes_path = work / "present" / f"{project}-nodes.json"
        nodes_path.parent.mkdir(parents=True, exist_ok=True)
        injection = injection_report(store, UPSTREAMS[project])
        nodes = injection["nodes"]
        owned_injected += injection["owned_injected"]
        omitted += injection["package_nodes_omitted"]
        sources.append(
            {
                "name": project,
                "injectedFrom": list(UPSTREAMS[project]),
                "injectedStubs": injection["owned_injected"],
            }
        )
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
            "owned_injected": injection["owned_injected"],
            "package_nodes_omitted": injection["package_nodes_omitted"],
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
    events.info(*resolved_message(owned_injected, omitted, sources))
    return {
        "command": list(REFRESH_COMMAND),
        "success": all(
            row["returncode"] == 0
            and not row["cycle_error"]
            and row["bindings"] == BINDINGS[project]
            for project, row in results.items()
        ),
        "store_unchanged": store_digest(store) == before,
        "owned_injected": owned_injected,
        "package_nodes_omitted": omitted,
        "projects": results,
    }


def withheld_case(dbt, work, store, events):
    confirmed_before = len(events.named(CONFIRMED_EVENT))
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
        "confirmations_logged": len(events.named(CONFIRMED_EVENT)) - confirmed_before,
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
    packages = {}
    for name in ("dbt-core", "dbt-postgres"):
        try:
            packages[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            continue
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


def run_deps(dbt, project_dir, logs):
    if logs.exists():
        shutil.rmtree(logs)
    completed = subprocess.run(
        [
            dbt,
            "--no-use-colors",
            "deps",
            "--project-dir",
            str(project_dir),
            "--profiles-dir",
            str(PROFILES),
            "--profile",
            "last_good_climb",
            "--target",
            "dev",
            "--log-path",
            str(logs),
        ],
        cwd=project_dir,
        env=dbt_environment(),
        text=True,
        capture_output=True,
        timeout=180,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"{completed.stdout}\n{completed.stderr}")
    return sorted(path.name for path in (Path(project_dir) / "dbt_packages").iterdir())


def package_case(dbt, work, events):
    root = work / "package-share"
    if root.exists():
        shutil.rmtree(root)
    projects = root / "projects"
    shutil.copytree(PACKAGE, projects)
    store = root / "last-good"
    owners = {}
    for owner in PACKAGE_OWNERS:
        installed = run_deps(dbt, projects / owner, root / f"{owner}-deps-logs")
        target = root / "seed-target" / owner
        parsed = run_parse(dbt, projects / owner, target)
        if parsed["returncode"] != 0:
            raise RuntimeError(parsed["output"])
        publish_manifest(target, store, owner)
        manifest = parsed["manifest"]
        owners[owner] = {
            "installed_packages": installed,
            "owner": owner_identity(manifest),
            "nodes": sorted(
                key
                for key, node in manifest["nodes"].items()
                if _is_real_resource(node)
            ),
            "package_nodes": sorted(
                key
                for key, node in manifest["nodes"].items()
                if _is_real_resource(node) and node["package_name"] == PACKAGE_NAME
            ),
            "projection": [
                {
                    "id": canonical_injected_id(payload),
                    "depends_on_nodes": payload["depends_on_nodes"],
                }
                for payload in projection(manifest)
            ],
            "package_nodes_omitted": package_nodes_omitted(manifest),
        }
    confirm_store(store, PACKAGE_OWNERS, events)
    before = store_digest(store, PACKAGE_OWNERS)
    injection = injection_report(store, PACKAGE_OWNERS)
    nodes_path = root / f"{PACKAGE_CONSUMER}-nodes.json"
    nodes_path.write_text(json.dumps(injection["nodes"]))
    parsed = run_parse(
        dbt,
        projects / PACKAGE_CONSUMER,
        root / "present" / PACKAGE_CONSUMER,
        nodes_path,
        command=REFRESH_COMMAND,
    )
    if parsed["manifest"] is None:
        raise RuntimeError(parsed["output"])
    manifest = parsed["manifest"]
    ownerless_manifest = json.loads(manifest_path(store, PACKAGE_OWNERS[0]).read_text())
    ownerless_manifest["metadata"].pop("project_name", None)
    events.info(
        *resolved_message(
            injection["owned_injected"],
            injection["package_nodes_omitted"],
            [
                {
                    "name": PACKAGE_CONSUMER,
                    "injectedFrom": list(PACKAGE_OWNERS),
                    "injectedStubs": injection["owned_injected"],
                }
            ],
        )
    )
    injected_ids = sorted(canonical_injected_id(node) for node in injection["nodes"])
    consumer = {
        "returncode": parsed["returncode"],
        "cycle_error": parsed["cycle_error"]
        or find_cycle(model_edges(manifest, True)) is not None
        or find_cycle(model_edges(manifest, False)) is not None,
        "bindings": {
            model: binding(manifest, PACKAGE_CONSUMER, model)
            for model in PACKAGE_BINDINGS
        },
        "package_node_in_manifest": PACKAGE_NODE_ID in manifest["nodes"],
        "injected": injected_ids,
        "injected_depends_on": {
            canonical_injected_id(node): node["depends_on_nodes"]
            for node in injection["nodes"]
        },
    }
    ownerless = {
        "owner": owner_identity(ownerless_manifest),
        "nodes": len(external_nodes(ownerless_manifest)),
        "package_nodes_omitted": package_nodes_omitted(ownerless_manifest),
    }
    return {
        "command": list(REFRESH_COMMAND),
        "package": PACKAGE_NAME,
        "owners": owners,
        "consumer": consumer,
        "owned_injected": injection["owned_injected"],
        "package_nodes_omitted": injection["package_nodes_omitted"],
        "ownerless_projection": ownerless,
        "store_unchanged": store_digest(store, PACKAGE_OWNERS) == before,
        "success": consumer["returncode"] == 0
        and not consumer["cycle_error"]
        and consumer["bindings"] == PACKAGE_BINDINGS
        and not consumer["package_node_in_manifest"]
        and injected_ids == sorted(PACKAGE_BINDINGS["report"])
        and all(not deps for deps in consumer["injected_depends_on"].values())
        and all(row["package_nodes"] == [PACKAGE_NODE_ID] for row in owners.values()),
    }


def assert_markers(events, present, package, withheld):
    errors = []
    confirmed = events.named(CONFIRMED_EVENT)
    if [entry["meta"]["rowsWritten"] for entry in confirmed] != [
        len(PROJECTS),
        len(PACKAGE_OWNERS),
    ]:
        errors.append("last-good confirmations were not logged once per seeded store")
    for entry in confirmed:
        match = CONFIRMED_PATTERN.match(entry["message"])
        meta = entry["meta"]
        if (
            match is None
            or int(match.group(1)) != meta["rowsWritten"]
            or match.group(2) != meta["projectUuid"]
            or match.group(3) != meta["connectionGroup"]
            or set(meta) != {"event", "projectUuid", "connectionGroup", "rowsWritten"}
        ):
            errors.append(
                "crossSourceLastGoodConfirmed marker does not match the product"
            )
    if withheld["confirmations_logged"] != 0:
        errors.append("withheld run logged a last-good confirmation")
    resolved = events.named(RESOLVED_EVENT)
    expected = [
        (present["owned_injected"], present["package_nodes_omitted"]),
        (package["owned_injected"], package["package_nodes_omitted"]),
    ]
    if [
        (entry["meta"]["ownedInjected"], entry["meta"]["packageNodesOmitted"])
        for entry in resolved
    ] != expected:
        errors.append("crossSourceRefsResolved counts do not match the resolutions")
    for entry in resolved:
        match = RESOLVED_PATTERN.match(entry["message"])
        meta = entry["meta"]
        if (
            match is None
            or int(match.group(3)) != meta["ownedInjected"]
            or int(match.group(4)) != meta["packageNodesOmitted"]
            or not entry["message"].endswith(
                f" ownedInjected={meta['ownedInjected']} "
                f"packageNodesOmitted={meta['packageNodesOmitted']}"
            )
        ):
            errors.append("crossSourceRefsResolved marker does not match the product")
    return errors


def assert_contract(present, withheld, fidelity, pins, package, events):
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
    if {
        project: row["owned_injected"] for project, row in present["projects"].items()
    } != EXPECTED_OWNED_INJECTED:
        errors.append("present climb did not inject every owned public node")
    if present["package_nodes_omitted"] != 0:
        errors.append("the project ring omitted a node it does not install")
    if not package["success"] or not package["store_unchanged"]:
        errors.append("package share did not keep the installed package local")
    if package["consumer"]["bindings"] != PACKAGE_BINDINGS:
        errors.append("package consumer did not bind the owned public models")
    if package["consumer"]["package_node_in_manifest"]:
        errors.append("an installed-package node crossed into the consumer")
    if package["owned_injected"] != len(PACKAGE_OWNERS):
        errors.append("package share injected a node that is not project-owned")
    if package["package_nodes_omitted"] != len(PACKAGE_OWNERS):
        errors.append("package share did not omit every installed-package node")
    if any(
        row["projection"]
        != [{"id": f"model.{owner}.{model}", "depends_on_nodes": [PACKAGE_NODE_ID]}]
        for owner, model, row in (
            (owner, model, package["owners"][owner])
            for owner, model in zip(PACKAGE_OWNERS, ("shared_model", "owned_other"))
        )
    ):
        errors.append("owner projection did not export exactly its own public model")
    if package["ownerless_projection"]["nodes"] != 0:
        errors.append("a manifest without an owner identity exported nodes")
    errors.extend(assert_markers(events, present, package, withheld))
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
    events = EventLog()
    store = seed_last_good(args.dbt, args.work, events)
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
    present = present_case(args.dbt, args.work, store, events)
    withheld = withheld_case(args.dbt, args.work, store, events)
    fidelity = refresh_cycle_probe(args.dbt, args.work)
    package = package_case(args.dbt, args.work, events)
    errors = assert_contract(present, withheld, fidelity, pins, package, events)
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
            "share_policy": "project-owned public models, seeds and snapshots",
            "present": present,
            "refresh_command_fidelity": fidelity,
            "package_share": package,
            "markers": events.entries,
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
    print("present PASS withheld PASS package-share PASS", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired:
        print("dbt command timed out", file=sys.stderr)
        raise SystemExit(1) from None
