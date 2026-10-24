import collections
import csv
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "multi_repo_sim_generate", ROOT / "generate.py"
)
GENERATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = GENERATOR
SPEC.loader.exec_module(GENERATOR)
REF = re.compile(r"ref\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?")


def read_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text())


def model_names(repo: Path) -> set[str]:
    names = set()
    for path in (repo / "models").rglob("*.yml"):
        names.update(model["name"] for model in read_yaml(path).get("models", []))
    return names


class FixtureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(
            prefix="fixture-test-", dir=Path(__file__).parent
        )
        self.addCleanup(self.temporary.cleanup)
        self.out = Path(self.temporary.name) / "fixture"

    def generate(
        self, scale: str = "small", variant: str = "baseline", seed: int = 42
    ) -> dict:
        return GENERATOR.generate(self.out, scale, seed, variant)

    def test_small_sources_profiles_and_config_shapes(self) -> None:
        registry = self.generate()
        sources = {source["name"]: source for source in registry["sources"]}
        self.assertEqual(
            set(sources),
            {"payments", "merchants", "finance", "risk", "growth", "marketing"},
        )
        self.assertEqual(registry["primarySource"], "payments")
        self.assertEqual(registry["stats"]["sourceCount"], 6)
        self.assertEqual(registry["stats"]["totalModels"], 19)
        self.assertEqual(registry["stats"]["totalModelNodes"], 20)
        self.assertEqual(sources["growth"]["dbtVersion"], "1.9")
        self.assertFalse((self.out / "repos/growth/lightdash.config.yml").exists())
        self.assertEqual(
            set(read_yaml(self.out / "repos/marketing/lightdash.config.yml")),
            {"spotlight"},
        )
        self.assertEqual(
            set(read_yaml(self.out / "repos/payments/lightdash.config.yml")),
            {
                "spotlight",
                "parameters",
                "custom_granularities",
                "defaults",
                "table_groups",
            },
        )
        profile = read_yaml(self.out / "profiles/profiles.yml")["multi_repo_sim"][
            "outputs"
        ]["dev"]
        self.assertEqual(profile["schema"], "sim")
        for field, variable in [
            ("host", "PGHOST"),
            ("port", "PGPORT"),
            ("user", "PGUSER"),
            ("password", "PGPASSWORD"),
            ("dbname", "PGDATABASE"),
        ]:
            self.assertIn(f"env_var('{variable}')", profile[field])
        for source in sources.values():
            repo = self.out / "repos" / source["name"]
            config = read_yaml(repo / "dbt_project.yml")
            self.assertEqual(config["name"], source["projectName"])
            self.assertEqual(config["profile"], "multi_repo_sim")
            self.assertEqual(
                config["models"][source["projectName"]]["+schema"], source["name"]
            )
            self.assertEqual(
                config["seeds"][source["projectName"]]["+schema"], source["name"]
            )
            self.assertFalse((repo / "dependencies.yml").exists())
            self.assertFalse((repo / ".git").exists())

    def test_full_counts_match_files_and_distinct_owner_sets(self) -> None:
        registry = self.generate("full")
        owners = collections.defaultdict(set)
        total_nodes = 0
        for source in registry["sources"]:
            repo = self.out / "repos" / source["name"]
            declared = model_names(repo)
            self.assertEqual(set(source["models"]), declared)
            self.assertEqual(len(source["models"]), len(declared))
            total_nodes += len(list((repo / "models").rglob("*.sql")))
            for name in declared:
                owners[name].add(source["name"])
        duplicates = {name for name, domains in owners.items() if len(domains) > 1}
        overlaps = {
            name
            for name, domains in owners.items()
            if {"payments", "merchants"} <= domains
        }
        counts = {
            source["name"]: len(source["models"]) for source in registry["sources"]
        }
        self.assertEqual(len(registry["sources"]), 22)
        self.assertEqual(sum(counts.values()), 3000)
        self.assertEqual(total_nodes, 3001)
        self.assertEqual(max(counts.values()), 1300)
        self.assertEqual(counts["payments"], 1300)
        self.assertEqual(len(duplicates), 177)
        self.assertEqual(len(overlaps), 158)
        self.assertEqual(registry["stats"]["totalModelNodes"], total_nodes)
        self.assertEqual(registry["stats"]["totalModels"], sum(counts.values()))
        self.assertEqual(registry["stats"]["duplicatedNames"], sorted(duplicates))
        self.assertEqual(registry["stats"]["paymentsMerchantsOverlaps"], len(overlaps))
        self.assertEqual(registry["stats"]["modelCounts"], counts)

    def test_every_model_has_typed_columns_primary_key_and_amount_metric(self) -> None:
        self.generate("full")
        schemas = list((self.out / "repos").rglob("schema.yml"))
        self.assertGreater(len(schemas), 22)
        self.assertEqual(
            sum(len(read_yaml(path).get("seeds", [])) for path in schemas), 22
        )
        for path in schemas:
            schema = read_yaml(path)
            for model in schema.get("models", []) + schema.get("seeds", []):
                with self.subTest(
                    path=str(path.relative_to(self.out)), model=model["name"]
                ):
                    meta = model["config"]["meta"]
                    self.assertEqual(meta["primary_key"], "id")
                    self.assertEqual(
                        meta["metrics"]["total_amount"],
                        {"type": "sum", "sql": "${TABLE}.amount"},
                    )
                    columns = {column["name"]: column for column in model["columns"]}
                    for name, data_type, dimension in GENERATOR.COLUMNS:
                        self.assertEqual(columns[name]["data_type"], data_type)
                        self.assertEqual(
                            columns[name]["meta"]["dimension"]["type"], dimension
                        )

    def test_seed_rows_are_small_synthetic_and_have_unique_ids(self) -> None:
        registry = self.generate("full")
        for source in registry["sources"]:
            path = (
                self.out
                / "repos"
                / source["name"]
                / "seeds"
                / f"{source['name']}_seed.csv"
            )
            with path.open(newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual([row["id"] for row in rows], ["1", "2", "3"])
            for row in rows:
                self.assertRegex(row["label"], "^" + source["name"] + r"_sample_[123]$")
                self.assertGreater(int(row["amount"]), 0)
                self.assertIn(row["active"], ["true", "false"])

    def test_versioned_refs_and_cross_repo_join(self) -> None:
        self.generate()
        merchants = read_yaml(self.out / "repos/merchants/models/schema.yml")
        rate = next(model for model in merchants["models"] if model["name"] == "rate")
        self.assertEqual(rate["latest_version"], 2)
        self.assertEqual(rate["versions"], [{"v": 1}, {"v": 2}])
        for filename, reference in [
            ("rate_v1_usage", "ref('merchants', 'rate', v=1)"),
            ("rate_v2_usage", "ref('merchants', 'rate', version=2)"),
            ("rate_latest_usage", "ref('merchants', 'rate')"),
        ]:
            self.assertIn(
                reference,
                (self.out / "repos/payments/models" / f"{filename}.sql").read_text(),
            )
        payments = read_yaml(self.out / "repos/payments/models/schema.yml")
        model = next(
            model for model in payments["models"] if model["name"] == "payments"
        )
        self.assertEqual(
            model["config"]["meta"]["joins"],
            [
                {
                    "join": "merchant",
                    "sql_on": "${payments.merchant_id} = ${merchant.id}",
                    "relationship": "many-to-one",
                }
            ],
        )
        ledger = next(
            model for model in payments["models"] if model["name"] == "ledger"
        )
        self.assertEqual(
            ledger["config"]["meta"]["joins"],
            [
                {
                    "join": "merchant",
                    "sql_on": "${ledger.id} = ${merchant.id}",
                    "relationship": "one-to-one",
                }
            ],
        )

    def test_bootstrap_gates_cross_repo_refs_and_base_tags_only_mark_leaves(
        self,
    ) -> None:
        registry = self.generate("full")
        for source in registry["sources"]:
            leaves = []
            for path in (self.out / "repos" / source["name"] / "models").rglob("*.sql"):
                sql = path.read_text()
                references = REF.findall(sql)
                cross_refs = [
                    first
                    for first, second in references
                    if second or first in ("ledger", "settlement")
                ]
                if cross_refs:
                    self.assertIn("var('sim_bootstrap', false)", sql)
                    self.assertNotIn("sim_base", sql)
                    bootstrap_branch = sql.split("{% else %}", 1)[0]
                    self.assertNotIn("ref(", bootstrap_branch)
                elif "sim_base" in sql:
                    leaves.append(path)
                    self.assertEqual(references, [(f"{source['name']}_seed", "")])
            self.assertTrue(leaves, source["name"])

    def test_project_ring_has_no_model_dependency_cycle(self) -> None:
        registry = self.generate()
        sources = {source["name"]: source for source in registry["sources"]}
        self.assertIn("risk", sources["finance"]["upstreams"])
        self.assertIn("finance", sources["risk"]["upstreams"])
        graph = {}
        for domain in ("finance", "risk"):
            for path in (self.out / "repos" / domain / "models").glob("*.sql"):
                graph[(domain, path.stem)] = [
                    (first, second) if second else (domain, first)
                    for first, second in REF.findall(path.read_text())
                ]
        self.assertIn(("risk", "risk_base"), graph[("finance", "finance_report")])
        self.assertIn(("finance", "finance_base"), graph[("risk", "risk_report")])

        def visit(node: tuple, ancestors: set) -> None:
            self.assertNotIn(node, ancestors, str(node))
            for dependency in graph.get(node, []):
                visit(dependency, ancestors | {node})

        for node in graph:
            visit(node, set())

    def test_loom_paths_and_package_exclusions(self) -> None:
        registry = self.generate("full")
        by_name = {source["name"]: source for source in registry["sources"]}
        self.assertEqual(len(by_name["payments"]["upstreams"]), 15)
        for source, fan_in in (("payments", 15), ("finance", 10)):
            direct = {
                package
                for path in (self.out / "repos" / source / "models").rglob("*.sql")
                for package, model in REF.findall(path.read_text())
                if model
            }
            self.assertEqual(len(direct), fan_in)
        for source in registry["sources"]:
            path = self.out / "repos" / source["name"] / "dbt_loom.config.yml"
            if not source["upstreams"]:
                self.assertFalse(path.exists())
                continue
            config = read_yaml(path)
            self.assertEqual(
                [entry["name"] for entry in config["manifests"]], source["upstreams"]
            )
            for entry in config["manifests"]:
                self.assertEqual(entry["type"], "file")
                self.assertEqual(
                    Path(entry["config"]["path"]),
                    self.out / "published" / entry["name"] / "manifest.json",
                )
                self.assertNotIn(entry["name"], entry["excluded_packages"])
                self.assertIn(source["projectName"], entry["excluded_packages"])
        growth = read_yaml(self.out / "repos/growth/dbt_loom.config.yml")
        self.assertIn("merchants", growth["manifests"][0]["excluded_packages"])
        self.assertEqual(len(by_name["risk"]["upstreams"]), 10)
        self.assertEqual(
            set(by_name["growth"]["upstreams"]),
            {"payments", "merchants"} | set(GENERATOR.UPSTREAM_DOMAINS[:14]),
        )
        for source in registry["sources"]:
            available = {source["name"], *source["upstreams"]}
            for upstream in source["upstreams"]:
                for path in (self.out / "repos" / upstream / "models").rglob("*.sql"):
                    for package, model in REF.findall(path.read_text()):
                        if model:
                            self.assertIn(
                                package,
                                available,
                                f"{source['name']} needs {package} for {upstream}.{path.stem}",
                            )

    def test_variants_change_the_required_cases(self) -> None:
        baseline = self.generate()
        finance_path = self.out / "repos/finance/models/settlement_report.sql"
        explicit_path = self.out / "repos/finance/models/merchant_settlement_report.sql"
        self.assertIn("ref('settlement')", finance_path.read_text())
        self.assertIn("ref('merchants', 'settlement')", explicit_path.read_text())
        self.generate(variant="ambiguity")
        self.assertIn("ref('settlement')", finance_path.read_text())
        self.assertNotIn("ref('merchants', 'settlement')", explicit_path.read_text())
        finance_sql = "\n".join(
            path.read_text()
            for path in (self.out / "repos/finance/models").rglob("*.sql")
        )
        self.assertNotIn("ref('merchants', 'settlement')", finance_sql)
        duplicate = self.generate(variant="duplicate-project")
        projects = [source["projectName"] for source in duplicate["sources"]]
        self.assertEqual(projects.count("growth"), 2)
        marketing = read_yaml(self.out / "repos/marketing/dbt_project.yml")
        self.assertEqual(marketing["name"], "growth")
        self.assertEqual(marketing["models"]["growth"]["+schema"], "marketing")
        self.generate(variant="empty-selector")
        marketing = read_yaml(self.out / "repos/marketing/dbt_project.yml")
        self.assertEqual(
            marketing["flags"]["warn_error_options"]["error"],
            ["NoNodesForSelectionCriteria"],
        )
        newcomer = self.generate(variant="newcomer")
        self.assertEqual(
            newcomer["stats"]["totalModels"], baseline["stats"]["totalModels"] + 1
        )
        marketing = next(
            source for source in newcomer["sources"] if source["name"] == "marketing"
        )
        self.assertIn("ledger", marketing["models"])
        self.assertTrue(
            (self.out / "repos/marketing/models/generated/ledger.sql").exists()
        )
        self.generate()
        self.assertFalse(
            (self.out / "repos/marketing/models/generated/ledger.sql").exists()
        )
        self.assertFalse(
            (self.out / "repos/marketing/models/generated/schema.yml").exists()
        )

    def test_generation_is_deterministic_and_preserves_runner_files(self) -> None:
        self.generate()
        original = {
            path.relative_to(self.out): path.read_bytes()
            for path in self.out.rglob("*")
            if path.is_file()
        }
        self.generate()
        repeated = {
            path.relative_to(self.out): path.read_bytes()
            for path in self.out.rglob("*")
            if path.is_file()
        }
        self.assertEqual(original, repeated)
        for relative in [
            "repos/payments/.git/HEAD",
            "repos/payments/target/manifest.json",
            "published/payments/manifest.json",
        ]:
            path = self.out / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("runner-owned\n")
        self.generate(seed=43)
        self.assertNotEqual(
            original[Path("repos/payments/seeds/payments_seed.csv")],
            (self.out / "repos/payments/seeds/payments_seed.csv").read_bytes(),
        )
        for relative in [
            "repos/payments/.git/HEAD",
            "repos/payments/target/manifest.json",
            "published/payments/manifest.json",
        ]:
            self.assertEqual((self.out / relative).read_text(), "runner-owned\n")

    def test_output_cannot_overwrite_fixture_sources(self) -> None:
        for path in (ROOT, ROOT.parent, ROOT / "base", ROOT / "base/payments"):
            with self.assertRaisesRegex(ValueError, "separate generated fixture"):
                GENERATOR.generate(path, "small", 42)

    def test_cli_writes_the_public_registry_contract(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "generate.py"),
                "--scale",
                "small",
                "--seed",
                "42",
                "--variant",
                "baseline",
                "--out",
                str(self.out),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        registry = json.loads((self.out / "registry.json").read_text())
        self.assertEqual(json.loads(result.stdout)["stats"], registry["stats"])
        for source in registry["sources"]:
            self.assertEqual(
                set(source),
                {"name", "projectName", "dbtVersion", "models", "upstreams"},
            )
            self.assertTrue(
                (self.out / "repos" / source["name"] / "dbt_project.yml").exists()
            )


DBT = os.environ.get("DBT_SIM_TEST_DBT")
DBT19 = os.environ.get("DBT_SIM_TEST_DBT19")


class BootstrapParseTests(unittest.TestCase):
    def parse_sources(
        self, names: list[str], executable: str, scale: str = "small"
    ) -> None:
        with tempfile.TemporaryDirectory(
            prefix="dbt-test-", dir=Path(__file__).parent
        ) as directory:
            out = Path(directory) / "fixture"
            registry = GENERATOR.generate(out, scale, 42)
            by_name = {source["name"]: source for source in registry["sources"]}
            env = dict(
                os.environ,
                PGHOST="127.0.0.1",
                PGPORT="1",
                PGUSER="sim",
                PGPASSWORD="sim",
                PGDATABASE="sim",
                DBT_SEND_ANONYMOUS_USAGE_STATS="false",
            )
            env.pop("DBT_LOOM_CONFIG", None)
            for name in names:
                with self.subTest(source=name):
                    repo = out / "repos" / name
                    loom = repo / "dbt_loom.config.yml"
                    saved_loom = repo / "dbt_loom.config.yml.disabled"
                    if loom.exists():
                        loom.rename(saved_loom)
                    try:
                        result = subprocess.run(
                            [
                                executable,
                                "--no-use-colors",
                                "--no-partial-parse",
                                "--no-send-anonymous-usage-stats",
                                "parse",
                                "--project-dir",
                                str(repo),
                                "--profiles-dir",
                                str(out / "profiles"),
                                "--profile",
                                "multi_repo_sim",
                                "--target",
                                "dev",
                                "--target-path",
                                "target",
                                "--vars",
                                "{sim_bootstrap: true}",
                            ],
                            cwd=repo,
                            env=env,
                            capture_output=True,
                            text=True,
                            timeout=90,
                            check=False,
                        )
                        self.assertEqual(
                            result.returncode, 0, result.stdout + result.stderr
                        )
                    finally:
                        if saved_loom.exists():
                            saved_loom.rename(loom)
                    manifest = json.loads((repo / "target/manifest.json").read_text())
                    models = [
                        node
                        for node in manifest["nodes"].values()
                        if node["resource_type"] == "model"
                        and node["package_name"] == name
                    ]
                    self.assertEqual(
                        {node["name"] for node in models}, set(by_name[name]["models"])
                    )
                    for node in models:
                        self.assertEqual(node["schema"], f"sim_{name}")
                        self.assertTrue(
                            all(
                                dependency.startswith(f"seed.{name}.")
                                for dependency in node["depends_on"]["nodes"]
                            )
                        )
                        self.assertEqual(node["config"]["meta"]["primary_key"], "id")
                        self.assertIn("total_amount", node["config"]["meta"]["metrics"])
                    seed = manifest["nodes"][f"seed.{name}.{name}_seed"]
                    self.assertEqual(seed["config"]["meta"]["primary_key"], "id")
                    self.assertIn("total_amount", seed["config"]["meta"]["metrics"])
                    if name == "merchants":
                        self.assertEqual(
                            {
                                node["version"]
                                for node in models
                                if node["name"] == "rate"
                            },
                            {1, 2},
                        )

    @unittest.skipUnless(DBT, "Set DBT_SIM_TEST_DBT to opt into real dbt parsing")
    def test_current_dbt_bootstrap_parse(self) -> None:
        self.parse_sources(
            ["payments", "merchants", "finance", "risk", "growth", "marketing"], DBT
        )

    @unittest.skipUnless(DBT, "Set DBT_SIM_TEST_DBT to opt into real dbt parsing")
    def test_full_generated_bootstrap_parse(self) -> None:
        self.parse_sources(["payments", "accounts"], DBT, "full")

    @unittest.skipUnless(DBT19, "Set DBT_SIM_TEST_DBT19 to opt into real dbt parsing")
    def test_growth_dbt19_bootstrap_parse(self) -> None:
        self.parse_sources(["growth"], DBT19)


@unittest.skipUnless(
    os.environ.get("DBT_SIM_TEST_LOOM") == "1" and DBT and DBT19,
    "Set DBT_SIM_TEST_LOOM=1 and both dbt executables with dbt-loom installed",
)
class LoomParseTests(unittest.TestCase):
    def test_normal_parse_resolves_versions_ring_and_one_argument_refs(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix="loom-test-", dir=Path(__file__).parent
        ) as directory:
            out = Path(directory) / "fixture"
            registry = GENERATOR.generate(out, "small", 42)
            env = dict(
                os.environ,
                PGHOST="127.0.0.1",
                PGPORT="1",
                PGUSER="sim",
                PGPASSWORD="sim",
                PGDATABASE="sim",
                DBT_SEND_ANONYMOUS_USAGE_STATS="false",
            )
            env.pop("DBT_LOOM_CONFIG", None)
            manifests = {}
            for bootstrap in (True, False):
                for source in registry["sources"]:
                    name = source["name"]
                    with self.subTest(bootstrap=bootstrap, source=name):
                        repo = out / "repos" / name
                        loom = repo / "dbt_loom.config.yml"
                        saved_loom = repo / "dbt_loom.config.yml.disabled"
                        if bootstrap and loom.exists():
                            loom.rename(saved_loom)
                        try:
                            result = subprocess.run(
                                [
                                    DBT19
                                    if source["dbtVersion"].startswith("1.9")
                                    else DBT,
                                    "--no-use-colors",
                                    "--no-partial-parse",
                                    "--no-send-anonymous-usage-stats",
                                    "parse",
                                    "--project-dir",
                                    str(repo),
                                    "--profiles-dir",
                                    str(out / "profiles"),
                                    "--profile",
                                    "multi_repo_sim",
                                    "--target",
                                    "dev",
                                    "--target-path",
                                    "target",
                                    "--vars",
                                    json.dumps({"sim_bootstrap": bootstrap}),
                                ],
                                cwd=repo,
                                env=env,
                                capture_output=True,
                                text=True,
                                timeout=90,
                                check=False,
                            )
                            self.assertEqual(
                                result.returncode, 0, result.stdout + result.stderr
                            )
                        finally:
                            if saved_loom.exists():
                                saved_loom.rename(loom)
                        published = out / "published" / name / "manifest.json"
                        published.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(repo / "target/manifest.json", published)
                        manifests[name] = json.loads(published.read_text())
            expected = {
                ("payments", "payments"): {
                    "seed.payments.payments_seed",
                    "model.merchants.merchant",
                },
                ("payments", "rate_v1_usage"): {"model.merchants.rate.v1"},
                ("payments", "rate_v2_usage"): {"model.merchants.rate.v2"},
                ("payments", "rate_latest_usage"): {"model.merchants.rate.v2"},
                ("finance", "settlement_report"): {"model.merchants.settlement"},
                ("finance", "merchant_settlement_report"): {
                    "model.merchants.settlement"
                },
                ("finance", "finance_report"): {
                    "model.finance.finance_base",
                    "model.risk.risk_base",
                },
                ("risk", "risk_report"): {
                    "model.risk.risk_base",
                    "model.finance.finance_base",
                },
                ("growth", "growth_report"): {
                    "model.growth.growth_base",
                    "model.payments.ledger",
                },
                ("marketing", "campaign"): {
                    "model.marketing.marketing_base",
                    "model.merchants.merchant",
                },
            }
            for (domain, model), dependencies in expected.items():
                node = manifests[domain]["nodes"][f"model.{domain}.{model}"]
                self.assertEqual(set(node["depends_on"]["nodes"]), dependencies)


if __name__ == "__main__":
    unittest.main()
