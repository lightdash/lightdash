"""dbt-loom versus last-good climb parity runner.

A case is a dict of synthetic dbt projects. Each project has models, seeds and
snapshots with access, versions and refs. Providers are parsed first to make
last-good manifests. Each consumer is then parsed twice:

- loom: real dbt-loom 0.9.6 reads the provider manifests through a
  dbt_loom.config.yml with the case's loom knobs.
- fix7b: the external-node plugin copy in last-good-climb reads the
  public-only projection from climb.py of the same manifests.

Both parses use dbt-core 1.12.0 and never touch a warehouse.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

HERE = Path(__file__).resolve().parent
SIM = HERE.parent
WORK = Path(os.environ.get("LOOM_PARITY_WORK", SIM / ".work" / "loom-parity"))
REPORTS = SIM / "reports" / "loom-parity"
VENVS = SIM / ".work" / "venvs"
LOOM_DBT = Path(
    os.environ.get("LOOM_PARITY_LOOM_DBT", VENVS / "dbt1120-loom" / "bin" / "dbt")
)
NOLOOM_DBT = Path(os.environ.get("LOOM_PARITY_DBT", VENVS / "dbt1120" / "bin" / "dbt"))
HARNESS_CLIMB = SIM / "last-good-climb"
PLUGIN_DIR = Path(os.environ.get("LOOM_PARITY_PLUGIN_DIR", HARNESS_CLIMB))
sys.path.insert(0, str(HARNESS_CLIMB))
import climb

UNRESOLVED = "which was not found"
CYCLE = "Found a cycle"
PROTECTED = re.compile(
    r"not allowed because the referenced node is (protected|private)"
)
AMBIGUOUS = re.compile(r"(is ambiguous|multiple|Found more than one)", re.IGNORECASE)


def profiles_yml():
    return textwrap.dedent(
        """
        fuzz:
          target: dev
          outputs:
            dev:
              type: postgres
              host: 127.0.0.1
              port: 1
              user: sim
              password: sim
              dbname: sim
              schema: fuzz
              threads: 1
        """
    )


def dbt_project_yml(name, restrict_access=None, model_access_default=None):
    body = {
        "name": name,
        "version": "1.0.0",
        "profile": "fuzz",
        "model-paths": ["models"],
        "analysis-paths": ["analyses"],
        "seed-paths": ["seeds"],
        "snapshot-paths": ["snapshots"],
    }
    if restrict_access is not None:
        body["restrict-access"] = restrict_access
    if model_access_default is not None:
        body["models"] = {name: {"+access": model_access_default}}
    return json.dumps(body)


def ref_sql(ref):
    """ref = (package|None, name, version|None)"""
    package, name, version = ref
    args = []
    if package:
        args.append(f"'{package}'")
    args.append(f"'{name}'")
    if version is not None:
        args.append(f"v={version}")  # string versions pass pre-quoted
    return "{{ ref(" + ", ".join(args) + ") }}"


def write_project(root, project):
    """project: {name, models:[{name, access?, version?, latest_version?, refs:[...], group?}],
    seeds:[{name, access?}], snapshots:[{name, access?, refs}], restrict_access?, dependencies?}"""
    name = project["name"]
    directory = root / name
    for sub in ("models", "seeds", "snapshots"):
        (directory / sub).mkdir(parents=True, exist_ok=True)
    (directory / "dbt_project.yml").write_text(
        dbt_project_yml(
            name, project.get("restrict_access"), project.get("access_default")
        )
    )
    if project.get("dependencies"):
        (directory / "dependencies.yml").write_text(
            json.dumps({"projects": [{"name": p} for p in project["dependencies"]]})
        )
    schema = {"version": 2, "models": [], "seeds": [], "snapshots": []}
    versioned = {}
    for model in project.get("models", []):
        refs = model.get("refs", [])
        select = " union all ".join(
            [f"select 1 as id from {ref_sql(r)}" for r in refs] or ["select 1 as id"]
        )
        version = model.get("version")
        file_name = (
            f"{model['name']}_v{version}.sql"
            if version is not None
            else f"{model['name']}.sql"
        )
        config_bits = []
        if model.get("ephemeral"):
            config_bits.append("materialized='ephemeral'")
        if model.get("alias"):
            config_bits.append(f"alias='{model['alias']}'")
        prefix = "{{ config(" + ", ".join(config_bits) + ") }}\n" if config_bits else ""
        (directory / "models" / file_name).write_text(prefix + select + "\n")
        if version is not None:
            entry = versioned.setdefault(
                model["name"],
                {
                    "name": model["name"],
                    "versions": [],
                    "latest_version": model.get("latest_version"),
                },
            )
            if model.get("access"):
                entry["access"] = model["access"]
            entry["versions"].append({"v": version})
            if model.get("latest_version") is not None:
                entry["latest_version"] = model["latest_version"]
        else:
            entry = {"name": model["name"]}
            if model.get("access"):
                entry["access"] = model["access"]
            if model.get("group"):
                entry["group"] = model["group"]
            schema["models"].append(entry)
    for entry in versioned.values():
        if entry["latest_version"] is None:
            del entry["latest_version"]
        schema["models"].append(entry)
    for seed in project.get("seeds", []):
        (directory / "seeds" / f"{seed['name']}.csv").write_text("id\n1\n")
        entry = {"name": seed["name"]}
        if seed.get("access"):
            entry["config"] = {"access": seed["access"]}
        schema["seeds"].append(entry)
    for snap in project.get("snapshots", []):
        refs = snap.get("refs", [])
        source = ref_sql(refs[0]) if refs else "(select 1 as id)"
        (directory / "snapshots" / f"{snap['name']}.sql").write_text(
            textwrap.dedent(
                f"""
                {{% snapshot {snap["name"]} %}}
                {{{{ config(target_schema='snap', unique_key='id', strategy='check', check_cols='all') }}}}
                select id from {source}
                {{% endsnapshot %}}
                """
            )
        )
        entry = {"name": snap["name"]}
        if snap.get("access"):
            entry["config"] = {"access": snap["access"]}
        schema["snapshots"].append(entry)
    for analysis in project.get("analyses", []):
        (directory / "analyses").mkdir(exist_ok=True)
        refs = analysis.get("refs", [])
        (directory / "analyses" / f"{analysis['name']}.sql").write_text(
            "select 1 as id from "
            + (ref_sql(refs[0]) if refs else "(select 1 as id)")
            + "\n"
        )
    if project.get("packages"):
        (directory / "packages.yml").write_text(
            json.dumps(
                {
                    "packages": [
                        {"local": str(root / pkg)} for pkg in project["packages"]
                    ]
                }
            )
        )
    if project.get("groups"):
        schema["groups"] = [
            {"name": g, "owner": {"name": "fuzz"}} for g in project["groups"]
        ]
    (directory / "models" / "schema.yml").write_text(json.dumps(schema))
    return directory


def run_parse(dbt, project_dir, target, env_extra=None, timeout=240):
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    env = os.environ.copy()
    env.update(
        {
            "DBT_SEND_ANONYMOUS_USAGE_STATS": "false",
            "DBT_PARTIAL_PARSE": "false",
            "DBT_PROFILES_DIR": str(target.parent.parent / "profiles"),
        }
    )
    env.pop("LIGHTDASH_DBT_EXTERNAL_NODES", None)
    env.pop("DBT_LOOM_CONFIG", None)
    env.pop("PYTHONPATH", None)
    env.update(env_extra or {})
    if (Path(project_dir) / "packages.yml").is_file():
        subprocess.run(
            [str(dbt), "--no-use-colors", "deps", "--project-dir", str(project_dir)],
            cwd=project_dir,
            env=env,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=True,
        )
    cmd = [
        str(dbt),
        "--no-use-colors",
        "--no-partial-parse",
        *(
            ["ls", "--output", "json", "--output-keys", "unique_id"]
            if os.environ.get("FUZZ_DBT_COMMAND") == "ls"
            else ["parse"]
        ),
        *(
            ["--select", os.environ["FUZZ_SELECT"]]
            if os.environ.get("FUZZ_SELECT")
            else []
        ),
        "--project-dir",
        str(project_dir),
        "--target-path",
        str(target),
        "--log-path",
        str(target / "logs"),
    ]
    completed = subprocess.run(
        cmd,
        cwd=project_dir,
        env=env,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    output = completed.stdout + "\n" + completed.stderr
    manifest_file = target / "manifest.json"
    manifest = (
        json.loads(manifest_file.read_text())
        if completed.returncode == 0 and manifest_file.is_file()
        else None
    )
    return {
        "returncode": completed.returncode,
        "output": output,
        "manifest": manifest,
        "tail": [l.rstrip() for l in output.splitlines() if l.strip()][-12:],
    }


def classify(result):
    out = result["output"]
    if result["returncode"] == 0:
        return "pass"
    if CYCLE in out:
        return "cycle"
    if PROTECTED.search(out):
        return "access-denied"
    if UNRESOLVED in out:
        return "unresolved"
    if "Traceback" in out:
        return "crash"
    if "Compilation Error" in out or "Parsing Error" in out or "Runtime Error" in out:
        return "error"
    return "unknown"


def excerpt(result, limit=6):
    lines = [
        l.strip()
        for l in result["output"].splitlines()
        if any(
            k in l
            for k in (
                UNRESOLVED,
                CYCLE,
                "not allowed",
                "Error",
                "ambiguous",
                "dbt-loom",
                "Traceback",
            )
        )
    ]
    return lines[:limit]


def bindings(manifest, project):
    if manifest is None:
        return None
    out = {}
    for uid, node in manifest["nodes"].items():
        if node.get("package_name") != project:
            continue
        if node.get("resource_type") not in ("model", "seed", "snapshot"):
            continue
        if not (node.get("path") or node.get("original_file_path")):
            continue
        deps = sorted(node.get("depends_on", {}).get("nodes", []))
        if deps:
            out[uid] = deps
    return out


def injected_ids(manifest, project):
    if manifest is None:
        return None
    return sorted(
        uid
        for uid, node in manifest["nodes"].items()
        if node.get("package_name") != project
        and not (node.get("path") or node.get("original_file_path"))
    )


def loom_config(store, references):
    """references: list of {name, path?, type?, included_packages?, excluded_packages?, optional?}"""
    manifests = []
    for ref in references:
        entry = {
            "name": ref["name"],
            "type": ref.get("type", "file"),
            "config": ref.get("config")
            or {"path": str(store / ref["name"] / "manifest.json")},
        }
        for knob in ("included_packages", "excluded_packages", "optional"):
            if knob in ref:
                entry[knob] = ref[knob]
        manifests.append(entry)
    return json.dumps({"manifests": manifests})


def fix7b_payload(store, upstreams, access_filter="public"):
    payloads = []
    for upstream in upstreams:
        path = store / upstream / "manifest.json"
        if not path.is_file():
            continue
        manifest = json.loads(path.read_text())
        payloads.extend(climb._public_payloads(manifest["nodes"].values()))
    return climb._restrict_depends_on(payloads)


def run_case(case, work):
    """case: {id, projects:[...], order:[provider names in seed order], consumers:[{name, upstreams:[...], loom:[refs]}]}"""
    work = Path(work)
    if work.exists():
        shutil.rmtree(work)
    (work / "profiles").mkdir(parents=True)
    (work / "profiles" / "profiles.yml").write_text(profiles_yml())
    projects = {p["name"]: write_project(work / "src", p) for p in case["projects"]}
    seed_projects = {
        p["name"]: write_project(work / "seed-src", p)
        for p in case.get("seed_projects", [])
    }
    store = work / "last-good"
    report = {"id": case["id"], "providers": {}, "consumers": {}}
    for name in case.get("seed_order", []):
        upstream_payload = fix7b_payload(
            store, case.get("seed_upstreams", {}).get(name, [])
        )
        nodes_path = work / f"{name}-seed-nodes.json"
        nodes_path.write_text(json.dumps(upstream_payload))
        env = {
            "PYTHONPATH": str(PLUGIN_DIR),
            "LIGHTDASH_DBT_EXTERNAL_NODES": str(nodes_path),
        }
        parsed = run_parse(
            NOLOOM_DBT,
            seed_projects.get(name, projects[name]),
            work / "seed-target" / name,
            env,
        )
        report["providers"][name] = {
            "tail": parsed["tail"],
            "status": classify(parsed),
            "excerpt": excerpt(parsed),
        }
        if parsed["manifest"] is not None:
            dest = store / name / "manifest.json"
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(work / "seed-target" / name / "manifest.json", dest)
    for consumer in case["consumers"]:
        name = consumer["name"]
        row = {}
        if "loom" in consumer:
            cfg = work / f"{name}-dbt_loom.config.yml"
            cfg.write_text(loom_config(store, consumer["loom"]))
            parsed = run_parse(
                LOOM_DBT,
                projects[consumer.get("project", name)],
                work / "loom-target" / name,
                {"DBT_LOOM_CONFIG": str(cfg)},
            )
            row["loom"] = {
                "status": classify(parsed),
                "tail": parsed["tail"],
                "excerpt": excerpt(parsed),
                "bindings": bindings(parsed["manifest"], name),
                "injected": injected_ids(parsed["manifest"], name),
            }
        payload = fix7b_payload(store, consumer.get("upstreams", []))
        nodes_path = work / f"{name}-fix7b-nodes.json"
        nodes_path.write_text(json.dumps(payload))
        env = {
            "PYTHONPATH": str(PLUGIN_DIR),
            "LIGHTDASH_DBT_EXTERNAL_NODES": str(nodes_path),
        }
        parsed = run_parse(
            NOLOOM_DBT,
            projects[consumer.get("project", name)],
            work / "fix7b-target" / name,
            env,
        )
        row["fix7b"] = {
            "status": classify(parsed),
            "tail": parsed["tail"],
            "excerpt": excerpt(parsed),
            "bindings": bindings(parsed["manifest"], name),
            "injected": injected_ids(parsed["manifest"], name),
            "payload_ids": sorted(
                f"{n.get('resource_type', 'model')}.{n['package_name']}.{n['name']}"
                + ("" if n.get("version") is None else f".v{n['version']}")
                for n in payload
            ),
            "payload_depends_on": {
                f"{n.get('resource_type', 'model')}.{n['package_name']}.{n['name']}"
                + ("" if n.get("version") is None else f".v{n['version']}"): n[
                    "depends_on_nodes"
                ]
                for n in payload
            },
        }
        report["consumers"][name] = row
    return report


def summarize(report):
    lines = []
    for name, row in report["consumers"].items():
        loom = row.get("loom", {})
        fix = row["fix7b"]
        lines.append(
            f"{report['id']} {name}: loom={loom.get('status', 'n/a')} fix7b={fix['status']} "
            f"bindings_equal={loom.get('bindings') == fix['bindings'] if loom else 'n/a'}"
        )
    return "\n".join(lines)
