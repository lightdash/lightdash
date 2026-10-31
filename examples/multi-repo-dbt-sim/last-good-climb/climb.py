import argparse
import errno
import functools
import gzip
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

import product_path

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
SOURCE_UUIDS = {
    "proj_alpha": "a1b2c3d4-0001-4a00-8000-00000000a1fa",
    "proj_beta": "a1b2c3d4-0002-4a00-8000-00000000be7a",
}
# packages/backend/src/dbt/dbtExternalNodes.ts:98 (parseMissingDbtNodeReferences)
DBT_MISSING_REF = re.compile(
    r"depends on a node named '([^']+)'(?: with version '([^']*)')?"
    r"(?: in package or project '([^']+)'(?: with version '([^']*)')?)? which was not found"
)
CACHE_ERROR_EVENT = "dbt.compile.crossSourceCacheError"
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


def parse_missing_refs(output):
    """Mirror parseMissingDbtNodeReferences: one entry per distinct missing ref."""
    refs = {}
    for model, model_version, package, project_version in DBT_MISSING_REF.findall(
        output
    ):
        ref = {
            "model": model,
            "packageName": package or None,
            "version": model_version or project_version or None,
        }
        refs.setdefault(
            f"{ref['packageName']}.{ref['model']}.{ref['version'] or ''}", ref
        )
    return list(refs.values())


def ref_label(ref):
    # packages/backend/src/projectAdapters/crossSourceRefs.ts:93
    package = "" if ref["packageName"] is None else f"'{ref['packageName']}', "
    version = "" if ref["version"] is None else f", v={ref['version']}"
    return f"ref({package}'{ref['model']}'{version})"


# packages/common/src/dbt/crossSourceRefs.ts:21
CROSS_SOURCE_MODEL_HINT = (
    "Check that the model (or version) is present in the provider project and "
    "has access: public."
)
# packages/common/src/dbt/crossSourceRefs.ts:40
CLI_HINT_SUFFIX = (
    f" {CROSS_SOURCE_MODEL_HINT} Local dbt commands must resolve cross-project "
    "refs before deployment."
)
# packages/common/src/dbt/crossSourceRefs.ts:33
TRAILING_FORMATTING = re.compile(r"(?:\s|\x1b\[[0-?]*[ -/]*[@-~])+$")


def cli_hinted(dbt_text):
    """Mirror withCrossSourceDbtCliHint: end dbt's sentence with a full stop unless it has one, keep its trailing formatting, then add the hint."""
    body = TRAILING_FORMATTING.sub("", dbt_text)
    punctuation = "" if re.search(r"[.!?]$", body) else "."
    return f"{body}{punctuation}{dbt_text[len(body) :]}{CLI_HINT_SUFFIX}"


def missing_ref_reason(consumer, ref, provider, catalog_source):
    # packages/backend/src/projectAdapters/crossSourceRefs.ts:561
    manifest = (
        "fresh manifest"
        if catalog_source == "fresh"
        else "confirmed last-good manifest"
    )
    return (
        f'dbt source "{consumer}" references {ref_label(ref)}, but the {manifest} '
        f'of dbt source "{provider}" does not define that model (or version).'
    )


def fresh_unconfirmed_reason(consumer, ref, provider):
    # packages/backend/src/projectAdapters/crossSourceRefs.ts:564
    return (
        f"{missing_ref_reason(consumer, ref, provider, 'fresh')} "
        f'dbt source "{provider}" has no confirmed last-good manifest yet. '
        f"{CROSS_SOURCE_MODEL_HINT}"
    )


def unresolved_ref_reason(consumer, ref):
    # packages/backend/src/projectAdapters/crossSourceRefs.ts:568
    return (
        f'dbt source "{consumer}" references {ref_label(ref)}, which could not be '
        "resolved from its selected public upstreams. Declare the upstream project "
        "in dependencies.yml or use a literal ref('project', 'model')."
    )


def product_cold_start_reason(consumer, ref, provider, project_name):
    # packages/backend/src/projectAdapters/crossSourceRefs.ts:398 and :540
    return (
        f'Cold start: dbt source "{consumer}" references dbt source "{provider}" '
        f'(project "{project_name}"), but that upstream source has no confirmed '
        "last-good manifest. This refresh will try to seed the upstream in "
        f'dependency order before compiling this consumer. dbt source "{consumer}" '
        f"could not resolve {ref_label(ref)} during its single parse."
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


def load_manifest(store, project):
    path = manifest_path(store, project)
    if not path.is_file():
        raise FileNotFoundError(path)
    return json.loads(path.read_text())


FRESH = "fresh"
CONFIRMED = "confirmed"


def provider_catalogs(store, upstreams, fresh=None):
    fresh = fresh or {}
    return {
        upstream: (
            (FRESH, fresh[upstream])
            if upstream in fresh
            else (CONFIRMED, load_manifest(store, upstream))
        )
        for upstream in upstreams
    }


def injection_report(store, upstreams, fresh=None):
    payloads = []
    owners = {}
    identities = {}
    omitted = 0
    catalogs = provider_catalogs(store, upstreams, fresh)
    for upstream, (_, manifest) in catalogs.items():
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
        "catalog_sources": {
            upstream: source for upstream, (source, _) in catalogs.items()
        },
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
            "missing_refs": parse_missing_refs(parsed["output"]),
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


def run_deps(dbt, project_dir, logs, *, profiles_dir=None, profile="last_good_climb"):
    logs = Path(logs)
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
            str(profiles_dir or PROFILES),
            "--profile",
            profile,
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


BROKEN_REF = "missing_model"


def write_broken_copy(project_dir, destination):
    destination = Path(destination)
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(project_dir, destination)
    (destination / "models" / "broken.sql").write_text(
        f"select * from {{{{ ref('{BROKEN_REF}') }}}}\n", encoding="utf-8"
    )
    return destination


def injected_summary(nodes):
    return sorted(
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
    )


def ring_refresh(dbt, work, store, order, broken=(), broken_explore=()):
    """Refresh the ring in `order`; a provider that parsed this run supplies its fresh manifest, otherwise its confirmed store manifest."""
    work = Path(work)
    work.mkdir(parents=True, exist_ok=True)
    fresh = {}
    failed = []
    projects = {}
    sources = []
    owned_injected = 0
    omitted = 0
    for project in order:
        missing = [
            upstream
            for upstream in missing_upstreams(store, UPSTREAMS[project])
            if upstream not in fresh
        ]
        if missing:
            raise RuntimeError(cold_start_warning(project, missing))
        injection = injection_report(store, UPSTREAMS[project], fresh)
        owned_injected += injection["owned_injected"]
        omitted += injection["package_nodes_omitted"]
        sources.append(
            {
                "name": project,
                "injectedFrom": list(UPSTREAMS[project]),
                "injectedStubs": injection["owned_injected"],
            }
        )
        nodes_path = work / f"{project}-nodes.json"
        nodes_path.write_text(json.dumps(injection["nodes"]))
        if project in broken:
            project_dir = write_broken_copy(DISK / project, work / "broken" / project)
        elif project in broken_explore:
            project_dir = write_broken_explore_copy(
                DISK / project, work / "broken-explore" / project
            )
        else:
            project_dir = DISK / project
        parsed = run_parse(
            dbt, project_dir, work / project, nodes_path, command=REFRESH_COMMAND
        )
        if parsed["command"] != list(REFRESH_COMMAND):
            raise RuntimeError("ring refresh did not run dbt ls")
        if parsed["manifest"] is None:
            failed.append(project)
            bindings = None
        else:
            fresh[project] = parsed["manifest"]
            bindings = {
                model: binding(parsed["manifest"], project, model)
                for model in BINDINGS[project]
            }
        projects[project] = {
            "returncode": parsed["returncode"],
            "unresolved": parsed["unresolved"],
            "cycle_error": parsed["cycle_error"],
            "error_excerpt": [
                line.replace(str(work), ".work/last-good-climb")
                for line in parsed["output"].splitlines()
                if UNRESOLVED_TEXT in line
            ],
            "missing_refs": parse_missing_refs(parsed["output"]),
            "bindings": bindings,
            "catalog_sources": injection["catalog_sources"],
            "owned_injected": injection["owned_injected"],
            "injected": injected_summary(injection["nodes"]),
        }
    return {
        "command": list(REFRESH_COMMAND),
        "order": list(order),
        "broken": list(broken),
        "broken_explore": list(broken_explore),
        "fresh_parsed": sorted(fresh),
        "failed": failed,
        "projects": projects,
        "owned_injected": owned_injected,
        "package_nodes_omitted": omitted,
        "sources": sources,
        "fresh": fresh,
    }


def measure_nodes(row):
    return [node for node in row["injected"] if node["name"] == VERSIONED_MODEL]


def fresh_over_seed_case(dbt, work, store, events):
    before = store_digest(store)
    root = work / "fresh-over-seed"
    runs = {
        "alpha_first": ring_refresh(dbt, root / "alpha-first", store, PROJECTS),
        "beta_first": ring_refresh(
            dbt, root / "beta-first", store, tuple(reversed(PROJECTS))
        ),
        "failed_provider": ring_refresh(
            dbt,
            root / "failed-provider",
            store,
            tuple(reversed(PROJECTS)),
            broken=("proj_beta",),
        ),
    }
    for run in runs.values():
        events.info(
            *resolved_message(
                run["owned_injected"], run["package_nodes_omitted"], run["sources"]
            )
        )
    alpha_first = runs["alpha_first"]["projects"]
    beta_first = runs["beta_first"]["projects"]
    failed = runs["failed_provider"]["projects"]
    checks = {
        "ring_first_source_uses_confirmed_seed": alpha_first["proj_alpha"][
            "catalog_sources"
        ]
        == {"proj_beta": CONFIRMED}
        and alpha_first["proj_alpha"]["bindings"] == BINDINGS["proj_alpha"],
        "second_source_takes_fresh_provider": alpha_first["proj_beta"][
            "catalog_sources"
        ]
        == {"proj_alpha": FRESH}
        and alpha_first["proj_beta"]["bindings"] == BINDINGS["proj_beta"]
        and [node["name"] for node in alpha_first["proj_beta"]["injected"]]
        == ["alpha_base", "alpha_report"],
        "fresh_latest_version_wins": beta_first["proj_alpha"]["catalog_sources"]
        == {"proj_beta": FRESH}
        and beta_first["proj_alpha"]["bindings"]
        == {"alpha_report": ["model.proj_beta.measure.v2"]}
        and [node["version"] for node in measure_nodes(beta_first["proj_alpha"])]
        == [2, 3]
        and {node["latest_version"] for node in measure_nodes(beta_first["proj_alpha"])}
        == {DISK_LATEST[VERSIONED_MODEL]},
        "failed_provider_falls_back_to_seed": runs["failed_provider"]["failed"]
        == ["proj_beta"]
        and failed["proj_beta"]["returncode"] != 0
        and failed["proj_beta"]["unresolved"]
        and failed["proj_alpha"]["catalog_sources"] == {"proj_beta": CONFIRMED}
        and failed["proj_alpha"]["bindings"] == BINDINGS["proj_alpha"]
        and [node["version"] for node in measure_nodes(failed["proj_alpha"])]
        == [SEED_LATEST[VERSIONED_MODEL]],
        "every_parse_exited_cleanly": all(
            row["returncode"] == 0 and not row["cycle_error"]
            for name, run in runs.items()
            for project, row in run["projects"].items()
            if project not in run["failed"]
        ),
        "store_unchanged": store_digest(store) == before,
    }
    return {
        "command": list(REFRESH_COMMAND),
        "runs": {
            name: {key: value for key, value in run.items() if key != "fresh"}
            for name, run in runs.items()
        },
        "checks": checks,
        "success": all(checks.values()),
    }


def confirm_fresh(store, fresh, events, failed_sources=(), unattributed=False):
    """Mirror persistArtifacts and CrossSourceCatalogCache.confirm.

    Attributed explore errors discard their source; an unattributed error
    withholds every confirmation. Rows are staged and renamed together, and a
    failed write logs the product's cache error instead of a confirmation.
    """
    if unattributed:
        return None
    entries = [project for project in fresh if project not in set(failed_sources)]
    staged = []
    try:
        for project in entries:
            destination = manifest_path(store, project)
            destination.parent.mkdir(parents=True, exist_ok=True)
            temp = destination.with_name(f"manifest.json.tmp-{os.getpid()}")
            with open(temp, "wb") as handle:
                handle.write(json.dumps(fresh[project]).encode("utf-8"))
                handle.flush()
                os.fsync(handle.fileno())
            staged.append((temp, destination))
        for temp, destination in staged:
            os.replace(temp, destination)
    except OSError as error:
        for temp, _ in staged:
            try:
                temp.unlink()
            except OSError:
                pass
        events.info(*cache_error_message(error))
        return None
    events.info(*confirmed_message(len(entries)))
    return len(entries)


def cache_error_message(error):
    # packages/backend/src/projectAdapters/crossSourceCatalogCache.ts:6
    return (
        CACHE_ERROR_EVENT,
        {
            "event": CACHE_ERROR_EVENT,
            "message": str(error),
            "code": errno.errorcode.get(error.errno) if error.errno else None,
        },
    )


BROKEN_EXPLORE_MODEL = "bad_meta"


def write_broken_explore_copy(project_dir, destination):
    """A model dbt parses but the explore compiler rejects: an unknown metric type."""
    destination = Path(destination)
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(project_dir, destination)
    (destination / "models" / f"{BROKEN_EXPLORE_MODEL}.sql").write_text(
        "select 1 as id\n", encoding="utf-8"
    )
    (destination / "models" / f"{BROKEN_EXPLORE_MODEL}.yml").write_text(
        "version: 2\n"
        "models:\n"
        f"    - name: {BROKEN_EXPLORE_MODEL}\n"
        "      access: protected\n"
        "      config:\n"
        "          meta:\n"
        "              metrics:\n"
        "                  broken:\n"
        "                      type: not_a_metric_type\n"
        "      columns:\n"
        "          - name: id\n"
        "            data_type: integer\n",
        encoding="utf-8",
    )
    return destination


def atomic_write_bytes(destination, data):
    """Write through a sibling temp file and rename; a failed write leaves nothing behind."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_name(f"{destination.name}.tmp-{os.getpid()}")
    try:
        with open(temp, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, destination)
    except OSError:
        try:
            temp.unlink()
        except OSError:
            pass
        raise


def write_fresh_manifests(fresh, directory):
    paths = {}
    for project, manifest in fresh.items():
        path = Path(directory) / project / "manifest.json"
        atomic_write_bytes(path, json.dumps(manifest).encode("utf-8"))
        paths[project] = path
    return paths


def real_model_count(manifest):
    return sum(
        1
        for node in manifest["nodes"].values()
        if node.get("resource_type") == "model"
        and (node.get("path") or node.get("original_file_path"))
    )


def compile_fresh_explores(fresh, work, attributed=True):
    """Compile fresh manifests with the product explore compiler; attribute errors as persistArtifacts does."""
    paths = write_fresh_manifests(fresh, Path(work) / "fresh-manifests")
    result = product_path.compile_explores(
        [
            {
                "name": project,
                "uuid": SOURCE_UUIDS[project] if attributed else None,
                "manifestPath": str(path),
            }
            for project, path in paths.items()
        ],
        Path(work) / "compile-explores",
    )
    by_uuid = {uuid: project for project, uuid in SOURCE_UUIDS.items()}
    attribution = result["attribution"]
    return {
        "product_sha": result["productSha"],
        "attributed": attributed,
        "compiled": result["compiled"],
        "rows": result["explores"],
        "explores_compiled": sum(1 for row in result["explores"] if not row["error"]),
        "expected_explores": sum(
            real_model_count(manifest) for manifest in fresh.values()
        ),
        "errors": [
            {
                "source": row["source"],
                "name": row["name"],
                "errors": row["errors"],
                "attributed_source": by_uuid.get(row["attributedSourceUuid"]),
            }
            for row in result["explores"]
            if row["error"]
        ],
        "failed_sources": sorted(
            by_uuid[uuid] for uuid in attribution["failedSourceUuids"]
        ),
        "unattributed": not attribution["successfulCompile"],
        "unattributed_errors": attribution["unattributedErrors"],
    }


CONFIRM_SCENARIOS = {
    "healthy": {"broken_explore": (), "attributed": True},
    "other_source_error": {"broken_explore": ("proj_beta",), "attributed": True},
    "every_source_error": {"broken_explore": PROJECTS, "attributed": True},
    "unattributed_error": {"broken_explore": ("proj_beta",), "attributed": False},
}


def per_provider_confirm_case(dbt, work, store, events):
    root = work / "per-provider-confirm"
    if root.exists():
        shutil.rmtree(root)
    seed_digest = store_digest(store)
    scenarios = {}
    for name, scenario in CONFIRM_SCENARIOS.items():
        scenario_store = root / name / "last-good"
        shutil.copytree(store, scenario_store)
        confirmed_before = len(events.named(CONFIRMED_EVENT))
        run = ring_refresh(
            dbt,
            root / name / "refresh",
            scenario_store,
            PROJECTS,
            broken_explore=scenario["broken_explore"],
        )
        if run["failed"]:
            raise RuntimeError(f"ring refresh failed before confirmation: {run}")
        events.info(
            *resolved_message(
                run["owned_injected"], run["package_nodes_omitted"], run["sources"]
            )
        )
        explores = compile_fresh_explores(
            run["fresh"], root / name, attributed=scenario["attributed"]
        )
        rows_written = confirm_fresh(
            scenario_store,
            run["fresh"],
            events,
            explores["failed_sources"],
            explores["unattributed"],
        )
        after = store_digest(scenario_store)
        changed = sorted(
            project for project in PROJECTS if after[project] != seed_digest[project]
        )
        fallback = ring_refresh(
            dbt, root / name / "after-confirm", scenario_store, ("proj_alpha",)
        )
        alpha_after = fallback["projects"]["proj_alpha"]
        scenarios[name] = {
            "broken_explore": list(scenario["broken_explore"]),
            "attributed": scenario["attributed"],
            "explores": {
                key: value for key, value in explores.items() if key != "rows"
            },
            "failed_sources": explores["failed_sources"],
            "unattributed": explores["unattributed"],
            "rows_written": rows_written,
            "confirmations_logged": len(events.named(CONFIRMED_EVENT))
            - confirmed_before,
            "store_changed": changed,
            "store_measure_latest": [
                node["latest_version"]
                for node in projection(load_manifest(scenario_store, "proj_beta"))
                if node["name"] == VERSIONED_MODEL
            ],
            "alpha_refresh_after_confirm": {
                "returncode": alpha_after["returncode"],
                "bindings": alpha_after["bindings"],
                "measure_versions": [
                    node["version"] for node in measure_nodes(alpha_after)
                ],
            },
            "resolution": {
                key: value
                for key, value in run.items()
                if key in ("owned_injected", "package_nodes_omitted", "fresh_parsed")
            },
        }
    healthy = scenarios["healthy"]
    other = scenarios["other_source_error"]
    every = scenarios["every_source_error"]
    unattributed = scenarios["unattributed_error"]

    def broken_errors(scenario, source):
        return [
            error
            for error in scenario["explores"]["errors"]
            if error["source"] == source
        ]

    def only_broken_model(scenario, sources):
        return all(
            error["name"] == BROKEN_EXPLORE_MODEL
            and error["attributed_source"] == error["source"]
            and [item["type"] for item in error["errors"]] == ["METADATA_PARSE_ERROR"]
            for error in scenario["explores"]["errors"]
        ) and sorted(
            {error["source"] for error in scenario["explores"]["errors"]}
        ) == sorted(sources)

    checks = {
        "healthy_compiles_every_explore": healthy["explores"]["errors"] == []
        and healthy["explores"]["explores_compiled"]
        == healthy["explores"]["expected_explores"]
        > 0,
        "healthy_confirms_every_provider": healthy["rows_written"] == len(PROJECTS)
        and healthy["store_changed"] == sorted(PROJECTS)
        and healthy["store_measure_latest"] == [2, 2]
        and healthy["alpha_refresh_after_confirm"]["bindings"]
        == {"alpha_report": ["model.proj_beta.measure.v2"]},
        "explore_error_is_real_and_attributed_to_its_source": only_broken_model(
            other, ["proj_beta"]
        )
        and len(broken_errors(other, "proj_beta")) == 1
        and other["failed_sources"] == ["proj_beta"]
        and not other["unattributed"],
        "unrelated_error_does_not_block_healthy_provider": other["rows_written"] == 1
        and other["store_changed"] == ["proj_alpha"]
        and other["confirmations_logged"] == 1,
        "failed_provider_keeps_its_seed": other["store_measure_latest"] == [3]
        and other["alpha_refresh_after_confirm"]["bindings"] == BINDINGS["proj_alpha"]
        and other["alpha_refresh_after_confirm"]["measure_versions"] == [3],
        "every_attributed_error_writes_nothing": only_broken_model(every, PROJECTS)
        and every["failed_sources"] == sorted(PROJECTS)
        and every["rows_written"] == 0
        and every["store_changed"] == []
        and every["confirmations_logged"] == 1,
        "unattributed_error_withholds_confirmation": unattributed["unattributed"]
        and unattributed["explores"]["unattributed_errors"] == 1
        and unattributed["failed_sources"] == []
        and unattributed["rows_written"] is None
        and unattributed["store_changed"] == []
        and unattributed["confirmations_logged"] == 0
        and unattributed["alpha_refresh_after_confirm"]["bindings"]
        == BINDINGS["proj_alpha"],
        "seed_store_unchanged": store_digest(store) == seed_digest,
    }
    return {
        "command": list(REFRESH_COMMAND),
        "explore_error_signal": (
            "real: the product explore compiler "
            f"({healthy['explores']['product_sha']}) over the fresh manifests"
        ),
        "scenarios": scenarios,
        "checks": checks,
        "success": all(checks.values()),
    }


def tree_digest(directory):
    root = Path(directory)
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def stray_temp_files(*directories):
    return sorted(
        str(path.relative_to(directory))
        for directory in directories
        for path in Path(directory).rglob("*.tmp-*")
    )


def merged_manifest_bytes(fresh):
    """Stand in for upsertMergedManifest: one gzip of the merged source manifests."""
    merged = {"metadata": {"sources": sorted(fresh)}, "nodes": {}}
    for project in sorted(fresh):
        merged["nodes"].update(fresh[project]["nodes"])
    return gzip.compress(json.dumps(merged, sort_keys=True).encode("utf-8"), mtime=0)


EXPLORES_FILE = "explores.json"
MERGED_MANIFEST_FILE = "artefacts/merged-manifest.json.gz"


def publish_explores(published, rows):
    atomic_write_bytes(
        Path(published) / EXPLORES_FILE,
        json.dumps(rows, indent=1, sort_keys=True).encode("utf-8"),
    )


def write_merged_manifest(published, fresh):
    atomic_write_bytes(
        Path(published) / MERGED_MANIFEST_FILE, merged_manifest_bytes(fresh)
    )


def save_refresh(store, published, run, explores, events):
    """Mirror MultiConnectionCompiler.save: publish explores, then persistArtifacts writes the merged manifest and confirms."""
    publish_explores(published, explores["rows"])
    write_merged_manifest(published, run["fresh"])
    return confirm_fresh(
        store,
        run["fresh"],
        events,
        explores["failed_sources"],
        explores["unattributed"],
    )


def _run_quiet(argv):
    return subprocess.run(argv, text=True, capture_output=True, check=False)


def make_immutable(directory):
    if shutil.which("chattr") is None or shutil.which("lsattr") is None:
        return None
    if _run_quiet(["chattr", "+i", str(directory)]).returncode != 0:
        return None
    listed = _run_quiet(["lsattr", "-d", str(directory)]).stdout.split()
    if not listed or "i" not in listed[0]:
        return None
    return "immutable directory (chattr +i)"


def clear_immutable(directory):
    if Path(directory).exists() and shutil.which("chattr") is not None:
        _run_quiet(["chattr", "-i", str(directory)])


def mount_tiny_tmpfs(directory, size_bytes):
    if os.geteuid() != 0 or shutil.which("mount") is None:
        return None
    pages = -(-size_bytes // 4096) * 4096
    completed = _run_quiet(
        [
            "mount",
            "-t",
            "tmpfs",
            "-o",
            f"size={pages}",
            "last-good-harness",
            str(directory),
        ]
    )
    return f"tmpfs of {pages} bytes" if completed.returncode == 0 else None


def tmpfs_bytes_short_of(previous, incoming):
    """A tmpfs that holds the previous artefact and has less free space than the incoming one."""
    pages = -(-len(previous) // 4096)
    free_pages = max(-(-incoming // 4096) - 1, 0)
    return (pages + free_pages) * 4096


def unmount(directory):
    if Path(directory).exists():
        _run_quiet(["umount", str(directory)])


def release_failure_mechanisms(root):
    root = Path(root)
    if not root.exists():
        return
    for scenario in root.iterdir():
        unmount(scenario / "published" / "artefacts")
        for directory in (
            scenario / "published",
            scenario / "published" / "artefacts",
            *(scenario / "last-good" / project for project in PROJECTS),
        ):
            clear_immutable(directory)


PUBLICATION_SCENARIOS = (
    "healthy_save",
    "publication_failure",
    "artefact_write_failure",
    "store_write_failure",
)


def publication_case(dbt, work, store, events):
    """Real publication and artefact-write failures must leave the last-good state served and unconfirmed."""
    root = work / "publication"
    release_failure_mechanisms(root)
    if root.exists():
        shutil.rmtree(root)
    seed_manifests = {project: load_manifest(store, project) for project in PROJECTS}
    seed_digest = store_digest(store)
    scenarios = {}
    for name in PUBLICATION_SCENARIOS:
        base = root / name
        scenario_store = base / "last-good"
        shutil.copytree(store, scenario_store)
        published = base / "published"
        (published / "artefacts").mkdir(parents=True)
        seed_explores = compile_fresh_explores(seed_manifests, base / "seed-explores")
        publish_explores(published, seed_explores["rows"])
        write_merged_manifest(published, seed_manifests)
        confirmed_before = len(events.named(CONFIRMED_EVENT))
        cache_errors_before = len(events.named(CACHE_ERROR_EVENT))
        run = ring_refresh(dbt, base / "refresh", scenario_store, PROJECTS)
        if run["failed"]:
            raise RuntimeError(f"ring refresh failed before publication: {run}")
        events.info(
            *resolved_message(
                run["owned_injected"], run["package_nodes_omitted"], run["sources"]
            )
        )
        explores = compile_fresh_explores(run["fresh"], base)
        mechanism = None
        cleanup = []
        if name == "publication_failure":
            mechanism = make_immutable(published)
            cleanup.append(functools.partial(clear_immutable, published))
        elif name == "artefact_write_failure":
            artefacts = published / "artefacts"
            previous = (published / MERGED_MANIFEST_FILE).read_bytes()
            incoming = len(merged_manifest_bytes(run["fresh"]))
            shutil.rmtree(artefacts)
            artefacts.mkdir()
            mechanism = mount_tiny_tmpfs(
                artefacts, tmpfs_bytes_short_of(previous, incoming)
            )
            if mechanism is not None:
                cleanup.append(functools.partial(unmount, artefacts))
            atomic_write_bytes(published / MERGED_MANIFEST_FILE, previous)
            if mechanism is None:
                mechanism = make_immutable(artefacts)
                cleanup.append(functools.partial(clear_immutable, artefacts))
        elif name == "store_write_failure":
            flags = [make_immutable(scenario_store / project) for project in PROJECTS]
            cleanup.extend(
                functools.partial(clear_immutable, scenario_store / project)
                for project in PROJECTS
            )
            mechanism = flags[0] if all(flags) else None
        if name != "healthy_save" and mechanism is None:
            for action in cleanup:
                action()
            raise RuntimeError(
                f"{name}: this machine offers no way to make the target unwritable"
            )
        before = {
            "store": store_digest(scenario_store),
            "published": tree_digest(published),
        }
        error = None
        try:
            rows_written = save_refresh(
                scenario_store, published, run, explores, events
            )
        except OSError as caught:
            rows_written = None
            error = {
                "type": type(caught).__name__,
                "errno": errno.errorcode.get(caught.errno) if caught.errno else None,
                "message": str(caught).replace(str(work), ".work/last-good-climb"),
            }
        finally:
            stray = stray_temp_files(published, scenario_store)
            after = {
                "store": store_digest(scenario_store),
                "published": tree_digest(published),
            }
            for action in cleanup:
                action()
        fallback = ring_refresh(
            dbt, base / "after-save", scenario_store, ("proj_alpha",)
        )
        alpha_after = fallback["projects"]["proj_alpha"]
        scenarios[name] = {
            "mechanism": mechanism,
            "error": error,
            "rows_written": rows_written,
            "confirmations_logged": len(events.named(CONFIRMED_EVENT))
            - confirmed_before,
            "cache_errors_logged": len(events.named(CACHE_ERROR_EVENT))
            - cache_errors_before,
            "store_changed": sorted(
                project
                for project in PROJECTS
                if after["store"][project] != before["store"][project]
            ),
            "store_matches_seed": after["store"] == seed_digest,
            "published_changed": sorted(
                path
                for path in set(before["published"]) | set(after["published"])
                if before["published"].get(path) != after["published"].get(path)
            ),
            "published_files": sorted(after["published"]),
            "stray_temp_files": stray,
            "fresh_explores": {
                "compiled": explores["explores_compiled"],
                "errors": len(explores["errors"]),
            },
            "alpha_refresh_after_save": {
                "returncode": alpha_after["returncode"],
                "bindings": alpha_after["bindings"],
                "measure_versions": [
                    node["version"] for node in measure_nodes(alpha_after)
                ],
            },
            "resolution": {
                key: value
                for key, value in run.items()
                if key in ("owned_injected", "package_nodes_omitted", "fresh_parsed")
            },
        }
    healthy = scenarios["healthy_save"]
    publication = scenarios["publication_failure"]
    artefact = scenarios["artefact_write_failure"]
    store_failure = scenarios["store_write_failure"]
    seed_binding = {"alpha_report": ["model.proj_beta.measure.v3"]}
    checks = {
        "healthy_save_publishes_and_confirms": healthy["error"] is None
        and healthy["rows_written"] == len(PROJECTS)
        and healthy["published_changed"]
        == sorted([EXPLORES_FILE, MERGED_MANIFEST_FILE])
        and healthy["store_changed"] == sorted(PROJECTS)
        and healthy["stray_temp_files"] == []
        and healthy["alpha_refresh_after_save"]["bindings"]
        == {"alpha_report": ["model.proj_beta.measure.v2"]},
        "publication_failure_is_a_real_write_error": publication["error"] is not None
        and publication["error"]["errno"] in ("EPERM", "EACCES", "EROFS", "ENOSPC"),
        "publication_failure_keeps_last_good": publication["rows_written"] is None
        and publication["confirmations_logged"] == 0
        and publication["store_changed"] == []
        and publication["store_matches_seed"]
        and publication["published_changed"] == []
        and publication["stray_temp_files"] == []
        and publication["alpha_refresh_after_save"]["bindings"] == seed_binding,
        "artefact_write_failure_is_a_real_write_error": artefact["error"] is not None
        and artefact["error"]["errno"] in ("ENOSPC", "EPERM", "EACCES", "EROFS"),
        "artefact_write_failure_keeps_last_good": artefact["rows_written"] is None
        and artefact["confirmations_logged"] == 0
        and artefact["store_changed"] == []
        and artefact["store_matches_seed"]
        and artefact["published_changed"] == [EXPLORES_FILE]
        and artefact["stray_temp_files"] == []
        and artefact["alpha_refresh_after_save"]["bindings"] == seed_binding,
        "store_write_failure_logs_cache_error_not_confirmation": store_failure["error"]
        is None
        and store_failure["rows_written"] is None
        and store_failure["confirmations_logged"] == 0
        and store_failure["cache_errors_logged"] == 1
        and store_failure["store_changed"] == []
        and store_failure["stray_temp_files"] == []
        and store_failure["alpha_refresh_after_save"]["bindings"] == seed_binding,
        "seed_store_unchanged": store_digest(store) == seed_digest,
    }
    return {
        "command": list(REFRESH_COMMAND),
        "order": [
            "publish explores",
            "write merged manifest",
            "confirm last-good rows",
        ],
        "scenarios": scenarios,
        "checks": checks,
        "success": all(checks.values()),
    }


MISSING_MODEL = "absent_model"


def write_missing_ref_copy(project_dir, destination, provider, model=MISSING_MODEL):
    destination = Path(destination)
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(project_dir, destination)
    (destination / "models" / "uses_missing.sql").write_text(
        f"select * from {{{{ ref('{provider}', '{model}') }}}}\n", encoding="utf-8"
    )
    return destination


def write_leaf_copy(project_dir, destination, drop=("beta_report",)):
    destination = Path(destination)
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(project_dir, destination)
    for model in drop:
        (destination / "models" / f"{model}.sql").unlink()
    return destination


def resolver_task(key, project_dir):
    return {"key": key, "projectDir": str(project_dir), "bindings": list(BINDINGS[key])}


def missing_ref_wording_case(dbt, work, store):
    """Run the product resolver on real dbt and hold it to the exact missing-ref wording."""
    root = work / "missing-ref-wording"
    if root.exists():
        shutil.rmtree(root)
    environment = {
        key: dbt_environment()[key]
        for key in ("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE")
    }
    seeded_cache = [
        {"key": project, "manifestPath": str(manifest_path(store, project))}
        for project in PROJECTS
    ]
    alpha_missing = write_missing_ref_copy(
        DISK / "proj_alpha", root / "projects" / "alpha-missing", "proj_beta"
    )
    beta_leaf = write_leaf_copy(DISK / "proj_beta", root / "projects" / "beta-leaf")
    ring = [resolver_task(project, DISK / project) for project in PROJECTS]
    missing = {"model": MISSING_MODEL, "packageName": "proj_beta", "version": None}
    measure = {"model": VERSIONED_MODEL, "packageName": "proj_beta", "version": None}
    alpha_base = {"model": "alpha_base", "packageName": "proj_alpha", "version": None}
    plan = {
        "ring_healthy": (ring, seeded_cache, None),
        "ring_confirmed_missing": (
            [resolver_task("proj_alpha", alpha_missing), ring[1]],
            seeded_cache,
            missing_ref_reason("proj_alpha", missing, "proj_beta", CONFIRMED),
        ),
        "leaf_fresh_missing": (
            [
                resolver_task("proj_alpha", alpha_missing),
                resolver_task("proj_beta", beta_leaf),
            ],
            seeded_cache,
            missing_ref_reason("proj_alpha", missing, "proj_beta", FRESH),
        ),
        "leaf_fresh_missing_unconfirmed": (
            [
                resolver_task("proj_alpha", alpha_missing),
                resolver_task("proj_beta", beta_leaf),
            ],
            None,
            fresh_unconfirmed_reason("proj_alpha", missing, "proj_beta"),
        ),
        "ring_withheld": (
            ring,
            None,
            " ".join(
                [
                    product_cold_start_reason(
                        "proj_alpha", measure, "proj_beta", "proj_beta"
                    ),
                    product_cold_start_reason(
                        "proj_beta", alpha_base, "proj_alpha", "proj_alpha"
                    ),
                ]
            ),
        ),
    }
    scenarios = {}
    for name, (tasks, cache, expected) in plan.items():
        result = product_path.resolve_refs(
            work=root / name,
            dbt=dbt,
            profiles_dir=PROFILES,
            profile_name="last_good_climb",
            target="dev",
            environment=environment,
            tasks=tasks,
            cache=cache,
        )
        row = {
            "cache": "seeded" if cache else "none",
            "tasks": [task["key"] for task in tasks],
            "ok": result["ok"],
            "product_sha": result["productSha"],
        }
        if result["ok"]:
            row["bindings"] = {
                entry["key"]: entry["bindings"] for entry in result["results"]
            }
            row["injected_from"] = {
                entry["key"]: entry["injectedFrom"] for entry in result["results"]
            }
            row["owned_injected"] = result["ownedInjected"]
        else:
            dbt_text = "\n".join(
                line for lines in result["dbtLogs"].values() for line in lines
            )
            row["error_class"] = result["errorClass"]
            row["message"] = result["message"]
            row["expected"] = expected
            row["matches_expected"] = result["message"] == expected
            if name == "ring_confirmed_missing":
                row["catalog_supplied_to_consumer"] = CONFIRMED
            row["dbt_missing_refs"] = parse_missing_refs(dbt_text)
            row["product_missing_refs"] = product_path.parse_missing(
                dbt_text, root / name
            )
            row["dbt_error_lines"] = [
                line.replace(str(work), ".work/last-good-climb")
                for line in dbt_text.splitlines()
                if UNRESOLVED_TEXT in line
            ]
        scenarios[name] = row
    product_test = product_path.run_wording_test(root / "product-test", dbt)
    withheld_line = next(
        line
        for line in scenarios["ring_withheld"]["dbt_error_lines"]
        if "alpha_report" in line
    ).strip()
    hint_inputs = {
        "plain": withheld_line,
        "full_stop": f"{withheld_line}.",
        "question": f"{withheld_line}?",
        "exclamation": f"{withheld_line}!",
        "trailing_formatting": f"\x1b[31m{withheld_line}\x1b[0m \n",
        "unqualified": withheld_line.replace(" in package or project 'proj_beta'", ""),
    }
    cli = product_path.cli_hint(
        work=root / "cli",
        dbt=dbt,
        project_dir=DISK / "proj_alpha",
        profiles_dir=PROFILES,
        profile_name="last_good_climb",
        target="dev",
        dbt_texts=hint_inputs,
    )
    cli_message = cli["dbtList"]["error"]["message"] if cli["dbtList"]["error"] else ""
    cli_plain = re.sub(r"\x1b\[[0-9;]*m", "", cli_message)
    expected_hints = {
        name: text if name == "unqualified" else cli_hinted(text)
        for name, text in hint_inputs.items()
    }
    cli_case = {
        "handler": "packages/cli/src/handlers/dbt/compile.ts:210 (dbtList), hint from :96 and :210",
        "hint_source": "packages/common/src/dbt/crossSourceRefs.ts:21 and :24-40",
        "project": "proj_alpha with no injected nodes",
        "models": cli["dbtList"]["models"],
        "error_class": cli["dbtList"]["error"]["errorClass"]
        if cli["dbtList"]["error"]
        else None,
        "message": cli_plain.replace(str(SIM), "examples/multi-repo-dbt-sim"),
        "dbt_text": withheld_line,
        "hint": cli["hint"],
        "hinted_texts": cli["hintedDbtTexts"],
        "expected_hinted_texts": expected_hints,
        "hint_follows_a_full_stop": f"{withheld_line}. {CROSS_SOURCE_MODEL_HINT}"
        in cli_plain,
    }
    healthy = scenarios["ring_healthy"]
    failing = [name for name in plan if name != "ring_healthy"]
    checks = {
        "product_wording_test_passes": product_test["passed"],
        "cli_appends_the_hint_after_a_full_stop": cli["hintedDbtTexts"]
        == expected_hints
        and cli["hint"] == CROSS_SOURCE_MODEL_HINT,
        "cli_dbt_ls_fails_with_the_hinted_error": cli["dbtList"]["models"] is None
        and cli_case["error_class"] == "ParseError"
        and cli_plain.startswith("Error executing 'dbt ls':\n  ")
        and cli_hinted(withheld_line) in cli_plain
        and cli_plain.endswith(
            "\nEnsure you're on the latest patch version. '--use-dbt-list' is true by "
            "default; if you encounter issues, try using '--use-dbt-list=false"
        ),
        "product_resolver_binds_the_ring": healthy["ok"]
        and healthy["bindings"] == BINDINGS
        and healthy["owned_injected"] == 5,
        "every_missing_ref_fails_closed": all(
            not scenarios[name]["ok"]
            and scenarios[name]["error_class"] == "ParameterError"
            for name in failing
        ),
        "confirmed_wording_is_exact": scenarios["ring_confirmed_missing"].get(
            "matches_expected", False
        ),
        "fresh_wording_is_exact": scenarios["leaf_fresh_missing"].get(
            "matches_expected", False
        ),
        "unconfirmed_fresh_wording_is_exact": scenarios[
            "leaf_fresh_missing_unconfirmed"
        ].get("matches_expected", False),
        "withheld_wording_is_exact": scenarios["ring_withheld"].get(
            "matches_expected", False
        ),
        "harness_regex_matches_product_parser": all(
            scenarios[name]["dbt_missing_refs"]
            and scenarios[name]["dbt_missing_refs"]
            == scenarios[name]["product_missing_refs"]
            for name in failing
            if not scenarios[name]["ok"]
        ),
    }
    return {
        "resolver": "resolveCrossSourceManifests over DbtCliClient (dbt1.12 -> harness dbt)",
        "wording_source": "packages/backend/src/projectAdapters/crossSourceRefs.ts:398,540,561,564,568",
        "parser_source": "packages/common/src/dbt/crossSourceRefs.ts:1 (re-exported by packages/backend/src/dbt/dbtExternalNodes.ts)",
        "product_test": product_test,
        "cli": cli_case,
        "scenarios": scenarios,
        "checks": checks,
        "success": all(checks.values()),
    }


def expected_confirmations(confirm=None, publication=None):
    expected = [len(PROJECTS), len(PACKAGE_OWNERS)]
    for case in (confirm, publication):
        for scenario in (case or {"scenarios": {}})["scenarios"].values():
            if scenario["rows_written"] is not None:
                expected.append(scenario["rows_written"])
    return expected


def expected_resolutions(present, package, fresh=None, confirm=None, publication=None):
    expected = [
        (present["owned_injected"], present["package_nodes_omitted"]),
        (package["owned_injected"], package["package_nodes_omitted"]),
    ]
    for run in (fresh or {"runs": {}})["runs"].values():
        expected.append((run["owned_injected"], run["package_nodes_omitted"]))
    for case in (confirm, publication):
        for scenario in (case or {"scenarios": {}})["scenarios"].values():
            expected.append(
                (
                    scenario["resolution"]["owned_injected"],
                    scenario["resolution"]["package_nodes_omitted"],
                )
            )
    return expected


def assert_markers(
    events, present, package, withheld, fresh=None, confirm=None, publication=None
):
    errors = []
    confirmed = events.named(CONFIRMED_EVENT)
    if [entry["meta"]["rowsWritten"] for entry in confirmed] != expected_confirmations(
        confirm, publication
    ):
        errors.append(
            "last-good confirmations were not logged once per confirmed store"
        )
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
    expected = expected_resolutions(present, package, fresh, confirm, publication)
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


WITHHELD_MISSING_REFS = {
    "proj_alpha": [
        {"model": VERSIONED_MODEL, "packageName": "proj_beta", "version": None}
    ],
    "proj_beta": [
        {"model": "alpha_base", "packageName": "proj_alpha", "version": None}
    ],
}
FAILED_PROVIDER_MISSING_REFS = [
    {"model": BROKEN_REF, "packageName": None, "version": None}
]


def assert_contract(
    present,
    withheld,
    fidelity,
    pins,
    package,
    events,
    fresh=None,
    confirm=None,
    publication=None,
    wording=None,
):
    errors = []
    if {
        project: row["missing_refs"] for project, row in withheld["projects"].items()
    } != WITHHELD_MISSING_REFS:
        errors.append(
            "withheld dbt output did not match the product missing-ref parser"
        )
    if (
        fresh is not None
        and fresh["runs"]["failed_provider"]["projects"]["proj_beta"]["missing_refs"]
        != FAILED_PROVIDER_MISSING_REFS
    ):
        errors.append(
            "failed provider output did not match the product missing-ref parser"
        )
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
    for label, case in (
        ("fresh-over-seed", fresh),
        ("per-provider confirm", confirm),
        ("publication", publication),
        ("missing-ref wording", wording),
    ):
        if case is None:
            continue
        for check, passed in case["checks"].items():
            if not passed:
                errors.append(f"{label} check failed: {check}")
    errors.extend(
        assert_markers(events, present, package, withheld, fresh, confirm, publication)
    )
    return errors


def relative_output(value):
    return json.loads(
        json.dumps(value)
        .replace(str(SIM), "examples/multi-repo-dbt-sim")
        .replace(str(product_path.product_root()), "<product-root>")
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
    fresh = fresh_over_seed_case(args.dbt, args.work, store, events)
    confirm = per_provider_confirm_case(args.dbt, args.work, store, events)
    publication = publication_case(args.dbt, args.work, store, events)
    wording = missing_ref_wording_case(args.dbt, args.work, store)
    errors = assert_contract(
        present,
        withheld,
        fidelity,
        pins,
        package,
        events,
        fresh,
        confirm,
        publication,
        wording,
    )
    product = {
        "root": str(product_path.product_root()),
        "sha": product_path.product_sha(),
        "steps": [
            "compile-explores: DbtBaseProjectAdapter._validateDbtModel, attachTypesToModels, convertExplores",
            "resolve-refs: resolveCrossSourceManifests over DbtCliClient",
            "parse-missing: parseMissingDbtNodeReferences",
        ],
    }
    if product["sha"] is None:
        errors.append("product checkout revision could not be read")
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
            "fresh_over_seed": fresh,
            "per_provider_confirm": confirm,
            "publication": publication,
            "missing_ref_wording": wording,
            "product_path": product,
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
    print(
        "present PASS withheld PASS package-share PASS fresh-over-seed PASS "
        "per-provider-confirm PASS publication PASS missing-ref-wording PASS",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired:
        print("dbt command timed out", file=sys.stderr)
        raise SystemExit(1) from None
