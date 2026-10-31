import argparse
import collections
import csv
import io
import json
import random
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = ROOT / "base"
SCALES = ("small", "full")
UPSTREAM_DOMAINS = (
    "accounts",
    "billing",
    "catalog",
    "contracts",
    "inventory",
    "loyalty",
    "subscriptions",
    "support",
    "delivery",
    "pricing",
    "treasury",
    "compliance",
    "products",
    "regions",
    "fulfilment",
    "retention",
)
VARIANTS = ("baseline", "ambiguity", "duplicate-project", "empty-selector", "newcomer")
FULL_COUNTS = {
    "payments": 1300,
    "merchants": 900,
    "finance": 100,
    "risk": 100,
    "growth": 100,
    "marketing": 100,
}
COLUMNS = (
    ("id", "integer", "number"),
    ("label", "text", "string"),
    ("amount", "numeric", "number"),
    ("active", "boolean", "boolean"),
    ("event_date", "date", "date"),
)


@dataclass
class Source:
    name: str
    project_name: str
    dbt_version: str
    upstreams: list[str]
    models: list[str]

    def registry_entry(self) -> dict:
        return {
            "name": self.name,
            "projectName": self.project_name,
            "dbtVersion": self.dbt_version,
            "models": sorted(self.models),
            "upstreams": self.upstreams,
        }


def yaml_json(value: dict) -> str:
    return json.dumps(value, indent=2, sort_keys=True) + "\n"


def model_schema(name: str) -> dict:
    return {
        "name": name,
        "access": "public",
        "config": {
            "meta": {
                "primary_key": "id",
                "metrics": {
                    "total_amount": {"type": "sum", "sql": "${TABLE}.amount"},
                },
            },
        },
        "columns": [
            {
                "name": column,
                "data_type": data_type,
                "meta": {"dimension": {"type": dimension}},
            }
            for column, data_type, dimension in COLUMNS
        ],
    }


def seed_rows(domain: str, rng: random.Random) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow([column for column, _, _ in COLUMNS])
    for number in range(1, 4):
        writer.writerow(
            [
                number,
                f"{domain}_sample_{number}",
                rng.randint(10, 500),
                "true" if number % 2 else "false",
                f"2026-01-0{number}",
            ]
        )
    return output.getvalue()


def model_sql(domain: str, offset: int, upstream: str, reference: str = "") -> str:
    if upstream or reference:
        expression = reference or f"ref('{upstream}', '{upstream}_model_0001')"
        return (
            "{% if var('sim_bootstrap', false) %}\n"
            "select 1::integer as id, 'bootstrap'::text as label, 0::numeric as amount,\n"
            "       true as active, date '2026-01-01' as event_date\n"
            "{% else %}\n"
            f"select id, label, (amount + {offset})::numeric as amount, active, event_date\n"
            "from {{ " + expression + " }}\n"
            "{% endif %}\n"
        )
    return (
        "{{ config(tags=['sim_base']) }}\n"
        f"select id::integer as id, label::text as label, (amount + {offset})::numeric as amount,\n"
        "       active::boolean as active, event_date::date as event_date\n"
        "from {{ ref('" + domain + "_seed') }}\n"
    )


def project_config(source: Source) -> dict:
    return {
        "name": source.project_name,
        "version": "1.0.0",
        "config-version": 2,
        "profile": "multi_repo_sim",
        "model-paths": ["models"],
        "seed-paths": ["seeds"],
        "models": {
            source.project_name: {"+materialized": "table", "+schema": source.name},
        },
        "seeds": {source.project_name: {"+schema": source.name}},
    }


def generate(out: Path, scale: str, seed: int, variant: str = "baseline") -> dict:
    if scale not in SCALES or variant not in VARIANTS:
        raise ValueError("Unknown scale or variant")
    out = out.resolve()
    if ROOT == out or ROOT.is_relative_to(out) or out.is_relative_to(BASE):
        raise ValueError("The output must be a separate generated fixture directory")
    rng = random.Random(seed)
    sources = [
        Source(
            item["name"], item["projectName"], item["dbtVersion"], item["upstreams"], []
        )
        for item in json.loads((BASE / "topology.json").read_text())["sources"]
    ]
    if scale == "full":
        sources.extend(
            Source(domain, domain, "1.12", [], []) for domain in UPSTREAM_DOMAINS
        )
        sources[0].upstreams.extend(UPSTREAM_DOMAINS[:14])
        next(source for source in sources if source.name == "finance").upstreams.extend(
            (*UPSTREAM_DOMAINS[:6], *UPSTREAM_DOMAINS[14:])
        )
    if variant == "duplicate-project":
        next(
            source for source in sources if source.name == "marketing"
        ).project_name = "growth"
    by_name = {source.name: source for source in sources}
    for source in sources:
        pending = collections.deque(source.upstreams)
        seen = {source.name}
        upstreams = []
        while pending:
            upstream = pending.popleft()
            if upstream in seen:
                continue
            seen.add(upstream)
            upstreams.append(upstream)
            pending.extend(by_name[upstream].upstreams)
        source.upstreams = upstreams

    files = {}

    def write(relative: str, contents: str) -> None:
        files[relative] = contents

    def add_model(
        source: Source, name: str, upstream: str = "", reference: str = ""
    ) -> None:
        if name in source.models:
            raise ValueError(f"Duplicate generated model in {source.name}: {name}")
        source.models.append(name)
        generated_schemas[source.name].append(model_schema(name))
        write(
            f"repos/{source.name}/models/generated/{name}.sql",
            model_sql(source.name, rng.randint(1, 99), upstream, reference),
        )

    generated_schemas = {source.name: [] for source in sources}
    for source in sources:
        base_repo = BASE / source.name
        if base_repo.is_dir():
            for path in sorted(base_repo.rglob("*")):
                if not path.is_file():
                    continue
                relative = path.relative_to(base_repo)
                if relative.name == "dbt_loom.config.yml":
                    continue
                contents = path.read_text(encoding="utf-8")
                if relative.name == "dbt_project.yml":
                    contents = contents.replace(
                        f"name: {source.name}\n", f"name: {source.project_name}\n", 1
                    )
                    contents = contents.replace(
                        f"  {source.name}:\n", f"  {source.project_name}:\n"
                    )
                    if source.name == "marketing" and variant == "empty-selector":
                        contents += (
                            "flags:\n  warn_error_options:\n"
                            "    error: [NoNodesForSelectionCriteria]\n"
                        )
                if path.suffix == ".sql":
                    model_name = (
                        "rate"
                        if source.name == "merchants"
                        and path.stem in ("rate_v1", "rate_v2")
                        else path.stem
                    )
                    if model_name not in source.models:
                        source.models.append(model_name)
                if (
                    source.name == "finance"
                    and relative.as_posix() == "models/merchant_settlement_report.sql"
                    and variant == "ambiguity"
                ):
                    contents = model_sql("finance", 0, "")
                write(f"repos/{source.name}/{relative.as_posix()}", contents)
        else:
            write(
                f"repos/{source.name}/dbt_project.yml",
                yaml_json(project_config(source)),
            )
            write(
                f"repos/{source.name}/lightdash.config.yml",
                yaml_json({"spotlight": {"default_visibility": "hide"}}),
            )
        write(
            f"repos/{source.name}/seeds/{source.name}_seed.csv",
            seed_rows(source.name, rng),
        )

    if scale == "full":
        by_name = {source.name: source for source in sources}
        for index in range(1, 158):
            for domain in ("payments", "merchants"):
                add_model(by_name[domain], f"shared_record_{index:03d}")
        for index in range(1, 20):
            for domain in ("finance", "risk"):
                add_model(by_name[domain], f"control_record_{index:03d}")
        add_model(by_name["growth"], "control_record_001")
        for source in sources:
            target = FULL_COUNTS.get(source.name, 25)
            number = 1
            while len(source.models) < target:
                upstream = (
                    UPSTREAM_DOMAINS[number - 1]
                    if source.name == "payments" and number <= 14
                    else ""
                )
                if source.name == "finance" and number <= 8:
                    upstream = (*UPSTREAM_DOMAINS[:6], *UPSTREAM_DOMAINS[14:])[
                        number - 1
                    ]
                reference = ""
                if source.name == "payments" and 15 <= number <= 284:
                    suffix = [", v=1", ", version=2", ""][number % 3]
                    reference = "ref('merchants', 'rate'" + suffix + ")"
                elif (
                    source.name in ("finance", "risk", "growth", "marketing")
                    and number <= 20
                    and not upstream
                ):
                    reference = "ref('merchants', 'merchant')"
                add_model(
                    source, f"{source.name}_model_{number:04d}", upstream, reference
                )
                number += 1

    if variant == "newcomer":
        add_model(
            next(source for source in sources if source.name == "marketing"), "ledger"
        )

    for source in sources:
        if generated_schemas[source.name]:
            schema = {"version": 2, "models": generated_schemas[source.name]}
            if not (BASE / source.name).is_dir():
                seed_schema = model_schema(f"{source.name}_seed")
                del seed_schema["access"]
                schema["seeds"] = [seed_schema]
            write(f"repos/{source.name}/models/generated/schema.yml", yaml_json(schema))
        if source.upstreams:
            manifests = []
            for upstream in source.upstreams:
                upstream_source = next(
                    item for item in sources if item.name == upstream
                )
                excluded = sorted(
                    {item.project_name for item in sources}
                    - {upstream_source.project_name}
                )
                manifests.append(
                    {
                        "name": upstream_source.project_name,
                        "type": "file",
                        "config": {
                            "path": str(out / "published" / upstream / "manifest.json")
                        },
                        "excluded_packages": excluded,
                    }
                )
            write(
                f"repos/{source.name}/dbt_loom.config.yml",
                yaml_json({"manifests": manifests}),
            )

    write("profiles/profiles.yml", (BASE / "profiles/profiles.yml").read_text())
    owners = collections.defaultdict(set)
    for source in sources:
        for model in source.models:
            owners[model].add(source.name)
    duplicated = sorted(name for name, domains in owners.items() if len(domains) > 1)
    by_name = {source.name: source for source in sources}
    counts = {source.name: len(source.models) for source in sources}
    largest = max(sources, key=lambda source: len(source.models))
    registry = {
        "scale": scale,
        "seed": seed,
        "variant": variant,
        "primarySource": "payments",
        "sources": [source.registry_entry() for source in sources],
        "stats": {
            "sourceCount": len(sources),
            "totalModels": sum(counts.values()),
            "totalModelNodes": sum(path.endswith(".sql") for path in files),
            "totalSeeds": len(sources),
            "distinctModelNames": len(owners),
            "duplicatedDistinctNames": len(duplicated),
            "duplicatedNames": duplicated,
            "paymentsMerchantsOverlaps": len(
                set(by_name["payments"].models) & set(by_name["merchants"].models)
            ),
            "largestSource": {"name": largest.name, "models": len(largest.models)},
            "modelCounts": counts,
        },
        "generatedFiles": sorted(files),
    }
    previous_path = out / "registry.json"
    previous_files = (
        json.loads(previous_path.read_text()).get("generatedFiles", [])
        if previous_path.exists()
        else []
    )
    for relative in sorted(set(previous_files) | set(files)):
        path = out / relative
        if not path.resolve().is_relative_to(out):
            raise ValueError(f"Generated path escapes the output directory: {relative}")
    for relative in set(previous_files) - set(files):
        path = out / relative
        if path.is_file():
            path.unlink()
    for relative, contents in files.items():
        path = out / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding="utf-8")
    previous_path.write_text(yaml_json(registry), encoding="utf-8")
    return registry


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic multi-repository dbt fixtures."
    )
    parser.add_argument("--scale", choices=SCALES, default="small")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--variant", choices=VARIANTS, default="baseline")
    args = parser.parse_args()
    out = args.out if args.out is not None else ROOT / ".work" / args.scale
    try:
        registry = generate(out, args.scale, args.seed, args.variant)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(
        json.dumps(
            {"out": str(out.resolve()), "stats": registry["stats"]}, sort_keys=True
        )
    )


if __name__ == "__main__":
    main()
