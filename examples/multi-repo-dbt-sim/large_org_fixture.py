import collections
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

CHECKOUT = ROOT.parents[1]
VARIANTS = (
    "healthy",
    "mixed",
    "one-arg",
    "cycle",
    "cycle-nine",
    "missing-project",
    "missing-shared",
    "duplicate-project",
    "empty-selector",
    "unreadable",
    "combined",
)
SOURCE_NAMES = (
    "proj_core",
    "analyst_hub",
    "proj_growth",
    *(f"proj_{letter}" for letter in "abcdefghi"),
    "proj_bank",
    "proj_bank_reporting",
    "proj_j",
    "proj_k",
    "proj_l",
    "proj_m",
    "proj_core_copy",
)
RING_PROJECTS = tuple(f"proj_{letter}" for letter in "abcdefghi")
SAVED_CYCLE_PATH = (
    "proj_a.reporting_x",
    "proj_a.staging_x",
    "proj_b.transactions_x",
    "proj_b.curated_x",
    "proj_c.mart_x",
    "proj_a.reporting_x",
)
NINE_CYCLE_PATH = (
    *SAVED_CYCLE_PATH[:-1],
    *(f"proj_{letter}.cycle_extension" for letter in "defghi"),
    "proj_a.reporting_x",
)
MISSING_PROJECTS = ("proj_unconnected", "shared_dims")


def _edge(consumer: str, provider: str) -> dict:
    consumer_project, _ = consumer.split(".")
    provider_project, provider_model = provider.split(".")
    arguments = (
        [provider_model]
        if consumer_project == provider_project
        else [provider_project, provider_model]
    )
    version = 3 if provider == "proj_b.transactions_x" else None
    return {
        "from": consumer,
        "to": provider,
        "ref": arguments,
        "refArgumentCount": len(arguments),
        "version": version,
        "fromUniqueId": _unique_id(consumer),
        "toUniqueId": _unique_id(provider),
    }


def _unique_id(model: str) -> str:
    return f"model.{model}" + (".v3" if model == "proj_b.transactions_x" else "")


def _cycle(path: tuple[str, ...], label: str, evidence: str) -> dict:
    edges = [_edge(consumer, provider) for consumer, provider in pairwise(path)]
    assert path[0] == path[-1]
    assert len({edge["from"] for edge in edges}) == len(edges)
    assert all(
        edges[index]["to"] == edges[(index + 1) % len(edges)]["from"]
        for index in range(len(edges))
    )
    return {
        "label": label,
        "evidence": evidence,
        "closedPath": list(path),
        "closedUniqueIds": [_unique_id(model) for model in path],
        "projectCount": len({model.split(".")[0] for model in path}),
        "modelCount": len(edges),
        "edgeCount": len(edges),
        "refArgumentCounts": {
            "one": sum(edge["refArgumentCount"] == 1 for edge in edges),
            "two": sum(edge["refArgumentCount"] == 2 for edge in edges),
        },
        "edges": edges,
        "versionedModel": {
            "project": "proj_b",
            "name": "transactions_x",
            "version": 3,
            "uniqueId": "model.proj_b.transactions_x.v3",
        },
    }


def _reference_sql(
    source: str, arguments: list[str], version: int | None = None
) -> str:
    expression = "ref(" + ", ".join(repr(value) for value in arguments)
    if version is not None:
        expression += f", v={version}"
    return model_sql(source, 0, "", expression + ")")


def generate(out: Path, variant: str = "mixed", seed: int = 42) -> dict:
    if variant not in VARIANTS:
        raise ValueError("Unknown large-org multi-source scenario variant")
    out = out.resolve()
    if (
        out == CHECKOUT
        or CHECKOUT.is_relative_to(out)
        or out == ROOT
        or out.is_relative_to(BASE)
        or ROOT.is_relative_to(out)
    ):
        raise ValueError("The output must be a separate generated fixture directory")
    rng = random.Random(seed)
    sources = {name: Source(name, name, "1.12", [], []) for name in SOURCE_NAMES}
    assert len(sources) == 19
    files = {}
    schemas = {name: [] for name in SOURCE_NAMES}
    references = []
    mixed = variant in ("mixed", "combined")
    one_arg = mixed or variant == "one-arg"
    duplicate = variant in ("duplicate-project", "combined")
    selector = (
        "tag:reference_only" if variant in ("empty-selector", "combined") else None
    )
    unreadable = ["proj_m"] if variant in ("unreadable", "combined") else []
    cycle_kind = (
        "nine"
        if variant in ("cycle-nine", "combined")
        else "saved"
        if variant == "cycle"
        else None
    )
    saved_cycle = _cycle(
        SAVED_CYCLE_PATH,
        "Saved five-model closed loop",
        "Saved sanitised SQL shape; version 3 is an explicit fixture requirement",
    )
    nine_cycle = _cycle(
        NINE_CYCLE_PATH,
        "Synthetic nine-project closed-loop expansion",
        "Invented extension of the saved five-model loop through proj_d to proj_i",
    )
    active_cycle = {"saved": saved_cycle, "nine": nine_cycle}.get(cycle_kind)
    cycle_edges = (
        {edge["from"]: edge for edge in active_cycle["edges"]} if active_cycle else {}
    )

    def write(relative: str, contents: str) -> None:
        files[relative] = contents

    def add_model(
        source: str,
        name: str,
        arguments: list[str] | None = None,
        version: int | None = None,
    ) -> None:
        item = sources[source]
        if name in item.models:
            raise ValueError(f"Duplicate generated model in {source}: {name}")
        item.models.append(name)
        schema = model_schema(name)
        filename = name
        if source == "proj_b" and name == "transactions_x":
            schema.update(latest_version=3, versions=[{"v": 3}])
            filename += "_v3"
        schemas[source].append(schema)
        sql = (
            model_sql(source, 0, "")
            if arguments is None
            else _reference_sql(source, arguments, version)
        )
        write(f"repos/{source}/models/{filename}.sql", sql)
        if arguments is not None:
            provider = source if len(arguments) == 1 else arguments[0]
            if len(arguments) == 1 and arguments[0] == "model_shared":
                provider = "analyst_hub"
            references.append(
                {
                    "model": f"{source}.{name}",
                    "ref": arguments,
                    "refArgumentCount": len(arguments),
                    "version": version,
                    "providerProject": provider,
                    "providerModel": arguments[-1],
                }
            )
            if (
                provider != source
                and provider in sources
                and provider not in item.upstreams
            ):
                item.upstreams.append(provider)

    for source in SOURCE_NAMES:
        add_model(source, f"{source}_base")
        write(f"repos/{source}/seeds/{source}_seed.csv", seed_rows(source, rng))
    for provider in ("proj_core", "analyst_hub"):
        add_model(provider, "model_shared")
    add_model("proj_core", "model_other")
    add_model(
        "proj_growth",
        "consumer_1",
        ["model_shared"] if one_arg else ["analyst_hub", "model_shared"],
    )
    add_model(
        "proj_growth",
        "consumer_2",
        None if variant == "one-arg" else ["analyst_hub", "model_shared"],
    )
    add_model("proj_growth", "consumer_3", ["proj_core", "model_other"])
    for index, source in enumerate(RING_PROJECTS):
        provider = RING_PROJECTS[(index + 1) % len(RING_PROJECTS)]
        add_model(source, "ring_report", [provider, f"{provider}_base"])
    for model in NINE_CYCLE_PATH[:-1]:
        source, name = model.split(".")
        edge = cycle_edges.get(model)
        add_model(
            source,
            name,
            edge["ref"] if edge else None,
            edge["version"] if edge else None,
        )
    add_model("proj_core", "bank_usage", ["proj_bank", "proj_bank_base"])
    add_model(
        "proj_core",
        "bank_reporting_usage",
        ["proj_bank_reporting", "proj_bank_reporting_base"],
    )
    add_model(
        "proj_j",
        "missing_project_usage",
        ["proj_unconnected", "unconnected_base"]
        if variant in ("missing-project", "combined")
        else None,
    )
    add_model(
        "proj_k",
        "missing_shared_usage",
        ["shared_dims", "shared_dimension"]
        if variant in ("missing-shared", "combined")
        else None,
    )
    filters = []
    loom_imports = {}
    for source in sources.values():
        write(f"repos/{source.name}/dbt_project.yml", yaml_json(project_config(source)))
        write(
            f"repos/{source.name}/.gitignore", "target/\nlogs/\ndbt_packages/\n.env*\n"
        )
        write(
            f"repos/{source.name}/lightdash.config.yml",
            yaml_json({"spotlight": {"default_visibility": "hide"}}),
        )
        seed_schema = model_schema(f"{source.name}_seed")
        del seed_schema["access"]
        write(
            f"repos/{source.name}/models/schema.yml",
            yaml_json(
                {"version": 2, "models": schemas[source.name], "seeds": [seed_schema]}
            ),
        )
        write(
            f"repos/{source.name}/profiles.yml",
            (BASE / "profiles/profiles.yml").read_text(),
        )
        imports = []
        for provider in source.upstreams:
            path = out / "published" / provider / "manifest.json"
            if source.name == "proj_growth" and provider == "proj_core" and one_arg:
                path = out / "published/filtered/proj_growth/proj_core/manifest.json"
                excluded_models = ["model.proj_core.model_shared"]
                filters.append(
                    {
                        "consumer": source.name,
                        "provider": provider,
                        "sourcePath": str(out / "published/proj_core/manifest.json"),
                        "outputPath": str(path),
                        "excludedUniqueIds": excluded_models,
                        "removeParentMapEntries": True,
                        "removeChildMapEntries": True,
                    }
                )
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
            write(
                f"repos/{source.name}/dbt_loom.config.yml",
                yaml_json({"manifests": imports}),
            )
    write("profiles/profiles.yml", (BASE / "profiles/profiles.yml").read_text())
    source_entries = []
    for source in sources.values():
        entry = source.registry_entry()
        entry.update(
            repoName="proj_core"
            if source.name == "proj_core_copy" and duplicate
            else source.name,
            selector=selector if source.name == "proj_l" else None,
            unreadable=source.name in unreadable,
        )
        source_entries.append(entry)
    missing_refs = [
        reference
        for reference in references
        if reference["providerProject"] in MISSING_PROJECTS
    ]
    configured_items = [
        {
            "item": 1,
            "name": "nineteen connected sources",
            "enabled": True,
            "sources": list(SOURCE_NAMES),
        },
        {
            "item": 2,
            "name": "closed model loop",
            "enabled": active_cycle is not None,
            "cycle": cycle_kind,
        },
        {
            "item": 3,
            "name": "unconnected project reference",
            "enabled": any(
                ref["providerProject"] == "proj_unconnected" for ref in missing_refs
            ),
            "project": "proj_unconnected",
        },
        {
            "item": 4,
            "name": "unconnected shared project reference",
            "enabled": any(
                ref["providerProject"] == "shared_dims" for ref in missing_refs
            ),
            "project": "shared_dims",
        },
        {
            "item": 5,
            "name": "duplicated model consumer binding",
            "enabled": True,
            "model": "model_shared",
            "source": "proj_growth",
            "providers": ["proj_core", "analyst_hub"],
            "one_arg_enabled": one_arg,
            "mixed_binding_enabled": mixed,
        },
        {
            "item": 6,
            "name": "same project connected twice and distinct near project names",
            "enabled": True,
            "projects": ["proj_bank", "proj_bank_reporting"],
            "duplicate_case": duplicate,
            "source": "proj_core_copy",
            "repoName": "proj_core" if duplicate else "proj_core_copy",
        },
        {
            "item": 7,
            "name": "empty model selector",
            "enabled": selector is not None,
            "source": "proj_l",
            "selector": selector,
        },
        {
            "item": 8,
            "name": "unreadable repository",
            "enabled": bool(unreadable),
            "sources": unreadable,
        },
        {
            "item": 9,
            "name": "disk budget and compile concurrency",
            "enabled": True,
            "diskBudgetBytes": 3221225472,
            "concurrency": 4,
            "defaultDerivedConcurrency": 11,
        },
    ]
    owners = collections.defaultdict(list)
    for source in sources.values():
        for model in source.models:
            owners[model].append(source.name)
    counts = {source.name: len(source.models) for source in sources.values()}
    registry = {
        "scale": "large-org",
        "variant": variant,
        "seed": seed,
        "primarySource": "proj_core",
        "sources": source_entries,
        "stats": {
            "sourceCount": len(sources),
            "totalModels": sum(counts.values()),
            "totalModelNodes": sum(counts.values()),
            "totalSeeds": len(sources),
            "modelCounts": counts,
            "distinctModelNames": len(owners),
            "duplicatedNames": sorted(
                model for model, projects in owners.items() if len(projects) > 1
            ),
            "duplicatedDistinctNames": sum(
                len(projects) > 1 for projects in owners.values()
            ),
        },
        "scenario": {
            "name": "large-org multi-source scenario",
            "variant": variant,
            "configuredItems": configured_items,
            "edgeDirection": "consumer_depends_on_provider",
            "consumerRefs": [
                ref for ref in references if ref["model"].startswith("proj_growth.")
            ],
            "duplicatedModel": {
                "name": "model_shared",
                "primaryProvider": "proj_core",
                "explicitProvider": "analyst_hub",
                "consumer": "proj_growth",
            },
            "refs": references,
            "cycle": active_cycle,
            "savedCycle": saved_cycle,
            "syntheticNineCycle": nine_cycle,
            "legalRing": {
                "projects": list(RING_PROJECTS),
                "modelCycle": False,
                "edges": [
                    _edge(
                        f"{source}.ring_report",
                        f"{RING_PROJECTS[(index + 1) % 9]}.{RING_PROJECTS[(index + 1) % 9]}_base",
                    )
                    for index, source in enumerate(RING_PROJECTS)
                ],
            },
            "missingNotConnectedProjects": sorted(
                {ref["providerProject"] for ref in missing_refs}
            ),
            "missingRefs": missing_refs,
            "selector": {
                "source": "proj_l",
                "value": selector,
                "tag": "reference_only" if selector else None,
            },
            "unreadableSources": unreadable,
            "loomImports": loom_imports,
            "publicationFilters": filters,
            "bootstrapSnapshots": "Intentionally published stub snapshots omit all external model dependencies",
            "evidenceGaps": [
                "No original SQL is verified",
                "The nine-project closed loop is an invented expansion",
            ],
        },
        "generatedFiles": sorted(files),
    }
    assert len(registry["sources"]) == 19
    assert saved_cycle["refArgumentCounts"] == {"one": 2, "two": 3}
    assert nine_cycle["projectCount"] == 9
    assert len(registry["scenario"]["consumerRefs"]) == (
        2 if variant == "one-arg" else 3
    )
    for relative in (*files, "registry.json"):
        path = out / relative
        if not path.resolve().is_relative_to(out):
            raise ValueError("Generated path escapes the output directory")
    for relative, contents in files.items():
        path = out / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding="utf-8")
    (out / "registry.json").write_text(yaml_json(registry), encoding="utf-8")
    return registry
