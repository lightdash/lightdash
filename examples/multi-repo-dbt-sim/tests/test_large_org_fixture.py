import collections
import csv
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location(
    "large_org_fixture", ROOT / "large_org_fixture.py"
)
FIXTURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FIXTURE)
REF = re.compile(r"ref\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?(?:\s*,\s*v=(\d+))?")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


class LargeOrgFixtureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="large-org-fixture-test-")
        self.addCleanup(self.temporary.cleanup)
        self.out = Path(self.temporary.name) / "fixture"

    def generate(self, variant: str = "mixed", seed: int = 42) -> dict:
        return FIXTURE.generate(self.out, variant, seed)

    def sql(self, source: str, model: str) -> str:
        return (self.out / "repos" / source / "models" / f"{model}.sql").read_text()

    def test_source_contract_metadata_profiles_and_synthetic_seeds(self) -> None:
        registry = self.generate()
        self.assertEqual(
            registry["scenario"]["name"], "large-org multi-source scenario"
        )
        self.assertEqual(registry["primarySource"], "proj_core")
        self.assertEqual(
            [source["name"] for source in registry["sources"]],
            list(FIXTURE.SOURCE_NAMES),
        )
        self.assertEqual(registry["stats"]["sourceCount"], 19)
        self.assertEqual(
            [item["item"] for item in registry["scenario"]["configuredItems"]],
            list(range(1, 10)),
        )
        self.assertEqual(
            registry["stats"]["duplicatedNames"],
            ["cycle_extension", "model_shared", "ring_report"],
        )
        profiles = (FIXTURE.BASE / "profiles/profiles.yml").read_text()
        self.assertEqual((self.out / "profiles/profiles.yml").read_text(), profiles)
        for source in registry["sources"]:
            name = source["name"]
            repo = self.out / "repos" / name
            project = read_json(repo / "dbt_project.yml")
            self.assertEqual(project["name"], source["projectName"])
            self.assertEqual(project["profile"], "multi_repo_sim")
            self.assertEqual(project["models"][name]["+schema"], name)
            self.assertEqual((repo / "profiles.yml").read_text(), profiles)
            self.assertEqual(
                list(repo.rglob("dbt_project.yml")), [repo / "dbt_project.yml"]
            )
            self.assertFalse((repo / ".git").exists())
            self.assertIn("target/", (repo / ".gitignore").read_text())
            self.assertIn("logs/", (repo / ".gitignore").read_text())
            schema = read_json(repo / "models/schema.yml")
            self.assertEqual(
                sorted(model["name"] for model in schema["models"]), source["models"]
            )
            for model in schema["models"] + schema["seeds"]:
                expected = FIXTURE.model_schema(model["name"])
                self.assertEqual(model["config"], expected["config"])
                self.assertEqual(model["columns"], expected["columns"])
            with (repo / "seeds" / f"{name}_seed.csv").open(newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual([row["id"] for row in rows], ["1", "2", "3"])
            self.assertEqual(
                [row["label"] for row in rows],
                [f"{name}_sample_{index}" for index in range(1, 4)],
            )

    def test_all_variants_keep_the_union_of_model_files_and_schema_ids(self) -> None:
        schemas = None
        filenames = None
        model_counts = None
        for variant in FIXTURE.VARIANTS:
            with self.subTest(variant=variant):
                registry = self.generate(variant)
                current_schemas = {
                    path.relative_to(self.out): path.read_bytes()
                    for path in (self.out / "repos").rglob("schema.yml")
                }
                current_filenames = {
                    path.relative_to(self.out)
                    for path in (self.out / "repos").rglob("*.sql")
                }
                if schemas is None:
                    schemas = current_schemas
                    filenames = current_filenames
                    model_counts = registry["stats"]["modelCounts"]
                self.assertEqual(current_schemas, schemas)
                self.assertEqual(current_filenames, filenames)
                self.assertEqual(registry["stats"]["modelCounts"], model_counts)
                self.assertEqual(len(registry["sources"]), 19)
                for source in registry["sources"]:
                    for path in (self.out / "repos" / source["name"] / "models").glob(
                        "*.sql"
                    ):
                        sql = path.read_text()
                        refs = REF.findall(sql)
                        if any(
                            second
                            or first in ("model_shared", "staging_x", "curated_x")
                            for first, second, _ in refs
                        ):
                            self.assertIn("var('sim_bootstrap', false)", sql)
                            self.assertNotIn("ref(", sql.split("{% else %}")[0])
                        else:
                            self.assertEqual(refs, [(f"{source['name']}_seed", "", "")])
                self.assertEqual(registry, read_json(self.out / "registry.json"))

    def test_consumer_reference_arity_is_across_separate_models(self) -> None:
        for variant in ("mixed", "combined"):
            registry = self.generate(variant)
            self.assertEqual(
                [
                    (ref["model"], ref["ref"])
                    for ref in registry["scenario"]["consumerRefs"]
                ],
                [
                    ("proj_growth.consumer_1", ["model_shared"]),
                    ("proj_growth.consumer_2", ["analyst_hub", "model_shared"]),
                    ("proj_growth.consumer_3", ["proj_core", "model_other"]),
                ],
            )
            for model in ("consumer_1", "consumer_2", "consumer_3"):
                self.assertEqual(len(REF.findall(self.sql("proj_growth", model))), 1)
        registry = self.generate("one-arg")
        self.assertEqual(
            [ref["ref"] for ref in registry["scenario"]["consumerRefs"]],
            [["model_shared"], ["proj_core", "model_other"]],
        )
        self.assertNotIn("model_shared", self.sql("proj_growth", "consumer_2"))
        self.assertEqual(
            registry["scenario"]["consumerRefs"][0]["providerProject"], "analyst_hub"
        )
        registry = self.generate("healthy")
        self.assertTrue(
            all(
                ref["refArgumentCount"] == 2
                for ref in registry["scenario"]["consumerRefs"]
            )
        )
        self.assertEqual(registry["scenario"]["publicationFilters"], [])

    def test_closed_cycles_match_real_sql_and_versioned_model_schema(self) -> None:
        for variant, projects, length in (
            ("cycle", 3, 5),
            ("cycle-nine", 9, 11),
            ("combined", 9, 11),
        ):
            registry = self.generate(variant)
            cycle = registry["scenario"]["cycle"]
            self.assertEqual(cycle["projectCount"], projects)
            self.assertEqual(cycle["edgeCount"], length)
            self.assertEqual(cycle["modelCount"], length)
            self.assertEqual(cycle["closedPath"][0], cycle["closedPath"][-1])
            for edge in cycle["edges"]:
                source, model = edge["from"].split(".")
                filename = "transactions_x_v3" if model == "transactions_x" else model
                args = REF.findall(self.sql(source, filename))
                expected = edge["ref"]
                self.assertEqual(
                    args,
                    [
                        (
                            expected[0],
                            expected[1] if len(expected) == 2 else "",
                            str(edge["version"]) if edge["version"] else "",
                        )
                    ],
                )
            schema = read_json(self.out / "repos/proj_b/models/schema.yml")
            model = next(
                model for model in schema["models"] if model["name"] == "transactions_x"
            )
            self.assertEqual(model["latest_version"], 3)
            self.assertEqual(model["versions"], [{"v": 3}])
            self.assertIn("model.proj_b.transactions_x.v3", cycle["closedUniqueIds"])
            self.assertIn(
                "ref('proj_b', 'transactions_x', v=3)", self.sql("proj_a", "staging_x")
            )
            saved = registry["scenario"]["savedCycle"]
            self.assertEqual(saved["closedPath"], list(FIXTURE.SAVED_CYCLE_PATH))
            self.assertEqual(saved["refArgumentCounts"], {"one": 2, "two": 3})
            self.assertIn(
                "Invented extension",
                registry["scenario"]["syntheticNineCycle"]["evidence"],
            )
        self.generate("healthy")
        for model in FIXTURE.NINE_CYCLE_PATH[:-1]:
            source, name = model.split(".")
            sql = self.sql(
                source, "transactions_x_v3" if name == "transactions_x" else name
            )
            self.assertNotIn("{% else %}", sql)

    def test_legal_ring_is_model_acyclic_even_with_a_closed_project_ring(self) -> None:
        registry = self.generate("healthy")
        edges = registry["scenario"]["legalRing"]["edges"]
        self.assertEqual(len(edges), 9)
        self.assertFalse(registry["scenario"]["legalRing"]["modelCycle"])
        self.assertEqual(
            {edge["from"].split(".")[0] for edge in edges}, set(FIXTURE.RING_PROJECTS)
        )
        self.assertEqual(
            {edge["to"].split(".")[0] for edge in edges}, set(FIXTURE.RING_PROJECTS)
        )
        graph = collections.defaultdict(list)
        for reference in registry["scenario"]["refs"]:
            graph[reference["model"]].append(
                f"{reference['providerProject']}.{reference['providerModel']}"
            )

        def visit(node: str, ancestors: set[str]) -> None:
            self.assertNotIn(node, ancestors)
            for dependency in graph.get(node, []):
                visit(dependency, ancestors | {node})

        for node in list(graph):
            visit(node, set())

    def test_loom_imports_are_direct_absolute_and_request_only_the_needed_filter(
        self,
    ) -> None:
        registry = self.generate()
        for source in registry["sources"]:
            imports = registry["scenario"]["loomImports"][source["name"]]
            self.assertEqual([item["name"] for item in imports], source["upstreams"])
            self.assertNotIn(source["name"], source["upstreams"])
            path = self.out / "repos" / source["name"] / "dbt_loom.config.yml"
            if not imports:
                self.assertFalse(path.exists())
                continue
            self.assertEqual(read_json(path), {"manifests": imports})
            for item in imports:
                self.assertEqual(item["type"], "file")
                self.assertTrue(
                    Path(item["config"]["path"]).is_relative_to(self.out / "published")
                )
                self.assertEqual(
                    set(item["excluded_packages"]),
                    set(FIXTURE.SOURCE_NAMES) - {item["name"]},
                )
        requests = registry["scenario"]["publicationFilters"]
        self.assertEqual(len(requests), 1)
        self.assertEqual(
            requests[0]["excludedUniqueIds"], ["model.proj_core.model_shared"]
        )
        expected = self.out / "published/filtered/proj_growth/proj_core/manifest.json"
        self.assertEqual(requests[0]["outputPath"], str(expected))
        core = next(
            item
            for item in registry["scenario"]["loomImports"]["proj_growth"]
            if item["name"] == "proj_core"
        )
        self.assertEqual(core["config"]["path"], str(expected))
        self.assertEqual(
            {
                item["name"]
                for item in registry["scenario"]["loomImports"]["proj_growth"]
            },
            {"proj_core", "analyst_hub"},
        )
        self.assertFalse(expected.exists())

    def test_isolated_blockers_and_combined_metadata(self) -> None:
        for variant, expected in (
            ("healthy", []),
            ("missing-project", ["proj_unconnected"]),
            ("missing-shared", ["shared_dims"]),
            ("combined", ["proj_unconnected", "shared_dims"]),
        ):
            registry = self.generate(variant)
            self.assertEqual(
                registry["scenario"]["missingNotConnectedProjects"], expected
            )
            for source in registry["sources"]:
                self.assertTrue(
                    set(source["upstreams"]).isdisjoint(FIXTURE.MISSING_PROJECTS)
                )
            self.assertTrue(
                {source["name"] for source in registry["sources"]}.isdisjoint(
                    FIXTURE.MISSING_PROJECTS
                )
            )
        for variant in FIXTURE.VARIANTS:
            registry = self.generate(variant)
            sources = {source["name"]: source for source in registry["sources"]}
            duplicate = variant in ("duplicate-project", "combined")
            self.assertEqual(
                sources["proj_core_copy"]["repoName"],
                "proj_core" if duplicate else "proj_core_copy",
            )
            self.assertEqual(sources["proj_core_copy"]["projectName"], "proj_core_copy")
            self.assertEqual(sources["proj_bank"]["projectName"], "proj_bank")
            self.assertEqual(
                sources["proj_bank_reporting"]["projectName"], "proj_bank_reporting"
            )
            selector = (
                "tag:reference_only"
                if variant in ("empty-selector", "combined")
                else None
            )
            self.assertEqual(sources["proj_l"]["selector"], selector)
            self.assertEqual(registry["scenario"]["selector"]["value"], selector)
            self.assertEqual(
                registry["scenario"]["unreadableSources"],
                ["proj_m"] if variant in ("unreadable", "combined") else [],
            )
            self.assertNotIn(
                "reference_only",
                "".join(
                    path.read_text() for path in (self.out / "repos").rglob("*.sql")
                ),
            )
        registry = self.generate("combined")
        self.assertTrue(
            all(item["enabled"] for item in registry["scenario"]["configuredItems"])
        )

    def test_deterministic_generation_preserves_runtime_files(self) -> None:
        self.generate()
        first = {
            path.relative_to(self.out): path.read_bytes()
            for path in self.out.rglob("*")
            if path.is_file()
        }
        self.generate()
        self.assertEqual(
            first,
            {
                path.relative_to(self.out): path.read_bytes()
                for path in self.out.rglob("*")
                if path.is_file()
            },
        )
        runtime = [
            "repos/proj_core/.git/HEAD",
            "repos/proj_core/target/manifest.json",
            "repos/proj_core/logs/dbt.log",
            "published/proj_core/manifest.json",
            "published/filtered/proj_growth/proj_core/manifest.json",
            "runner-output.json",
        ]
        for relative in runtime:
            path = self.out / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("runtime-owned\n")
        self.generate("combined", seed=43)
        for relative in runtime:
            self.assertEqual((self.out / relative).read_text(), "runtime-owned\n")
        self.assertNotEqual(
            first[Path("repos/proj_core/seeds/proj_core_seed.csv")],
            (self.out / "repos/proj_core/seeds/proj_core_seed.csv").read_bytes(),
        )

    def test_configured_item_numbers_match_the_requested_cases(self) -> None:
        for variant in FIXTURE.VARIANTS:
            registry = self.generate(variant)
            items = {
                item["item"]: item for item in registry["scenario"]["configuredItems"]
            }
            self.assertEqual(items[1]["sources"], list(FIXTURE.SOURCE_NAMES))
            self.assertEqual(
                items[2]["enabled"], variant in ("cycle", "cycle-nine", "combined")
            )
            self.assertEqual(items[3]["project"], "proj_unconnected")
            self.assertEqual(items[4]["project"], "shared_dims")
            self.assertTrue(items[5]["enabled"])
            self.assertEqual(
                items[5]["one_arg_enabled"], variant in ("mixed", "one-arg", "combined")
            )
            self.assertEqual(
                items[5]["mixed_binding_enabled"], variant in ("mixed", "combined")
            )
            self.assertEqual(
                items[6]["duplicate_case"], variant in ("duplicate-project", "combined")
            )
            self.assertEqual(items[6]["projects"], ["proj_bank", "proj_bank_reporting"])
            self.assertEqual(
                items[7]["enabled"], variant in ("empty-selector", "combined")
            )
            self.assertEqual(items[8]["enabled"], variant in ("unreadable", "combined"))
            self.assertEqual(items[9]["diskBudgetBytes"], 3221225472)
            self.assertEqual(items[9]["concurrency"], 4)
            self.assertEqual(items[9]["defaultDerivedConcurrency"], 11)

    def test_output_guards_and_symlinks_fail_before_writes(self) -> None:
        for path in (
            FIXTURE.CHECKOUT,
            FIXTURE.CHECKOUT.parent,
            FIXTURE.ROOT,
            FIXTURE.BASE,
            FIXTURE.BASE / "large_org",
        ):
            with self.assertRaisesRegex(ValueError, "separate generated fixture"):
                FIXTURE.generate(path)
        with self.assertRaisesRegex(ValueError, "Unknown"):
            self.generate("unknown")
        outside = Path(self.temporary.name) / "outside"
        outside.mkdir()
        (self.out / "repos").mkdir(parents=True)
        (self.out / "repos/proj_core").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "escapes"):
            self.generate()
        self.assertEqual(list(outside.iterdir()), [])

    def test_registry_symlink_cannot_overwrite_a_runtime_file(self) -> None:
        self.out.mkdir()
        outside = Path(self.temporary.name) / "runtime.json"
        outside.write_text("runtime-owned\n")
        (self.out / "registry.json").symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "escapes"):
            self.generate()
        self.assertEqual(outside.read_text(), "runtime-owned\n")
        self.assertFalse((self.out / "repos").exists())


if __name__ == "__main__":
    unittest.main()
