import argparse
import hashlib
import json
import re
import shutil
import traceback
from pathlib import Path
from types import SimpleNamespace

from ambiguous_version_fixture import VARIANT as AMBIGUOUS_VARIANT
from prod_shaped_fixture import VARIANTS as PROD_VARIANTS
from run import Api, Runner, operation_messages, sanitise, trust_local_git
from tooling import bootstrap, check_load, initialise_repos, load_env, serve_git

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]
BUILDS = {
    "pre": "c4d58411c3c551f1aa97ab1118d698f0ddd3b03f",
    "fixed": "b4fbe779561f8077259dc6beb504f45b6dfe3238",
    "main": "66a39c038857c709a1d628dbd0c530c5f558ab35",
    "cycle-pr": "6e35424935013c5c2fc5ceb7174b4abca62a0014",
}


def filtered_publications(root, registry):
    records = []
    for item in registry["scenario"].get("publicationFilters", []):
        source = Path(item["sourcePath"])
        filtered = Path(item["outputPath"])
        if (
            any(
                not path.resolve().is_relative_to(root.resolve() / "published")
                for path in (source, filtered)
            )
            or source.resolve() == filtered.resolve()
        ):
            raise ValueError("Publication filter paths must stay inside published")
        manifest = json.loads(source.read_text())
        excluded = set(item["excludedUniqueIds"])
        if not excluded.issubset(manifest["nodes"]):
            raise ValueError("Publication filter excludes an absent manifest node")
        manifest["nodes"] = {
            key: node for key, node in manifest["nodes"].items() if key not in excluded
        }
        for key, option in (
            ("parent_map", "removeParentMapEntries"),
            ("child_map", "removeChildMapEntries"),
        ):
            if item.get(option):
                manifest[key] = {
                    node: [
                        dependency
                        for dependency in dependencies
                        if dependency not in excluded
                    ]
                    for node, dependencies in manifest.get(key, {}).items()
                    if node not in excluded
                }
        filtered.parent.mkdir(parents=True, exist_ok=True)
        filtered.write_text(json.dumps(manifest) + "\n")
        records.append(
            {
                "consumer": item["consumer"],
                "provider": item["provider"],
                "excluded_nodes": sorted(excluded),
            }
        )
    return records


def bootstrap_signature(root, registry, env, dbt):
    executable = Path(dbt).resolve(strict=True)
    environment = {
        key: value for key, value in env.items() if key.startswith(("DBT_", "PG"))
    }
    files = {
        relative: hashlib.sha256((root / relative).read_bytes()).hexdigest()
        for relative in registry["generatedFiles"]
    }
    packages = {
        str(path): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(
            executable.parent.parent.glob(
                "lib/python*/site-packages/*.dist-info/METADATA"
            )
        )
    }
    payload = {
        "files": files,
        "environment": environment,
        "dbt": str(executable),
        "executable": hashlib.sha256(executable.read_bytes()).hexdigest(),
        "packages": packages,
        "bootstrap": hashlib.sha256((ROOT / "tooling.py").read_bytes()).hexdigest(),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def prepare_fixture(root, variant, env, dbt):
    if variant == AMBIGUOUS_VARIANT:
        from ambiguous_version_fixture import prepare

        return prepare(root, env, dbt)
    if variant in PROD_VARIANTS:
        from prod_shaped_fixture import generate
    else:
        from large_org_fixture import generate

    registry = generate(root, variant=variant, seed=42)
    signature = bootstrap_signature(root, registry, env, dbt)
    cache = ROOT / ".work/large-org/bootstrap-profiles" / registry["scale"] / signature
    marker = cache / "signature.json"
    if marker.exists() and json.loads(marker.read_text()) == signature:
        shutil.copytree(cache / "published", root / "published", dirs_exist_ok=True)
        publication = {"success": True, "cached_bootstrap_snapshots": True}
    else:
        check_load()
        publication = bootstrap(root, dbt=dbt, env=env)
        if publication.get("errors") or publication.get("exit_code", 0):
            (root / "bootstrap.json").write_text(
                json.dumps(sanitise(publication, env), indent=2) + "\n"
            )
            raise RuntimeError(
                "Fixture bootstrap failed; inspect ignored bootstrap.json"
            )
        cache.mkdir(parents=True, exist_ok=True)
        shutil.copytree(root / "published", cache / "published", dirs_exist_ok=True)
        marker.write_text(json.dumps(signature) + "\n")
    publication["bootstrap_signature"] = signature
    if variant in PROD_VARIANTS:
        from prod_shaped_fixture import validate_publications

        publication["parsed_manifest_validation"] = validate_publications(
            root, registry
        )
    publication["filtered_import"] = filtered_publications(root, registry)
    initialise_repos(root)
    return registry, publication


class LargeOrgRunner(Runner):
    def __init__(self, args, env, root, server):
        self.args, self.env, self.root, self.server = args, env, root, server
        self.registry = json.loads((root / "registry.json").read_text())
        self.sources = self.registry["sources"]
        self.state_path = root / "state.json"
        self.state = (
            json.loads(self.state_path.read_text())
            if self.state_path.exists()
            else {"url": args.url, "projects": {}}
        )
        if self.state["url"] != args.url:
            raise ValueError("Fixture state belongs to a different local instance")
        self.results = []
        self.log_paths = list(
            (Path.home() / ".pm2/logs").glob(
                f"{env['LD_INSTANCE_ID'].replace('_', '-')}-api-*.log"
            )
        )
        self.api = Api(args.url, {**env, "LIGHTDASH_API_KEY": ""})

    def source_config(self, name, selector=None):
        source = next(source for source in self.sources if source["name"] == name)
        config = super().source_config(name, selector or source.get("selector"))
        config["repository"] = "sim/" + source.get("repoName", name)
        return config

    def refresh_as_service_account(self, project):
        admin = self.api
        account = admin.call(
            "POST",
            "/api/v1/service-accounts",
            {
                "description": "Synthetic large-org refresh",
                "expiresAt": None,
                "scopes": ["org:admin"],
            },
        )
        try:
            token = account.get("token")
            if not token:
                rotated = admin.call(
                    "PATCH",
                    f"/api/v1/service-accounts/{account['uuid']}/rotate",
                    {"expiresAt": "2099-01-01T00:00:00.000Z"},
                )
                token = rotated["token"]
            service = Api(
                self.args.url,
                {**self.env, "LIGHTDASH_API_KEY": token},
                auth_scheme="Bearer",
            )
            self.api = service
            result = self.refresh(project)
            result["actor_is_service_account"] = (
                result["status"].get("userUuid") == account["userUuid"]
            )
            if not result["actor_is_service_account"]:
                raise RuntimeError(
                    "Refresh job actor is not the created service account"
                )
            result["trigger"] = (
                "service-account POST /api/v1/projects/<project>/refresh"
            )
            return result
        finally:
            self.api = admin
            admin.call("DELETE", f"/api/v1/service-accounts/{account['uuid']}")


def compile_events(runner, offsets, project):
    events = []
    for path, offset in offsets.items():
        with path.open() as stream:
            stream.seek(offset)
            for line_index, line in enumerate(stream):
                try:
                    value = json.loads(line[line.index("{") :])
                except ValueError:
                    continue
                warning = value.get("event") == "dbt.compile.crossSourceRefWarning"
                if value.get("projectUuid") != project and not warning:
                    continue
                if str(value.get("event", "")).startswith("dbt.compile"):
                    value["captureLogFile"] = path.name
                    value["captureLogLine"] = line_index
                    events.append(value)
    return sorted(events, key=lambda event: event.get("timestamp", ""))


def classify(operation, events):
    messages = operation_messages(operation)
    messages.extend(
        (operation.get("status", {}).get("jobResults") or {}).get("connectionWarnings")
        or []
    )
    messages.extend(
        str(event["message"])
        for event in events
        if event.get("level") in ("warn", "error")
        and event.get("message") not in messages
    )
    messages = list(dict.fromkeys(messages))
    text = "\n".join(messages)
    start = next(
        (
            event
            for event in events
            if event.get("event") == "dbt.compile.sourceFetchStart"
        ),
        {},
    )
    end = [
        event
        for event in events
        if "diskEvictions" in event
        and event.get("event") != "dbt.compile.sourceFetchStart"
    ]
    counters = end[-1] if end else {}
    return {
        "messages": messages,
        "cycle_error": "dbt models form a cycle across dbt sources:" in text,
        "stale_retry_error": "compiled against an out-of-date version of model" in text
        and "ran out of retries" in text,
        "cross_source_warning": "resolved to external model" in text,
        "disk_evictions": counters.get("diskEvictions"),
        "disk_refetches": counters.get("diskRecreations"),
        "fetch_concurrency": start.get("concurrency"),
        "disk_derived_limit": start.get("diskDerivedLimit"),
        "disk_budget_bytes": start.get("diskAvailableBytes"),
        "disk_budget_source": start.get("diskBudgetSource"),
    }


def run_case(build_name, flag, variant, runtime, env, args, observer=None):
    fixture_directory = (
        args.out / "fixtures"
        if variant in (*PROD_VARIANTS, AMBIGUOUS_VARIANT)
        else ROOT / ".work/large-org/fixtures"
    )
    root = fixture_directory / variant
    registry, publication = prepare_fixture(root, variant, env, args.dbt)
    check_load()
    with serve_git(root) as server, trust_local_git(server):
        runner_args = SimpleNamespace(
            url=runtime["target"],
            target="current",
            timeout=args.timeout,
            scenarios=[variant],
            server_project=None,
            cli_project=None,
            scale=registry["scale"],
        )
        runner = LargeOrgRunner(runner_args, env, root, server)
        project = runner.project(build_name + "-" + flag + "-" + variant, "server")
        before = runner.snapshot(project)
        configured = registry["scenario"]
        server.unreadable.update(configured.get("unreadableSources", []))
        removed_cache_files = 0
        temporary = Path(env.get("TMPDIR", "/tmp")).resolve()
        if temporary.is_relative_to(ROOT / ".work/large-org/tmp"):
            cache = temporary / "lightdash-dbt-partial-parse"
            for cached in cache.glob("*"):
                if cached.is_file() and not cached.is_symlink():
                    cached.unlink()
                    removed_cache_files += 1
        offsets = {path: path.stat().st_size for path in runner.log_paths}
        observation_offset = len(observer.read()) if observer else 0
        try:
            operation = runner.refresh_as_service_account(project)
        finally:
            server.unreadable.clear()
        events = compile_events(runner, offsets, project)
        after = runner.snapshot(project)
        observation = classify(operation, events)
        inspected = (
            [
                event
                for event in observer.read()[observation_offset:]
                if event["projectUuid"] == project
            ]
            if observer
            else []
        )
        counter_evidence = {"method": "product_logs"}
        if inspected:
            final = inspected[-1]
            counter_evidence = {
                "method": "inspector",
                "point": final["point"],
                "agrees_with_product_log": None
                if observation["disk_evictions"] is None
                else (observation["disk_evictions"], observation["disk_refetches"])
                == (final["diskEvictions"], final["diskRecreations"]),
            }
            observation["disk_evictions"] = final["diskEvictions"]
            observation["disk_refetches"] = final["diskRecreations"]
        elif observation["disk_evictions"] is None:
            counter_evidence = {
                "method": "unavailable",
                "reason": (observer.reason or "no_measured_observations")
                if observer
                else "not_attached",
            }
        text = "\n".join(observation["messages"])
        migration_path = ROOT / ".work/large-org/migration-provenance.json"
        migration_provenance = (
            json.loads(migration_path.read_text()) if migration_path.exists() else None
        )
        fired = {
            "1": len(runner.sources) == 19,
            "2": observation["cycle_error"],
            "3": "proj_unconnected" in text,
            "4": "shared_dims" in text,
            "5": observation["stale_retry_error"],
            "6": bool(
                re.search(
                    r"duplicate|same dbt project|both use the dbt project name",
                    text,
                    re.IGNORECASE,
                )
            ),
            "7": bool(
                re.search(
                    r"NoNodesForSelectionCriteria|does not match any|no models|no nodes",
                    text,
                    re.IGNORECASE,
                )
            ),
            "8": any(request.get("denied") for request in server.requests),
            "9": observation["disk_budget_bytes"] == 3221225472
            and observation["fetch_concurrency"] == 4,
        }
        row = sanitise(
            {
                "build": build_name,
                "sha": runtime["build"]["revision"],
                "flag": flag,
                "runtime_flags": runtime["status"]["flags"],
                "dbt_toolchain": runtime["status"]["dbt_toolchain"],
                "migration_provenance": migration_provenance,
                "variant": variant,
                "source_count": len(runner.sources),
                "configured": configured,
                "publication": publication,
                "cold_cache_files_removed": removed_cache_files,
                "counter_evidence": counter_evidence,
                "operation": operation,
                "before": before,
                "after": after,
                "events": events,
                "git_requests": server.requests,
                "items_fired": fired,
                **observation,
            },
            env,
        )
        if variant in PROD_VARIANTS:
            from prod_shaped_assertions import evaluate

            starts = [
                event
                for event in events
                if event.get("event") == "dbt.compile.sourceFetchStart"
            ]
            ends = [
                event
                for event in events
                if event.get("event")
                in ("dbt.compile.end.ok", "dbt.compile.end.failed")
            ]
            job = operation["status"].get("jobUuid")
            row["compile_window"] = {
                "correlated": len(starts) == 1
                and len(ends) == 1
                and all(
                    event.get("projectUuid") == project and event.get("jobUuid") == job
                    for event in ends
                ),
                "warning_scope": "serial refresh log window; warning events do not carry a project or job ID",
            }
            row["assertions"] = evaluate(row)
        if variant == AMBIGUOUS_VARIANT:
            from ambiguous_version_fixture import evaluate, server_binding
            from ambiguous_version_observation import diagnostics

            row["dbt_diagnostics"] = sanitise(diagnostics(offsets), env)

            row["server_binding"] = sanitise(
                server_binding(runner, project, operation), env
            )
            row["assertions"] = evaluate(row)
        return row


def summary(result, out):
    rows = [
        "# Large-org multi-source scenario",
        "",
        "| Build | Flag | Variant | Refresh | Explores | Cycle | Stale retries | Evictions / re-fetches |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in result["runs"]:
        rows.append(
            f"| {row['build']} | {row['flag']} | {row['variant']} | {row['operation']['success']} | {row['after']['total_explores']} | {row['cycle_error']} | {row['stale_retry_error']} | {row['disk_evictions']} / {row['disk_refetches']} |"
        )
    for row in result["runs"]:
        rows += ["", f"## {row['build']} / {row['flag']} / {row['variant']}", ""]
        rows += ["```text", *row["messages"], "```"]
    (out / "SUMMARY.md").write_text("\n".join(rows) + "\n")


def main():
    from large_org_build import prepare_build, start_build, stop_owned_instance
    from large_org_fixture import VARIANTS
    from large_org_observer import observe_disk_pool

    parser = argparse.ArgumentParser()
    parser.add_argument("--build", choices=(*BUILDS, "integrated"), required=True)
    parser.add_argument("--flag", choices=("off", "on"), required=True)
    parser.add_argument(
        "--variants",
        choices=(*VARIANTS, *PROD_VARIANTS, AMBIGUOUS_VARIANT),
        nargs="+",
        default=list(VARIANTS),
    )
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument(
        "--dbt",
        default=str(ROOT / ".work/venvs/dbt12/bin/dbt"),
        help="Private dbt executable used by fixture parses and by default the API",
    )
    parser.add_argument(
        "--server-dbt", help="Override the private live API dbt executable"
    )
    parser.add_argument("--toolchain-provenance", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    prod = any(
        variant in (*PROD_VARIANTS, AMBIGUOUS_VARIANT) for variant in args.variants
    )
    ambiguous = AMBIGUOUS_VARIANT in args.variants
    if ambiguous and args.variants != [AMBIGUOUS_VARIANT]:
        parser.error("The ambiguous-version probe requires a separate invocation")
    if prod and (
        args.flag != "on"
        or not all(
            variant in (*PROD_VARIANTS, AMBIGUOUS_VARIANT) for variant in args.variants
        )
    ):
        parser.error("Prod-shaped probes require flag on and a separate invocation")
    if not 0 < args.timeout <= 900:
        parser.error("Refresh timeout must be between 1 and 900 seconds")
    if args.out is None:
        args.out = (
            ROOT
            / ".work/large-org"
            / (AMBIGUOUS_VARIANT if ambiguous else "prod-shaped" if prod else "results")
        )
    if prod and args.out.resolve() == (ROOT / ".work/large-org/results").resolve():
        parser.error("Prod-shaped results must stay separate from the original matrix")
    if (
        ambiguous
        and args.out.resolve() == (ROOT / ".work/large-org/prod-shaped").resolve()
    ):
        parser.error("Run7b results must stay separate from run7")
    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / "results.json"
    result = json.loads(path.read_text()) if path.exists() else {"runs": []}
    integration = None
    if args.build == "integrated":
        from integration_build import prepare

        integration = prepare()
        revision = integration["revision"]
    else:
        revision = BUILDS[args.build]
    toolchain_provenance = None
    if args.toolchain_provenance:
        toolchain_provenance = json.loads(args.toolchain_provenance.read_text())[
            args.build
        ]
        if toolchain_provenance["sha"] != revision:
            parser.error("Toolchain provenance must match the selected build SHA")
    try:
        check_load()
        build = prepare_build(revision)
        check_load()
        runtime = start_build(build, args.flag == "on", args.server_dbt or args.dbt)
        env = dict(runtime["env"])
        env["PGDATABASE_APP"] = env["PGDATABASE"]
        env["PGDATABASE"] = env.get("DBT_DATABASE", env["PGDATABASE"])
        with observe_disk_pool(runtime) as observer:
            for variant in args.variants:
                row = run_case(
                    args.build, args.flag, variant, runtime, env, args, observer
                )
                row["dbt_toolchain"]["source_provenance"] = toolchain_provenance
                row["dbt_toolchain"]["publication_executable"] = str(
                    Path(args.dbt).resolve()
                )
                row["integration"] = integration
                result["runs"] = [
                    old
                    for old in result["runs"]
                    if (old["build"], old["flag"], old["variant"])
                    != (args.build, args.flag, variant)
                ]
                result["runs"].append(row)
                path.write_text(json.dumps(result, indent=2) + "\n")
                if not prod:
                    summary(result, args.out)
                print(
                    json.dumps(
                        {
                            key: row[key]
                            for key in (
                                "build",
                                "flag",
                                "variant",
                                "cycle_error",
                                "stale_retry_error",
                                "disk_evictions",
                                "disk_refetches",
                            )
                        }
                    ),
                    flush=True,
                )
    finally:
        stop_owned_instance()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, KeyError, TypeError) as error:
        diagnostic = ROOT / ".work/large-org/last-error.json"
        diagnostic.parent.mkdir(parents=True, exist_ok=True)
        diagnostic.write_text(
            json.dumps(
                sanitise(
                    {
                        "type": type(error).__name__,
                        "message": str(error),
                        "stdout": getattr(error, "stdout", ""),
                        "stderr": getattr(error, "stderr", ""),
                        "traceback": traceback.format_exc(),
                    },
                    load_env(CHECKOUT),
                ),
                indent=2,
            )
            + "\n"
        )
        diagnostic.chmod(0o600)
        raise SystemExit(
            "Large-org harness failed; inspect ignored last-error.json"
        ) from None
