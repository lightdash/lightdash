import copy
import gzip
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from generate import model_sql, yaml_json
from prod_shaped_fixture import generate as generate_control
from tooling import bootstrap, check_load, command, initialise_repos

VARIANT = "prod-ambiguous-version"
CONSUMER = "model.proj_bank.stg_bank_accounts"
OLD_TARGET = "model.proj_payments.transactions.v3"
FRESH_TARGET = "model.proj_payments.transactions.v2"


def generate(root: Path, seed=42):
    root = root.resolve()
    if (
        not (root / "repos/proj_payments/models/transactions_v2.sql")
        .resolve()
        .is_relative_to(root)
    ):
        raise ValueError("Generated version path escapes the output directory")
    registry = generate_control(root, "prod-cycle", seed)
    schema_path = root / "repos/proj_payments/models/schema.yml"
    schema = json.loads(schema_path.read_text())
    transaction = next(
        model for model in schema["models"] if model["name"] == "transactions"
    )
    transaction.update(latest_version=2, versions=[{"v": 2}, {"v": 3}])
    schema_path.write_text(yaml_json(schema))
    leaf = "repos/proj_payments/models/transactions_v2.sql"
    (root / leaf).write_text(model_sql("proj_payments", 0, ""))
    bank_sql = root / "repos/proj_bank/models/stg_bank_accounts.sql"
    bank_sql.write_text(
        model_sql("proj_bank", 0, "", "ref('proj_payments', 'transactions')")
    )
    loom_path = root / "repos/proj_bank/dbt_loom.config.yml"
    loom = json.loads(loom_path.read_text())
    stale_path = root / "published/stale/proj_payments/manifest.json"
    for item in loom["manifests"]:
        if item["name"] == "proj_payments":
            item["config"]["path"] = str(stale_path)
    loom_path.write_text(yaml_json(loom))
    registry.update(scale=VARIANT, variant=VARIANT)
    registry["generatedFiles"] = sorted([*registry["generatedFiles"], leaf])
    registry["stats"]["totalModelNodes"] = 42
    registry["stats"]["modelNodeCounts"] = dict(registry["stats"]["modelCounts"])
    registry["stats"]["modelNodeCounts"]["proj_payments"] += 1
    scenario = registry["scenario"]
    scenario.update(
        name="ambiguous version publication probe", variant=VARIANT, cycle=None
    )
    scenario["controlCycle"] = copy.deepcopy(scenario["proposedCycle"])
    for ref in scenario["refs"]:
        if ref["model"] == "proj_bank.stg_bank_accounts":
            ref["version"] = None
    scenario["loomImports"]["proj_bank"] = loom["manifests"]
    scenario["ambiguousEdges"] = [
        {
            "consumerUniqueId": CONSUMER,
            "ref": ["proj_payments", "transactions"],
            "refArgumentCount": 2,
            "version": None,
            "oldLatestVersion": 3,
            "freshLatestVersion": 2,
            "initialPublishedTarget": OLD_TARGET,
            "intendedTarget": FRESH_TARGET,
            "stalePublicationPath": str(stale_path),
            "freshPublicationPath": str(root / "published/proj_payments/manifest.json"),
        }
    ]
    scenario["freshGraph"] = {
        "edges": [
            {
                "fromUniqueId": edge["fromUniqueId"],
                "toUniqueId": FRESH_TARGET
                if edge["fromUniqueId"] == CONSUMER
                else edge["toUniqueId"],
            }
            for edge in scenario["controlCycle"]["edges"]
        ],
        "leaf": FRESH_TARGET,
        "expectedAcyclic": True,
    }
    scenario["expectedResults"] = {
        build: {
            "refresh_success": True,
            "cycle_error": False,
            "stale_retry_error": False,
            "final_binding": FRESH_TARGET,
        }
        for build in ("pre", "fixed", "main", "cycle-pr", "integrated")
    }
    scenario["hypothesis"] = (
        "A stale latest-3 publication may cause a false cycle; this is unverified and success is expected on every build"
    )
    (root / "registry.json").write_text(yaml_json(registry))
    return registry


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_nodes(manifest, project):
    return {
        key: node
        for key, node in manifest["nodes"].items()
        if node.get("resource_type") == "model"
        and node.get("package_name") == project
        and not node.get("config", {}).get("meta", {}).get("is_external")
    }


def binding(manifest):
    node = manifest["nodes"].get(CONSUMER)
    if node is None:
        return {"available": False, "reason": "consumer_node_absent"}
    return {
        "available": True,
        "consumer": CONSUMER,
        "refs": node.get("refs", []),
        "dependencies": node.get("depends_on", {}).get("nodes", []),
    }


def graph_evidence(nodes):
    graph = {
        key: [
            dependency
            for dependency in node.get("depends_on", {}).get("nodes", [])
            if dependency in nodes
        ]
        for key, node in nodes.items()
    }
    done = set()
    stack = []

    def visit(key):
        if key in stack:
            return stack[stack.index(key) :] + [key]
        if key in done:
            return None
        stack.append(key)
        for dependency in graph[key]:
            cycle = visit(dependency)
            if cycle:
                return cycle
        stack.pop()
        done.add(key)
        return None

    cycle = next((found for key in graph if (found := visit(key))), None)
    return {
        "modelCount": len(nodes),
        "acyclic": cycle is None,
        "cycle": cycle,
        "edges": graph,
    }


def parse(root, source, stage, dbt, env):
    check_load()
    destination = root / "parse-evidence" / stage
    destination.mkdir(parents=True, exist_ok=True)
    command(
        [
            dbt,
            "--no-use-colors",
            "--no-partial-parse",
            "parse",
            "--project-dir",
            root / "repos" / source,
            "--profile",
            "multi_repo_sim",
            "--target",
            "dev",
            "--profiles-dir",
            root / "profiles",
            "--target-path",
            destination,
        ],
        root / "repos" / source,
        {
            **env,
            "DBT_SEND_ANONYMOUS_USAGE_STATS": "false",
            "DBT_PARTIAL_PARSE": "false",
        },
    )
    manifest_path = destination / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    print(f"DBT {source} {stage} exit=0", flush=True)
    return manifest, {
        "stage": stage,
        "project": source,
        "command": "dbt --no-partial-parse parse",
        "generated_at": manifest["metadata"].get("generated_at"),
        "dbt_version": manifest["metadata"].get("dbt_version"),
        "manifest_path": str(manifest_path.relative_to(root)),
        "sha256": digest(manifest_path),
    }


def publication_evidence(manifest, record, latest):
    nodes = local_nodes(manifest, "proj_payments")
    for key, version in ((FRESH_TARGET, 2), (OLD_TARGET, 3)):
        if (
            nodes[key].get("version") != version
            or nodes[key].get("latest_version") != latest
        ):
            raise RuntimeError(
                "Parsed publication version metadata differs from its source schema"
            )
    return {
        **record,
        "latest_version": latest,
        "versioned_nodes": [FRESH_TARGET, OLD_TARGET],
    }


def prepare(root, env, dbt):
    from large_org import bootstrap_signature

    registry = generate(root)
    signature = hashlib.sha256(
        (
            bootstrap_signature(root, registry, env, dbt) + digest(Path(__file__))
        ).encode()
    ).hexdigest()
    cache = root.parents[1] / "bootstrap" / signature
    marker = cache / "provenance.json"
    if marker.exists():
        evidence = json.loads(marker.read_text())
        for relative, expected in evidence["artifact_hashes"].items():
            if digest(cache / relative) != expected:
                raise RuntimeError("Cached parse evidence changed")
        for directory in ("published", "parse-evidence"):
            shutil.copytree(cache / directory, root / directory, dirs_exist_ok=True)
        evidence["cached"] = True
    else:
        result = bootstrap(root, dbt=dbt, env=env)
        if result["errors"]:
            raise RuntimeError("Ambiguous fixture bootstrap failed")
        schema_path = root / "repos/proj_payments/models/schema.yml"
        fresh_schema = schema_path.read_text()
        old_schema = json.loads(fresh_schema)
        next(
            model for model in old_schema["models"] if model["name"] == "transactions"
        )["latest_version"] = 3
        try:
            schema_path.write_text(yaml_json(old_schema))
            old, old_record = parse(root, "proj_payments", "old-provider", dbt, env)
        finally:
            schema_path.write_text(fresh_schema)
        stale_path = root / "published/stale/proj_payments/manifest.json"
        stale_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / old_record["manifest_path"], stale_path)
        fresh, fresh_record = parse(root, "proj_payments", "fresh-provider", dbt, env)
        shutil.copyfile(
            root / fresh_record["manifest_path"],
            root / "published/proj_payments/manifest.json",
        )
        initial, initial_record = parse(
            root, "proj_bank", "consumer-stale-publication", dbt, env
        )
        loom_path = root / "repos/proj_bank/dbt_loom.config.yml"
        stale_loom = loom_path.read_text()
        fresh_loom = json.loads(stale_loom)
        next(
            item for item in fresh_loom["manifests"] if item["name"] == "proj_payments"
        )["config"]["path"] = str(root / "published/proj_payments/manifest.json")
        try:
            loom_path.write_text(yaml_json(fresh_loom))
            control, control_record = parse(
                root, "proj_bank", "consumer-fresh-publication", dbt, env
            )
        finally:
            loom_path.write_text(stale_loom)
        nodes = local_nodes(fresh, "proj_payments")
        records = [old_record, fresh_record, initial_record, control_record]
        for source in registry["sources"]:
            name = source["name"]
            if name in ("proj_bank", "proj_payments"):
                continue
            manifest, record = parse(root, name, "fresh-graph-" + name, dbt, env)
            nodes.update(local_nodes(manifest, name))
            records.append(record)
        initial_graph = graph_evidence({**nodes, **local_nodes(initial, "proj_bank")})
        fresh_graph = graph_evidence({**nodes, **local_nodes(control, "proj_bank")})
        evidence = {
            "cached": False,
            "bootstrap": result,
            "old_publication": publication_evidence(old, old_record, 3),
            "fresh_publication": publication_evidence(fresh, fresh_record, 2),
            "initial_consumer_binding": {
                **binding(initial),
                "evidence": initial_record,
            },
            "fresh_control_binding": {**binding(control), "evidence": control_record},
            "initial_combined_graph": initial_graph,
            "fresh_combined_graph": fresh_graph,
            "parse_records": records,
            "fresh_schema_sha256": digest(schema_path),
            "old_schema_sha256": hashlib.sha256(
                yaml_json(old_schema).encode()
            ).hexdigest(),
            "method": "actual dbt parse and dbt-loom; unmodified parsed manifests are published",
        }
        artifacts = [
            path
            for directory in ("published", "parse-evidence")
            for path in (root / directory).rglob("*")
            if path.is_file()
        ]
        evidence["artifact_hashes"] = {
            str(path.relative_to(root)): digest(path) for path in artifacts
        }
        cache.mkdir(parents=True, exist_ok=True)
        for directory in ("published", "parse-evidence"):
            shutil.copytree(root / directory, cache / directory, dirs_exist_ok=True)
        marker.write_text(yaml_json(evidence))
    evidence["bootstrap_signature"] = signature
    (root / "provenance.json").write_text(yaml_json(evidence))
    initialise_repos(root)
    return registry, evidence


def server_binding(runner, project, operation):
    import psycopg2

    env = runner.env
    with (
        psycopg2.connect(
            host=env["PGHOST"],
            port=env["PGPORT"],
            dbname=env.get("PGDATABASE_APP", env["PGDATABASE"]),
            user=env["PGUSER"],
            password=env["PGPASSWORD"],
            connect_timeout=10,
            options="-c statement_timeout=10000",
        ) as db,
        db.cursor() as cursor,
    ):
        cursor.execute(
            "select manifest, created_at AT TIME ZONE current_setting('TimeZone') from project_merged_manifests where project_uuid = %s",
            (project,),
        )
        row = cursor.fetchone()
    if row is None:
        return {
            "available": False,
            "reason": "no_persisted_merged_manifest",
            "evidence_source": "project_merged_manifests",
        }
    artifact, created = row
    started = datetime.fromisoformat(operation["status"]["createdAt"])
    if created < started:
        return {
            "available": False,
            "reason": "persisted_manifest_predates_refresh",
            "created_at": created.isoformat(),
            "evidence_source": "project_merged_manifests",
        }
    payload = bytes(artifact)
    manifest = json.loads(
        gzip.decompress(payload) if payload.startswith(b"\x1f\x8b") else payload
    )
    destination = (
        runner.root
        / "server-evidence"
        / (runner.args.scenarios[0] + "-" + str(created.timestamp()) + ".json")
    )
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(manifest))
    return {
        **binding(manifest),
        "created_at": created.isoformat(),
        "evidence_source": "persisted merged manifest from this refresh",
        "sha256": digest(destination),
        "path": str(destination),
        "graph": graph_evidence(
            local_nodes(manifest, "proj_bank")
            | {
                key: node
                for key, node in manifest["nodes"].items()
                if node.get("resource_type") == "model"
            }
        ),
    }


def evaluate(row):
    publication = row["publication"]
    expected = row["configured"]["expectedResults"][row["build"]]
    final = row["server_binding"]
    observed = {
        "refresh_success": row["operation"]["success"],
        "cycle_error": row["cycle_error"],
        "stale_retry_error": row["stale_retry_error"],
        "final_binding": next(
            (
                node
                for node in final.get("dependencies", [])
                if node.startswith("model.proj_payments.transactions")
            ),
            None,
        ),
    }
    checks = {
        key: {
            "expected": value,
            "observed": observed[key],
            "pass": value == observed[key],
        }
        for key, value in expected.items()
    }
    values = {
        "service_account_actor": (True, row["operation"]["actor_is_service_account"]),
        "actual_flag_on": (
            True,
            row["runtime_flags"]["cross-source-dbt-refs"]["enabled"],
        ),
        "inspector": ("inspector", row["counter_evidence"]["method"]),
        "counter_agreement": (
            True,
            row["counter_evidence"].get("agrees_with_product_log"),
        ),
        "source_count": (19, row["source_count"]),
        "old_latest": (3, publication["old_publication"]["latest_version"]),
        "fresh_latest": (2, publication["fresh_publication"]["latest_version"]),
        "initial_binding": (
            [OLD_TARGET],
            publication["initial_consumer_binding"]["dependencies"],
        ),
        "fresh_control_binding": (
            [FRESH_TARGET],
            publication["fresh_control_binding"]["dependencies"],
        ),
        "fresh_graph_acyclic": (True, publication["fresh_combined_graph"]["acyclic"]),
        "fresh_graph_model_count": (
            42,
            publication["fresh_combined_graph"]["modelCount"],
        ),
    }
    for key, (wanted, actual) in values.items():
        checks[key] = {"expected": wanted, "observed": actual, "pass": wanted == actual}
    return {
        "expectation_basis": "Fresh latest_version=2 selects an acyclic leaf; success is expected on all four builds; the regression hypothesis is unverified",
        "expected": expected,
        "observed": observed,
        "checks": checks,
        "pass": all(check["pass"] for check in checks.values()),
        "warning_present": any(
            event.get("event") == "dbt.compile.crossSourceRefWarning"
            for event in row["events"]
        ),
        "error_present": any(
            event.get("event") == "dbt.compile.failed" for event in row["events"]
        ),
        "sequence": [
            {
                "index": index,
                "timestamp": event.get("timestamp"),
                "event": event["event"],
                "message": event.get("message"),
            }
            for index, event in enumerate(row["events"])
            if event.get("event")
            in (
                "dbt.compile.crossSourceRefWarning",
                "dbt.compile.failed",
                "dbt.compile.end.ok",
                "dbt.compile.end.failed",
            )
        ],
    }
