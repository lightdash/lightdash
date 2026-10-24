import collections
import json
import random
from itertools import pairwise
from pathlib import Path

from generate import (
    BASE,
    ROOT,
    Source,
    model_schema,
    model_sql,
    project_config,
    seed_rows,
    yaml_json,
)

VARIANTS = ("prod-cycle", "prod-mixed")
SOURCE_NAMES = (
    "proj_bank",
    "proj_payments",
    "proj_analyst",
    "proj_growth",
    *(f"proj_{letter}" for letter in "abcdefghijklmno"),
)
CYCLE_PATH = (
    "proj_bank.mart_bank_summary",
    "proj_bank.int_bank_accounts",
    "proj_bank.stg_bank_accounts",
    "proj_payments.transactions",
    "proj_payments.int_payment_events",
    "proj_payments.stg_payment_events",
    "proj_payments.mart_payment_accounts",
    "proj_analyst.segment_cohort",
    "proj_analyst.segment_activity",
    "proj_analyst.segment_value",
    "proj_analyst.int_segment_members",
    "proj_analyst.stg_segment_members",
    "proj_analyst.mart_segment_accounts",
    "proj_analyst.reporting_bank",
    "proj_bank.mart_bank_summary",
)
VERSIONED_MODELS = (
    "proj_payments.transactions",
    "proj_analyst.segment_cohort",
    "proj_analyst.segment_activity",
    "proj_analyst.segment_value",
)
DECOYS = ("proj_bank.decoy_v3", "proj_analyst.decoy_v2")
DUPLICATE = "mart_merchant__merchants"


def unique_id(model: str) -> str:
    return f"model.{model}" + (".v3" if model in VERSIONED_MODELS else "")


def cycle_graph() -> dict:
    edges = []
    for consumer, provider in pairwise(CYCLE_PATH):
        source = consumer.split(".")[0]
        project, model = provider.split(".")
        arguments = [model] if project == source else [project, model]
        edges.append(
            {
                "from": consumer,
                "to": provider,
                "fromUniqueId": unique_id(consumer),
                "toUniqueId": unique_id(provider),
                "ref": arguments,
                "refArgumentCount": len(arguments),
                "version": 3 if provider in VERSIONED_MODELS else None,
            }
        )
    return {
        "closedPath": list(CYCLE_PATH),
        "closedUniqueIds": [unique_id(model) for model in CYCLE_PATH],
        "modelCount": len(edges),
        "edgeCount": len(edges),
        "projectCount": len({model.split(".")[0] for model in CYCLE_PATH}),
        "sourceRing": ["proj_bank", "proj_payments", "proj_analyst", "proj_bank"],
        "edges": edges,
        "evidence": "Invented generic closed loop; not an original customer graph",
    }


def generate(out: Path, variant: str = "prod-cycle", seed: int = 42) -> dict:
    if variant not in VARIANTS:
        raise ValueError("Unknown prod-shaped variant")
    out = out.resolve()
    if ROOT.is_relative_to(out) or out.is_relative_to(BASE):
        raise ValueError("The output must be a separate generated fixture directory")
    sources = {name: Source(name, name, "1.12", [], []) for name in SOURCE_NAMES}
    schemas = {name: [] for name in SOURCE_NAMES}
    files = {}
    references = []
    rng = random.Random(seed)
    cycle = cycle_graph()
    active_edges = (
        {edge["from"]: edge for edge in cycle["edges"]}
        if variant == "prod-cycle"
        else {}
    )

    def add_model(source, name, arguments=None, version=None):
        item = sources[source]
        if name in item.models:
            raise ValueError("Duplicate generated model")
        item.models.append(name)
        model = f"{source}.{name}"
        schema = model_schema(name)
        filename = name
        if model in VERSIONED_MODELS:
            schema.update(latest_version=3, versions=[{"v": 3}])
            filename += "_v3"
        schemas[source].append(schema)
        expression = ""
        if arguments is not None:
            expression = "ref(" + ", ".join(repr(value) for value in arguments)
            expression += f", v={version})" if version is not None else ")"
            provider = (
                arguments[0]
                if len(arguments) == 2
                else "proj_analyst"
                if arguments == [DUPLICATE]
                else source
            )
            references.append(
                {
                    "model": model,
                    "ref": arguments,
                    "version": version,
                    "providerProject": provider,
                    "providerModel": arguments[-1],
                    "refArgumentCount": len(arguments),
                }
            )
            if provider != source and provider not in item.upstreams:
                item.upstreams.append(provider)
        files[f"repos/{source}/models/{filename}.sql"] = model_sql(
            source, 0, "", expression
        )

    for source in SOURCE_NAMES:
        add_model(source, f"{source}_base")
        files[f"repos/{source}/seeds/{source}_seed.csv"] = seed_rows(source, rng)
    for model in CYCLE_PATH[:-1]:
        edge = active_edges.get(model, {})
        add_model(*model.split("."), edge.get("ref"), edge.get("version"))
    for model in DECOYS:
        add_model(*model.split("."))
    for provider in ("proj_bank", "proj_analyst"):
        add_model(provider, DUPLICATE)
    add_model("proj_bank", "model_other")
    add_model(
        "proj_growth",
        "consumer_one_arg",
        [DUPLICATE] if variant == "prod-mixed" else ["proj_analyst", DUPLICATE],
    )
    add_model("proj_growth", "consumer_explicit", ["proj_analyst", DUPLICATE])
    add_model("proj_growth", "consumer_primary", ["proj_bank", "model_other"])
    filters = []
    loom_imports = {}
    profile = (BASE / "profiles/profiles.yml").read_text()
    for source in sources.values():
        prefix = f"repos/{source.name}"
        files[f"{prefix}/dbt_project.yml"] = yaml_json(project_config(source))
        files[f"{prefix}/.gitignore"] = "target/\nlogs/\ndbt_packages/\n.env*\n"
        files[f"{prefix}/lightdash.config.yml"] = yaml_json(
            {"spotlight": {"default_visibility": "hide"}}
        )
        seed_schema = model_schema(f"{source.name}_seed")
        del seed_schema["access"]
        files[f"{prefix}/models/schema.yml"] = yaml_json(
            {"version": 2, "models": schemas[source.name], "seeds": [seed_schema]}
        )
        files[f"{prefix}/profiles.yml"] = profile
        imports = []
        for provider in source.upstreams:
            path = out / "published" / provider / "manifest.json"
            if (
                variant == "prod-mixed"
                and source.name == "proj_growth"
                and provider == "proj_bank"
            ):
                filtered = (
                    out / "published/filtered/proj_growth/proj_bank/manifest.json"
                )
                filters.append(
                    {
                        "consumer": source.name,
                        "provider": provider,
                        "sourcePath": str(path),
                        "outputPath": str(filtered),
                        "excludedUniqueIds": [unique_id(f"proj_bank.{DUPLICATE}")],
                        "removeParentMapEntries": True,
                        "removeChildMapEntries": True,
                    }
                )
                path = filtered
            imports.append(
                {
                    "name": provider,
                    "type": "file",
                    "config": {"path": str(path)},
                    "excluded_packages": sorted(set(SOURCE_NAMES) - {provider}),
                }
            )
        loom_imports[source.name] = imports
        if imports:
            files[f"{prefix}/dbt_loom.config.yml"] = yaml_json({"manifests": imports})
    files["profiles/profiles.yml"] = profile
    counts = {source.name: len(source.models) for source in sources.values()}
    owners = collections.Counter(
        model for item in sources.values() for model in item.models
    )
    registry = {
        "scale": "prod-shaped",
        "variant": variant,
        "seed": seed,
        "primarySource": "proj_bank",
        "sources": [source.registry_entry() for source in sources.values()],
        "stats": {
            "sourceCount": len(sources),
            "totalModels": sum(counts.values()),
            "totalModelNodes": sum(counts.values()),
            "totalSeeds": len(sources),
            "modelCounts": counts,
            "duplicatedNames": sorted(
                name for name, count in owners.items() if count > 1
            ),
        },
        "scenario": {
            "name": "prod-shaped independent probe",
            "variant": variant,
            "edgeDirection": "consumer_depends_on_provider",
            "cycle": cycle if variant == "prod-cycle" else None,
            "proposedCycle": cycle,
            "versionedModels": [unique_id(model) for model in VERSIONED_MODELS],
            "unversionedDecoys": [unique_id(model) for model in DECOYS],
            "refs": references,
            "consumerRefs": [
                ref for ref in references if ref["model"].startswith("proj_growth.")
            ],
            "duplicatedModel": {
                "name": DUPLICATE,
                "primaryProvider": "proj_bank",
                "explicitProvider": "proj_analyst",
                "consumer": "proj_growth",
            },
            "loomImports": loom_imports,
            "publicationFilters": filters,
            "bootstrapSnapshots": "Real dbt parse with sim_bootstrap; published before cyclic refs are compiled",
        },
        "generatedFiles": sorted(files),
    }
    for relative in (*files, "registry.json"):
        if not (out / relative).resolve().is_relative_to(out):
            raise ValueError("Generated path escapes the output directory")
    for relative, contents in files.items():
        path = out / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents)
    (out / "registry.json").write_text(yaml_json(registry))
    return registry


def validate_publications(root: Path, registry: dict) -> dict:
    actual = {}
    for source in registry["sources"]:
        manifest = json.loads(
            (root / "published" / source["name"] / "manifest.json").read_text()
        )
        nodes = {
            key: node
            for key, node in manifest["nodes"].items()
            if node.get("resource_type") == "model"
        }
        expected = {unique_id(f"{source['name']}.{name}") for name in source["models"]}
        if set(nodes) != expected:
            raise RuntimeError("Parsed manifest model IDs differ from fixture schema")
        for key, node in nodes.items():
            expected_version = (
                3 if key in registry["scenario"]["versionedModels"] else None
            )
            if node.get("version") != expected_version:
                raise RuntimeError(
                    "Parsed manifest model version differs from fixture schema"
                )
        actual.update(nodes)
    return {
        "model_count": len(actual),
        "versioned_ids": sorted(
            key for key, node in actual.items() if node.get("version") == 3
        ),
        "decoy_ids": sorted(
            key for key in actual if key in registry["scenario"]["unversionedDecoys"]
        ),
        "method": "actual dbt bootstrap manifest nodes",
    }
