import copy
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import large_org
import large_org_fixture
import prod_shaped_fixture as fixture
from prod_shaped_assertions import CYCLE_PREFIX, CYCLE_SUFFIX, GUIDANCE, evaluate
from tooling import command

REF = re.compile(r"ref\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?(?:\s*,\s*v=(\d+))?")
WORK = ROOT / ".work/large-org/prod-shaped"


class ProdShapedFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="prod-shaped-test-")
        self.addCleanup(self.temporary.cleanup)
        self.out = Path(self.temporary.name) / "fixture"

    def test_default_matrix_stays_eleven_variants_and_49_models(self):
        self.assertEqual(len(large_org_fixture.VARIANTS), 11)
        self.assertTrue(set(fixture.VARIANTS).isdisjoint(large_org_fixture.VARIANTS))
        for variant in large_org_fixture.VARIANTS:
            registry = large_org_fixture.generate(self.out, variant)
            self.assertEqual(registry["stats"]["totalModels"], 49)

    def test_closed_fourteen_model_loop_has_three_source_ring_and_four_versions(self):
        registry = fixture.generate(self.out)
        cycle = registry["scenario"]["cycle"]
        path = cycle["closedPath"]
        self.assertEqual(path[0], path[-1])
        self.assertEqual(len(set(path)), 14)
        self.assertEqual(
            (cycle["modelCount"], cycle["edgeCount"], cycle["projectCount"]),
            (14, 14, 3),
        )
        transitions = [
            edge
            for edge in cycle["edges"]
            if edge["from"].split(".")[0] != edge["to"].split(".")[0]
        ]
        self.assertEqual(
            [
                (edge["from"].split(".")[0], edge["to"].split(".")[0])
                for edge in transitions
            ],
            [
                ("proj_bank", "proj_payments"),
                ("proj_payments", "proj_analyst"),
                ("proj_analyst", "proj_bank"),
            ],
        )
        self.assertEqual(
            sum(node.endswith(".v3") for node in cycle["closedUniqueIds"][:-1]), 4
        )
        self.assertEqual(len(registry["sources"]), 19)
        for edge in cycle["edges"]:
            source, name = edge["from"].split(".")
            filename = name + (
                "_v3" if edge["from"] in fixture.VERSIONED_MODELS else ""
            )
            sql = (
                self.out / "repos" / source / "models" / f"{filename}.sql"
            ).read_text()
            expected = edge["ref"]
            self.assertEqual(
                REF.findall(sql),
                [
                    (
                        expected[0],
                        expected[1] if len(expected) == 2 else "",
                        str(edge["version"]) if edge["version"] else "",
                    )
                ],
            )
            self.assertNotIn("ref(", sql.split("{% else %}")[0])

    def test_schemas_and_filenames_have_stable_41_model_union(self):
        union = None
        for variant in fixture.VARIANTS:
            registry = fixture.generate(self.out, variant)
            current = {
                str(path.relative_to(self.out)): path.read_text()
                if path.name == "schema.yml"
                else None
                for path in (self.out / "repos").rglob("*")
                if path.suffix == ".sql" or path.name == "schema.yml"
            }
            if union is None:
                union = current
            self.assertEqual(current, union)
            self.assertEqual(registry["stats"]["totalModels"], 41)
            versions = []
            for source in registry["sources"]:
                schema = json.loads(
                    (
                        self.out / "repos" / source["name"] / "models/schema.yml"
                    ).read_text()
                )
                for model in schema["models"]:
                    name = f"{source['name']}.{model['name']}"
                    if name in fixture.VERSIONED_MODELS:
                        self.assertEqual(model["latest_version"], 3)
                        self.assertEqual(model["versions"], [{"v": 3}])
                        versions.append(name)
                    else:
                        self.assertNotIn("versions", model)
                        self.assertNotIn("latest_version", model)
            self.assertEqual(set(versions), set(fixture.VERSIONED_MODELS))
            for decoy in fixture.DECOYS:
                source, name = decoy.split(".")
                self.assertTrue(
                    (self.out / "repos" / source / "models" / f"{name}.sql").is_file()
                )
                self.assertEqual(fixture.unique_id(decoy), f"model.{decoy}")

    def test_mixed_refs_are_separate_and_no_cycle_can_mask_staleness(self):
        registry = fixture.generate(self.out, "prod-mixed")
        self.assertIsNone(registry["scenario"]["cycle"])
        refs = registry["scenario"]["refs"]
        self.assertEqual(
            [(ref["model"], ref["ref"]) for ref in refs],
            [
                ("proj_growth.consumer_one_arg", [fixture.DUPLICATE]),
                ("proj_growth.consumer_explicit", ["proj_analyst", fixture.DUPLICATE]),
                ("proj_growth.consumer_primary", ["proj_bank", "model_other"]),
            ],
        )
        for ref in refs:
            source, model = ref["model"].split(".")
            sql = (self.out / "repos" / source / "models" / f"{model}.sql").read_text()
            self.assertEqual(len(REF.findall(sql)), 1)
            self.assertNotEqual(ref["providerProject"], "proj_growth")
        providers = [
            source["name"]
            for source in registry["sources"]
            if fixture.DUPLICATE in source["models"]
        ]
        self.assertEqual(providers, ["proj_bank", "proj_analyst"])
        filters = registry["scenario"]["publicationFilters"]
        self.assertEqual(len(filters), 1)
        self.assertEqual(
            filters[0]["excludedUniqueIds"], [f"model.proj_bank.{fixture.DUPLICATE}"]
        )
        self.assertNotIn("model.proj_bank.model_other", filters[0]["excludedUniqueIds"])
        imports = registry["scenario"]["loomImports"]["proj_growth"]
        self.assertEqual(
            {item["name"] for item in imports}, {"proj_bank", "proj_analyst"}
        )
        self.assertEqual(
            next(item for item in imports if item["name"] == "proj_bank")["config"][
                "path"
            ],
            filters[0]["outputPath"],
        )

    def test_filter_honours_registry_maps_and_preserves_original(self):
        registry = fixture.generate(self.out, "prod-mixed")
        request = registry["scenario"]["publicationFilters"][0]
        excluded = request["excludedUniqueIds"][0]
        retained = "model.proj_bank.model_other"
        manifest = {
            "nodes": {excluded: {}, retained: {}},
            "parent_map": {excluded: [], retained: [excluded]},
            "child_map": {excluded: [retained], retained: []},
        }
        source = Path(request["sourcePath"])
        source.parent.mkdir(parents=True)
        source.write_text(json.dumps(manifest))
        large_org.filtered_publications(self.out, registry)
        filtered = json.loads(Path(request["outputPath"]).read_text())
        self.assertEqual(
            filtered,
            {
                "nodes": {retained: {}},
                "parent_map": {retained: []},
                "child_map": {retained: []},
            },
        )
        self.assertEqual(json.loads(source.read_text()), manifest)
        request["removeChildMapEntries"] = False
        large_org.filtered_publications(self.out, registry)
        self.assertEqual(
            json.loads(Path(request["outputPath"]).read_text())["child_map"],
            manifest["child_map"],
        )
        request["outputPath"] = str(self.out.parent / "escape.json")
        with self.assertRaisesRegex(ValueError, "inside published"):
            large_org.filtered_publications(self.out, registry)

    def test_cache_signature_covers_sql_schema_environment_and_dbt(self):
        registry = fixture.generate(self.out, "prod-mixed")
        dbt = self.out / "dbt"
        dbt.write_text("private dbt")
        env = {"DBT_DATABASE": "synthetic"}
        signature = large_org.bootstrap_signature(self.out, registry, env, dbt)
        self.assertEqual(
            signature, large_org.bootstrap_signature(self.out, registry, env, dbt)
        )
        self.assertNotEqual(
            signature,
            large_org.bootstrap_signature(
                self.out, registry, {"DBT_DATABASE": "changed"}, dbt
            ),
        )
        for filename in (
            "repos/proj_analyst/models/segment_cohort_v3.sql",
            "repos/proj_analyst/models/schema.yml",
            "dbt",
        ):
            path = self.out / filename
            original = path.read_text()
            path.write_text(original + "\n")
            self.assertNotEqual(
                signature, large_org.bootstrap_signature(self.out, registry, env, dbt)
            )
            path.write_text(original)
        cycle = fixture.generate(self.out, "prod-cycle")
        self.assertNotEqual(
            signature, large_org.bootstrap_signature(self.out, cycle, env, dbt)
        )

    def test_classification_includes_and_deduplicates_connection_warnings(self):
        warning = 'dbt source "proj_j" references project "proj_unconnected" which is not connected.'
        operation = {
            "status": {"jobResults": {"connectionWarnings": [warning, warning]}}
        }
        result = large_org.classify(operation, [{"level": "warn", "message": warning}])
        self.assertEqual(result["messages"], [warning])
        self.assertEqual(
            large_org.classify({"status": {"jobResults": None}}, [])["messages"], []
        )

    def test_command_timeouts_cannot_exceed_the_wrapper_budget(self):
        for timeout in (0, -1, 1801):
            with self.assertRaisesRegex(ValueError, "between 1 and 1800"):
                command(["unreachable-command"], self.out, {}, timeout)

    def test_generation_is_deterministic_and_rejects_escaping_paths(self):
        first = fixture.generate(self.out)
        self.assertEqual(first, fixture.generate(self.out))
        outside = Path(self.temporary.name) / "outside"
        outside.write_text("unchanged")
        registry_path = self.out / "registry.json"
        registry_path.unlink()
        registry_path.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "escapes"):
            fixture.generate(self.out)
        self.assertEqual(outside.read_text(), "unchanged")


class ParsedManifestTests(unittest.TestCase):
    @unittest.skipUnless(
        (WORK / "fixtures/prod-mixed/published/proj_bank/manifest.json").exists(),
        "Run the real dbt bootstrap first",
    )
    def test_real_parsed_publications_and_consumer_filter(self):
        for variant in fixture.VARIANTS:
            root = WORK / "fixtures" / variant
            registry = json.loads((root / "registry.json").read_text())
            evidence = fixture.validate_publications(root, registry)
            self.assertEqual(evidence["model_count"], 41)
            self.assertEqual(
                evidence["versioned_ids"],
                sorted(fixture.unique_id(model) for model in fixture.VERSIONED_MODELS),
            )
            self.assertEqual(
                evidence["decoy_ids"],
                sorted(fixture.unique_id(model) for model in fixture.DECOYS),
            )
            for request in registry["scenario"]["publicationFilters"]:
                manifest = json.loads(Path(request["outputPath"]).read_text())
                self.assertIn("model.proj_bank.model_other", manifest["nodes"])
                self.assertNotIn(
                    f"model.proj_bank.{fixture.DUPLICATE}", manifest["nodes"]
                )
                for key in ("parent_map", "child_map"):
                    self.assertTrue(
                        set(request["excludedUniqueIds"]).isdisjoint(manifest[key])
                    )
                    self.assertTrue(
                        all(
                            set(request["excludedUniqueIds"]).isdisjoint(values)
                            for values in manifest[key].values()
                        )
                    )

    @unittest.skipUnless((WORK / "results.json").exists(), "Run measured probes first")
    def test_measured_assertions_replay_and_reject_wrong_messages_or_order(self):
        rows = json.loads((WORK / "results.json").read_text())["runs"]
        for row in rows:
            self.assertEqual(evaluate(row), row["assertions"])
            if row["build"] == "pre" and row["variant"] == "prod-mixed":
                changed = copy.deepcopy(row)
                changed["messages"] = [
                    message.replace(GUIDANCE, "Try again.")
                    for message in row["messages"]
                ]
                self.assertFalse(evaluate(changed)["pass"])
                changed = copy.deepcopy(row)
                changed["events"].reverse()
                self.assertFalse(
                    evaluate(changed)["checks"]["warning_before_stale_error"]["pass"]
                )
                sequence = row["assertions"]["sequence"]
                self.assertGreater(
                    sequence["errors"][0]["index"] - sequence["warnings"][0]["index"], 1
                )
            if row["variant"] == "prod-cycle":
                errors = row["assertions"]["exact_strings"]["cycle_errors"]
                self.assertEqual(len(errors), 1)
                path = (
                    errors[0]
                    .removeprefix(CYCLE_PREFIX)
                    .removesuffix(CYCLE_SUFFIX)
                    .split(" -> ")
                )
                self.assertEqual(path[0], path[-1])
                self.assertEqual(len(set(path)), 14)
                changed = copy.deepcopy(row)
                changed["messages"] = [
                    message.replace(path[1] + " -> ", "") for message in row["messages"]
                ]
                self.assertFalse(
                    evaluate(changed)["checks"]["exact_closed_cycle_message"]["pass"]
                )


if __name__ == "__main__":
    unittest.main()
