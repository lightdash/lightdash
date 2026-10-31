"""Public seeds, snapshots and an installed-package control for the scale fixtures.

The generators keep their recorded shapes. The scale probe applies these
additions to a generated fixture directory before it parses anything:

- every source gets one public seed and one public snapshot of that seed;
- a local dbt package with a public seed, snapshot and model is installed by
  the consumer's first two upstreams, and must stay local to them;
- the consumer gets one model that references its first upstream's public
  seed and snapshot, stubbed under the bootstrap variable like the other
  generated cross-repo refs.
"""

import random
from pathlib import Path

from generate import model_schema, seed_rows, yaml_json

PUBLIC_SEED = "{source}_public_seed"
SNAPSHOT = "{source}_history"
PACKAGE_NAME = "pkg_shared_assets"
PACKAGE_SEED = "pkg_shared_seed"
PACKAGE_SNAPSHOT = "pkg_shared_history"
PACKAGE_MODEL = "pkg_shared_model"
CONSUMER_MODEL = "uses_public_assets"
INSTALLER_COUNT = 2


def public_seed_name(source):
    return PUBLIC_SEED.format(source=source)


def snapshot_name(source):
    return SNAPSHOT.format(source=source)


def _seed_properties(name):
    schema = model_schema(name)
    del schema["access"]
    schema["config"]["access"] = "public"
    return {"version": 2, "seeds": [schema]}


def _snapshot_properties(name, seed):
    return {
        "version": 2,
        "snapshots": [
            {
                "name": name,
                "relation": f"ref('{seed}')",
                "config": {
                    "access": "public",
                    "unique_key": "id",
                    "strategy": "check",
                    "check_cols": "all",
                },
            }
        ],
    }


def _consumer_sql(upstream):
    seed = public_seed_name(upstream)
    snapshot = snapshot_name(upstream)
    return (
        "{% if var('sim_bootstrap', false) %}\n"
        "select 1::integer as id, 'bootstrap'::text as label, 0::numeric as amount,\n"
        "       true as active, date '2026-01-01' as event_date\n"
        "{% else %}\n"
        "select s.id, s.label, s.amount::numeric as amount, s.active, s.event_date\n"
        f"from {{{{ ref('{upstream}', '{seed}') }}}} s\n"
        f"join {{{{ ref('{upstream}', '{snapshot}') }}}} h on h.id = s.id\n"
        "{% endif %}\n"
    )


def package_files(root):
    package = Path(root) / "packages" / PACKAGE_NAME
    return {
        package / "dbt_project.yml": yaml_json(
            {
                "name": PACKAGE_NAME,
                "version": "1.0.0",
                "config-version": 2,
                "profile": "multi_repo_sim",
                "model-paths": ["models"],
                "seed-paths": ["seeds"],
                "snapshot-paths": ["snapshots"],
                "models": {PACKAGE_NAME: {"+materialized": "table", "+schema": "pkg"}},
                "seeds": {PACKAGE_NAME: {"+schema": "pkg"}},
            }
        ),
        package / "seeds" / f"{PACKAGE_SEED}.csv": seed_rows(
            PACKAGE_NAME, random.Random(7)
        ),
        package / "seeds" / "seeds.yml": yaml_json(_seed_properties(PACKAGE_SEED)),
        package / "snapshots" / f"{PACKAGE_SNAPSHOT}.yml": yaml_json(
            _snapshot_properties(PACKAGE_SNAPSHOT, PACKAGE_SEED)
        ),
        package / "models" / f"{PACKAGE_MODEL}.sql": (
            "select id, label, amount, active, event_date\n"
            f"from {{{{ ref('{PACKAGE_SEED}') }}}}\n"
        ),
        package / "models" / "schema.yml": yaml_json(
            {"version": 2, "models": [model_schema(PACKAGE_MODEL)]}
        ),
    }


def plan(registry, consumer):
    sources = [source["name"] for source in registry["sources"]]
    upstreams = next(
        source["upstreams"]
        for source in registry["sources"]
        if source["name"] == consumer
    )
    if len(upstreams) < INSTALLER_COUNT:
        raise RuntimeError(
            f"{consumer} needs {INSTALLER_COUNT} upstreams for the package control"
        )
    return {
        "sources": sources,
        "consumer": consumer,
        "reference_upstream": upstreams[0],
        "installers": list(upstreams[:INSTALLER_COUNT]),
    }


def apply(fixture_root, registry, consumer, rng_seed=42):
    fixture_root = Path(fixture_root)
    selected = plan(registry, consumer)
    rng = random.Random(rng_seed)
    files = dict(package_files(fixture_root))
    for source in selected["sources"]:
        repo = fixture_root / "repos" / source
        seed = public_seed_name(source)
        files[repo / "seeds" / f"{seed}.csv"] = seed_rows(f"{source}_public", rng)
        files[repo / "seeds" / "public_seed.yml"] = yaml_json(_seed_properties(seed))
        files[repo / "snapshots" / f"{snapshot_name(source)}.yml"] = yaml_json(
            _snapshot_properties(snapshot_name(source), seed)
        )
    for installer in selected["installers"]:
        files[fixture_root / "repos" / installer / "packages.yml"] = yaml_json(
            {"packages": [{"local": f"../../packages/{PACKAGE_NAME}"}]}
        )
    consumer_repo = fixture_root / "repos" / consumer
    files[consumer_repo / "models" / f"{CONSUMER_MODEL}.sql"] = _consumer_sql(
        selected["reference_upstream"]
    )
    files[consumer_repo / "models" / f"{CONSUMER_MODEL}.yml"] = yaml_json(
        {"version": 2, "models": [model_schema(CONSUMER_MODEL)]}
    )
    for path, contents in files.items():
        if not path.resolve().is_relative_to(fixture_root.resolve()):
            raise ValueError("Scale addition escapes the fixture directory")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding="utf-8")
    upstream = selected["reference_upstream"]
    return {
        **selected,
        "public_seeds": [public_seed_name(source) for source in selected["sources"]],
        "snapshots": [snapshot_name(source) for source in selected["sources"]],
        "package": {
            "name": PACKAGE_NAME,
            "nodes": [
                f"seed.{PACKAGE_NAME}.{PACKAGE_SEED}",
                f"snapshot.{PACKAGE_NAME}.{PACKAGE_SNAPSHOT}",
                f"model.{PACKAGE_NAME}.{PACKAGE_MODEL}",
            ],
        },
        "consumer_model": CONSUMER_MODEL,
        "consumer_refs": [
            f"seed.{upstream}.{public_seed_name(upstream)}",
            f"snapshot.{upstream}.{snapshot_name(upstream)}",
        ],
        "files_written": sorted(str(path.relative_to(fixture_root)) for path in files),
    }
